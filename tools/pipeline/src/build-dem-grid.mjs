/**
 * Fetches z=12 AWS Terrarium DEM PNG tiles across the Wrocław Water Node corridor
 * and pre-bakes a 97x73 real EU-DEM heightfield (`DEM_GRID_ELEV_DM`) aligned with
 * `FloodWaterPlaneLayer`, eliminating zoom-level DEM LOD jitter and clipping.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const GRID_COLS = 96;
const GRID_ROWS = 72;
const MIN_LNG = 16.86;
const MAX_LNG = 17.18;
const MIN_LAT = 51.045;
const MAX_LAT = 51.215;
const DEM_ZOOM = 12;

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf) {
  let offset = 8; // skip PNG signature
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idatChunks = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rowIn + x];
      const a = x >= bpp ? pixels[rowOut + x - bpp] : 0;
      const b = y > 0 ? pixels[rowOut - stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[rowOut - stride + x - bpp] : 0;
      let recon = val;
      if (filterType === 1) recon = (val + a) & 0xff;
      else if (filterType === 2) recon = (val + b) & 0xff;
      else if (filterType === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) recon = (val + paethPredictor(a, b, c)) & 0xff;
      pixels[rowOut + x] = recon;
    }
  }
  return { width, height, bpp, pixels };
}

function lngLatToTileFrac(lng, lat, z) {
  const n = 1 << z;
  const fx = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { fx, fy };
}

function sampleTileElev(tile, px, py) {
  const { width, height, bpp, pixels } = tile;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(px)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(py)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;

  const elevAt = (x, y) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const i = (cy * width + cx) * bpp;
    return pixels[i] * 256 + pixels[i + 1] + pixels[i + 2] / 256 - 32768;
  };
  // Light 3x3 binomial smoothing suppresses rooftop/canopy SRTM spikes while keeping true valley shape
  const smoothAt = (x, y) =>
    (elevAt(x - 1, y - 1) + 2 * elevAt(x, y - 1) + elevAt(x + 1, y - 1) +
      2 * elevAt(x - 1, y) + 4 * elevAt(x, y) + 2 * elevAt(x + 1, y) +
      elevAt(x - 1, y + 1) + 2 * elevAt(x, y + 1) + elevAt(x + 1, y + 1)) /
    16;
  const e00 = smoothAt(x0, y0);
  const e10 = smoothAt(x1, y0);
  const e01 = smoothAt(x0, y1);
  const e11 = smoothAt(x1, y1);
  const e0 = e00 + (e10 - e00) * tx;
  const e1 = e01 + (e11 - e01) * tx;
  return e0 + (e1 - e0) * ty;
}

const topLeft = lngLatToTileFrac(MIN_LNG, MAX_LAT, DEM_ZOOM);
const botRight = lngLatToTileFrac(MAX_LNG, MIN_LAT, DEM_ZOOM);
const txMin = Math.floor(topLeft.fx);
const txMax = Math.floor(botRight.fx);
const tyMin = Math.floor(topLeft.fy);
const tyMax = Math.floor(botRight.fy);

console.log(`Fetching z=${DEM_ZOOM} Terrarium tiles x=${txMin}..${txMax}, y=${tyMin}..${tyMax}...`);
const tiles = new Map();
for (let ty = tyMin; ty <= tyMax; ty++) {
  for (let tx = txMin; tx <= txMax; tx++) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/${tx}/${ty}.png`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    tiles.set(`${tx}/${ty}`, decodePng(buf));
  }
}
console.log(`Decoded ${tiles.size} DEM tiles.`);

const elevDm = new Int16Array((GRID_COLS + 1) * (GRID_ROWS + 1));
let minM = 9999;
let maxM = -9999;
let ptr = 0;

for (let r = 0; r <= GRID_ROWS; r++) {
  const lat = MIN_LAT + (r / GRID_ROWS) * (MAX_LAT - MIN_LAT);
  for (let c = 0; c <= GRID_COLS; c++) {
    const lng = MIN_LNG + (c / GRID_COLS) * (MAX_LNG - MIN_LNG);
    const { fx, fy } = lngLatToTileFrac(lng, lat, DEM_ZOOM);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const tile = tiles.get(`${tx}/${ty}`);
    const px = (fx - tx) * tile.width;
    const py = (fy - ty) * tile.height;
    const m = sampleTileElev(tile, px, py);
    minM = Math.min(minM, m);
    maxM = Math.max(maxM, m);
    elevDm[ptr++] = Math.round(m * 10);
  }
}

console.log(`Sampled ${elevDm.length} vertices (elev ${minM.toFixed(1)} m .. ${maxM.toFixed(1)} m a.s.l.)`);

// Inspect actual minimum / 15th-percentile elevation around each ISOK flood basin
const BASINS = [
  { id: 'opatowice-bierdzany', center: [17.090, 51.088], radii: [0.030, 0.018] },
  { id: 'przedmiescie-olawskie', center: [17.059, 51.095], radii: [0.024, 0.015] },
  { id: 'kowale-swojczyce', center: [17.098, 51.116], radii: [0.028, 0.020] },
  { id: 'ostrow-tumski', center: [17.038, 51.112], radii: [0.022, 0.010] },
  { id: 'kozanow-pilczyce', center: [16.985, 51.124], radii: [0.032, 0.020] },
  { id: 'nadodrze-olbin', center: [17.042, 51.121], radii: [0.022, 0.012] },
  { id: 'pracze-odrzanskie', center: [16.932, 51.182], radii: [0.045, 0.028] },
  { id: 'wielka-wyspa', center: [17.078, 51.110], radii: [0.022, 0.015] }
];
for (const b of BASINS) {
  const vals = [];
  for (let r = 0; r <= GRID_ROWS; r++) {
    const lat = MIN_LAT + (r / GRID_ROWS) * (MAX_LAT - MIN_LAT);
    for (let c = 0; c <= GRID_COLS; c++) {
      const lng = MIN_LNG + (c / GRID_COLS) * (MAX_LNG - MIN_LNG);
      const dx = (lng - b.center[0]) / b.radii[0];
      const dy = (lat - b.center[1]) / b.radii[1];
      if (dx * dx + dy * dy <= 0.85) vals.push(elevDm[r * (GRID_COLS + 1) + c] / 10);
    }
  }
  vals.sort((x, y) => x - y);
  const p15 = vals[Math.floor(vals.length * 0.15)];
  const p50 = vals[Math.floor(vals.length * 0.50)];
  const p90 = vals[Math.floor(vals.length * 0.90)];
  console.log(`Basin ${b.id}: n=${vals.length}, min=${vals[0].toFixed(1)}, p15=${p15.toFixed(1)}, med=${p50.toFixed(1)}, p90=${p90.toFixed(1)}`);
}

const ts = `// Auto-generated by tools/pipeline/src/build-dem-grid.mjs from z=${DEM_ZOOM} AWS Terrarium EU-DEM tiles
export const DEM_GRID_COLS = ${GRID_COLS};
export const DEM_GRID_ROWS = ${GRID_ROWS};
export const DEM_MIN_LNG = ${MIN_LNG};
export const DEM_MAX_LNG = ${MAX_LNG};
export const DEM_MIN_LAT = ${MIN_LAT};
export const DEM_MAX_LAT = ${MAX_LAT};

/** Pre-baked real EU-DEM ground elevation in decimetres (m a.s.l. * 10), row-major (MIN_LAT -> MAX_LAT, MIN_LNG -> MAX_LNG). */
export const DEM_GRID_ELEV_DM = new Int16Array([
${Array.from(elevDm).join(',')}
]);
`;

fs.writeFileSync('/workspace/src/app/core/data/www-dem-grid.data.ts', ts);
console.log('✔ Wrote /workspace/src/app/core/data/www-dem-grid.data.ts');
