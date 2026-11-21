import { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap, MercatorCoordinate } from 'maplibre-gl';
import { FloodBasinLevel, FloodPlaneState } from '../services/hydrology.service';

const GRID_COLS = 72;
const GRID_ROWS = 52;
const MIN_LNG = 16.92;
const MAX_LNG = 17.17;
const MIN_LAT = 51.045;
const MAX_LAT = 51.165;
const HIDDEN_ELEV_MASL = 85.0;

/**
 * Custom 3D WebGL layer rendering a spatially localized, real-elevation (1:1 m a.s.l., zero
 * vertical exaggeration) flood water surface across Wrocław's hydrotechnical basins.
 * Only overtopped or breached basins rise above the MapLibre EU-DEM terrain; safe sectors stay
 * buried below ground at 85 m a.s.l. so inundation spreads stage-by-stage across real topography.
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

  private readonly vertexData = new Float32Array((GRID_COLS + 1) * (GRID_ROWS + 1) * 3);
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
      uniform mat4 u_matrix;
      attribute vec3 a_pos;
      void main() {
        gl_Position = u_matrix * vec4(a_pos, 1.0);
      }
    `;
    const fragSrc = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
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
    const stride = GRID_COLS + 1;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
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

    const aPos = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    const uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
    const rawMatrix = options.defaultProjectionData?.mainMatrix ?? options.modelViewProjectionMatrix;
    for (let i = 0; i < 16; i++) this.matrix32[i] = rawMatrix[i];
    gl.uniformMatrix4fv(uMatrix, false, this.matrix32);

    // Premultiplied alpha blue flood water sheet (alpha = 0.52)
    const uColor = gl.getUniformLocation(this.program, 'u_color');
    const a = 0.52;
    gl.uniform4f(uColor, 0.08 * a, 0.42 * a, 0.92 * a, a);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.depthMask(true);
    gl.disableVertexAttribArray(aPos);
  }

  private rebuildVertices(): void {
    const active = this.active && this.basins.length > 0;
    let ptr = 0;

    for (let r = 0; r <= GRID_ROWS; r++) {
      const lat = MIN_LAT + (r / GRID_ROWS) * (MAX_LAT - MIN_LAT);
      for (let c = 0; c <= GRID_COLS; c++) {
        const lng = MIN_LNG + (c / GRID_COLS) * (MAX_LNG - MIN_LNG);

        let elevMasl = HIDDEN_ELEV_MASL;
        if (active) {
          let totalWeight = 0;
          let weightedWaterMasl = 0;
          let maxInfluence = 0;

          for (const b of this.basins) {
            const dx = (lng - b.center[0]) / b.radii[0];
            const dy = (lat - b.center[1]) / b.radii[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= 1.55) continue;

            // Flat plateau inside the basin (dist <= 0.8), smooth cosine skirt out to 1.55
            const raw = dist <= 0.8 ? 1.0 : 0.5 * (1 + Math.cos(Math.PI * ((dist - 0.8) / 0.75)));
            const w = raw * raw;
            if (w > 0.001) {
              totalWeight += w;
              weightedWaterMasl += w * b.waterMasl;
              if (raw > maxInfluence) maxInfluence = raw;
            }
          }

          if (totalWeight > 0.001) {
            const localWaterMasl = weightedWaterMasl / totalWeight;
            // Inside the basin (maxInfluence >= 0.75) hold horizontal true m a.s.l. so EU-DEM terrain
            // naturally shapes the flooded contours; drop rapidly underground outside the skirt.
            const levelFactor = maxInfluence >= 0.75 ? 1.0 : maxInfluence / 0.75;
            elevMasl = HIDDEN_ELEV_MASL + (localWaterMasl - HIDDEN_ELEV_MASL) * levelFactor;
          }
        }

        const mc = MercatorCoordinate.fromLngLat([lng, lat], elevMasl);
        this.vertexData[ptr++] = mc.x;
        this.vertexData[ptr++] = mc.y;
        this.vertexData[ptr++] = mc.z;
      }
    }
  }
}
