import { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap, MercatorCoordinate } from 'maplibre-gl';
import {
  DEM_GRID_COLS,
  DEM_GRID_ELEV_DM,
  DEM_MAX_LAT,
  DEM_MAX_LNG,
  DEM_MIN_LAT,
  DEM_MIN_LNG
} from '../data/www-dem-grid.data';
import { DEM_GRID_ROWS } from '../data/www-dem-grid.data';
import { FloodBasinLevel, FloodPlaneState } from '../services/hydrology.service';

// Relative-To-Center (RTC) Mercator origin computed in 64-bit float so WebGL Float32 vertex
// attributes retain sub-millimetre precision at every zoom level (z=6.5..18) without jitter.
const RTC_ORIGIN = MercatorCoordinate.fromLngLat([17.02, 51.13], 115.0);

/**
 * Custom 3D WebGL layer rendering progressive, spatially localized ISOK-inspired flood
 * inundation from a pre-baked `96x72` EU-DEM heightfield (`www-dem-grid.data.ts`).
 *
 * Why pre-baked DEM + 64-bit RTC instead of raw WebGL depth-testing against live DEM tiles:
 *  - Live MapLibre DEM tiles swap LOD meshes at each zoom level, shifting local heights by +/-1-4m
 *    and causing water to clip inconsistently on every zoom change.
 *  - Here, sub-cell water depth (`localWaterMasl - prebakedGroundMasl`) is computed in JS and
 *    interpolated smoothly across GPU triangles (`if (v_depth <= 0.0) discard;`), yielding
 *    rock-solid, zoom-invariant topographic flood shorelines rendered cleanly underneath 3D canals,
 *    embankments, weirs, and buildings.
 */
export class FloodWaterPlaneLayer implements CustomLayerInterface {
  readonly id = 'flood-water-plane';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private program: WebGLProgram | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private idxBuffer: WebGLBuffer | null = null;
  private indexCount = 0;

  private active = false;
  private basins: FloodBasinLevel[] = [];
  private signature = '';
  private dirty = true;

  // 4 floats per vertex: [rtcX, rtcY, rtcZ, waterDepthM]
  private readonly vertexData = new Float32Array((DEM_GRID_COLS + 1) * (DEM_GRID_ROWS + 1) * 4);
  private readonly matrix32 = new Float32Array(16);

