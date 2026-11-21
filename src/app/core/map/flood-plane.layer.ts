import { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap, MercatorCoordinate } from 'maplibre-gl';

const GRID_COLS = 28;
const GRID_ROWS = 20;
const MIN_LNG = 16.86;
const MAX_LNG = 17.18;
const MIN_LAT = 51.04;
const MAX_LAT = 51.18;

/**
 * Custom 3D WebGL layer rendering a real-elevation (1:1 m a.s.l., zero vertical exaggeration)
 * flood water rectangle across Wrocław that intersects the MapLibre EU-DEM terrain via the
 * shared WebGL depth buffer.
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
  private trestnoMasl = 95;
  private redzinMasl = 95;
  private dirty = true;

  private readonly vertexData = new Float32Array((GRID_COLS + 1) * (GRID_ROWS + 1) * 3);
  private readonly matrix32 = new Float32Array(16);

  setWaterLevel(active: boolean, trestnoMasl: number, redzinMasl: number): void {
    const changed =
      this.active !== active ||
      Math.abs(this.trestnoMasl - trestnoMasl) > 0.02 ||
      Math.abs(this.redzinMasl - redzinMasl) > 0.02;
    this.active = active;
    this.trestnoMasl = trestnoMasl;
    this.redzinMasl = redzinMasl;
    if (changed) {
      this.dirty = true;
      this.map?.triggerRepaint();
    }
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
    let ptr = 0;
    for (let r = 0; r <= GRID_ROWS; r++) {
      const lat = MIN_LAT + (r / GRID_ROWS) * (MAX_LAT - MIN_LAT);
      for (let c = 0; c <= GRID_COLS; c++) {
        const lng = MIN_LNG + (c / GRID_COLS) * (MAX_LNG - MIN_LNG);
        // Natural SE -> NW slope from Trestno (17.14°E, 51.07°N) to Rędzin (16.92°E, 51.16°N)
        const tRaw = ((17.14 - lng) * 0.7 + (lat - 51.07) * 0.6) / 0.24;
        const t = Math.max(0, Math.min(1, tRaw));
        const elevMasl = this.trestnoMasl + (this.redzinMasl - this.trestnoMasl) * t;
        const mc = MercatorCoordinate.fromLngLat([lng, lat], elevMasl);
        this.vertexData[ptr++] = mc.x;
        this.vertexData[ptr++] = mc.y;
        this.vertexData[ptr++] = mc.z;
      }
    }
  }
}