  setFloodState(state: FloodPlaneState): void {
    const sig = state.active
      ? state.basins.map(b => `${b.id}:${b.waterMasl.toFixed(2)}`).join('|')
      : 'inactive';
    if (sig === this.signature) return;

    this.signature = sig;
    this.active = state.active;
    this.basins = state.basins;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;

    const vertSrc = `
      precision highp float;
      uniform mat4 u_matrix;
      attribute vec3 a_pos;
      attribute float a_depth;
      varying float v_depth;
      void main() {
        v_depth = a_depth;
        gl_Position = u_matrix * vec4(a_pos, 1.0);
      }
    `;
    const fragSrc = `
      precision highp float;
      varying float v_depth;
      void main() {
        if (v_depth <= 0.0) discard;
        // Feather shoreline smoothly over the first 12 cm of depth
        float edge = smoothstep(0.0, 0.12, v_depth);
        // Depth-graduated inundation palette: shallow sky-blue -> deep flood cobalt
        float deepT = clamp((v_depth - 0.15) / 2.6, 0.0, 1.0);
        vec3 shallowCol = vec3(0.18, 0.62, 0.96);
        vec3 deepCol    = vec3(0.06, 0.28, 0.78);
        vec3 col = mix(shallowCol, deepCol, deepT);
        float alpha = mix(0.38, 0.68, deepT) * edge;
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vertSrc);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragSrc);
    gl.compileShader(fs);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.program = prog;

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.posBuffer = gl.createBuffer();
    this.idxBuffer = gl.createBuffer();

    const indices: number[] = [];
    const stride = DEM_GRID_COLS + 1;
    for (let r = 0; r < DEM_GRID_ROWS; r++) {
      for (let c = 0; c < DEM_GRID_COLS; c++) {
        const i0 = r * stride + c;
        const i1 = i0 + 1;
        const i2 = i0 + stride;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
    this.indexCount = indices.length;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    this.dirty = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    if (this.program) gl.deleteProgram(this.program);
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
    if (this.idxBuffer) gl.deleteBuffer(this.idxBuffer);
    this.program = null;
    this.posBuffer = null;
    this.idxBuffer = null;
    this.map = null;
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.active || !this.program || !this.posBuffer || !this.idxBuffer) return;

    if (this.dirty) {
      this.rebuildVertices();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);
      this.dirty = false;
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    }

    gl.useProgram(this.program);

    const floatBytes = 4;
    const strideBytes = 4 * floatBytes;
    const aPos = gl.getAttribLocation(this.program, 'a_pos');
    const aDepth = gl.getAttribLocation(this.program, 'a_depth');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, strideBytes, 0);
    gl.enableVertexAttribArray(aDepth);
    gl.vertexAttribPointer(aDepth, 1, gl.FLOAT, false, strideBytes, 3 * floatBytes);

    // Compute RTC translation column in 64-bit JS double precision before Float32 uniform upload
    const rawMatrix = options.defaultProjectionData?.mainMatrix ?? options.modelViewProjectionMatrix;
    for (let i = 0; i < 12; i++) {
      this.matrix32[i] = rawMatrix[i];
    }
    const ox = RTC_ORIGIN.x;
    const oy = RTC_ORIGIN.y;
    const oz = RTC_ORIGIN.z;
    for (let r = 0; r < 4; r++) {
      this.matrix32[12 + r] =
        rawMatrix[r] * ox +
        rawMatrix[4 + r] * oy +
        rawMatrix[8 + r] * oz +
        rawMatrix[12 + r];
    }

    const uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
    gl.uniformMatrix4fv(uMatrix, false, this.matrix32);

    // Disable depth-buffer fighting against zoom-dependent DEM tiles; this layer is ordered below
    // canals-3d / embankments-3d / buildings-3d so 3D infrastructure draws cleanly on top.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aDepth);
  }

  private rebuildVertices(): void {
    const active = this.active && this.basins.length > 0;
    const ox = RTC_ORIGIN.x;
    const oy = RTC_ORIGIN.y;
    const oz = RTC_ORIGIN.z;
    let ptr = 0;
    let demIdx = 0;

    for (let r = 0; r <= DEM_GRID_ROWS; r++) {
      const lat = DEM_MIN_LAT + (r / DEM_GRID_ROWS) * (DEM_MAX_LAT - DEM_MIN_LAT);
      for (let c = 0; c <= DEM_GRID_COLS; c++) {
        const lng = DEM_MIN_LNG + (c / DEM_GRID_COLS) * (DEM_MAX_LNG - DEM_MIN_LNG);
        const groundMasl = DEM_GRID_ELEV_DM[demIdx++] / 10;

        let depthM = -2.0;
        let elevMasl = groundMasl;

        if (active) {
          let totalWeight = 0;
          let weightedWaterMasl = 0;
          let maxInfluence = 0;

          for (const b of this.basins) {
            const dx = (lng - b.center[0]) / b.radii[0];
            const dy = (lat - b.center[1]) / b.radii[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= 1.35) continue;

            const raw =
              dist <= 0.78
                ? 1.0
                : 0.5 * (1 + Math.cos(Math.PI * ((dist - 0.78) / 0.57)));
            const w = raw * raw;
            if (w > 0.001) {
              totalWeight += w;
              weightedWaterMasl += w * b.waterMasl;
              if (raw > maxInfluence) maxInfluence = raw;
            }
          }

          if (totalWeight > 0.001) {
            const localWaterMasl = weightedWaterMasl / totalWeight;
            const rawDepth = localWaterMasl - groundMasl;
            // Attenuate water depth cleanly near basin margin so flood never leaks past basin rim
            const rimAtten = maxInfluence >= 0.7 ? 1.0 : maxInfluence / 0.7;
            depthM = rawDepth * rimAtten - (1 - rimAtten) * 1.5;
            if (depthM > 0) {
              elevMasl = Math.max(groundMasl, localWaterMasl);
            }
          }
        }

        const mc = MercatorCoordinate.fromLngLat([lng, lat], elevMasl);
        this.vertexData[ptr++] = mc.x - ox;
        this.vertexData[ptr++] = mc.y - oy;
        this.vertexData[ptr++] = mc.z - oz;
        this.vertexData[ptr++] = depthM;
      }
    }
  }
}
