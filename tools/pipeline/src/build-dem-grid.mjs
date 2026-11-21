/**
 * Fetches z=12 AWS Terrarium DEM PNG tiles + official PGW Wody Polskie ISOK Flood Hazard Maps
 * (MZP INSPIRE WFS `nz-core:HazardArea`, Q10% / Q1% / Q0.2% / levee-breach) across the Wrocław
 * Water Node corridor, combining them with OSM river channels, embankments, and floodplain basins
 * (`www-lod1.json`) to pre-bake:
 *   1. `DEM_GRID_ELEV_DM`     — smooth 96x72 EU-DEM ground elevation (dm a.s.l.)
 *   2. `DEM_GRID_ZONE_CODE`   — hydrological barrier zone per vertex:
 *        -1     : upland / dry outside ISOK floodplain (incl. Maślice)
 *        0..8   : embanked protected basin (`zawale`) — stays dry while embankment holds
 *        10..17 : inter-embankment floodway (`międzywale`) — wets immediately above 3,100 m³/s
 *   3. `DEM_GRID_REL_ELEV_DM` — ISOK-weighted height above local zone/floodway floor (dm)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const GRID_COLS = 96;
const GRID_ROWS = 72;
const MIN_LNG = 16.86;
const MAX_LNG = 17.18;
const MIN_LAT = 51.045;
const MAX_LAT = 51.215;
const DEM_ZOOM = 12;

const ISOK_WFS_BASE = 'https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WFS';
const ISOK_CACHE_PATH = '/workspace/tools/pipeline/data/isok-mzp-wroclaw.json';

export const BASIN_IDS = [
  'polder-blizanowice-trestno', // 0
  'opatowice-bierdzany',        // 1
  'przedmiescie-olawskie',      // 2
  'kowale-swojczyce',           // 3
  'ostrow-tumski',              // 4
  'kozanow-pilczyce',           // 5
  'nadodrze-olbin',             // 6
  'pracze-odrzanskie',          // 7
  'wielka-wyspa'                // 8
];
const BASIN_INDEX = new Map(BASIN_IDS.map((id, i) => [id, i]));

// Map river/canal branch ID -> międzywale sector index (0..7) -> stored as 10 + idx
const BRANCH_TO_MIEDZYWALE_SECTOR = new Map([
  ['odra-upper', 0],
  ['przewal-widawski', 1],
  ['kanal-powodziowy', 2],
  ['kanal-zeglugowy', 2],
  ['odra-miejska-upper', 3],
  ['olawa-river', 3],
  ['przekop-szczytnicki', 4],
  ['stara-odra', 4],
  ['srodmiescie', 5],
  ['kanal-miejski', 5],
  ['odra-redzin', 6],
  ['sleza-river', 6],
  ['bystrzyca-river', 7]
]);

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
  let offset = 8;
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

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng, lat, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    if (!pointInRing(lng, lat, geom.coordinates[0])) return false;
    for (let h = 1; h < geom.coordinates.length; h++) {
      if (pointInRing(lng, lat, geom.coordinates[h])) return false;
    }
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInRing(lng, lat, poly[0])) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (pointInRing(lng, lat, poly[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const ccw = (p1x, p1y, p2x, p2y, p3x, p3y) =>
    (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
  return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
    ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

function computeGeomBbox(geom) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polys = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) {
    for (const pt of poly[0] || []) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }
  return [minX, minY, maxX, maxY];
}

async function loadIsokHazardFeatures() {
  if (fs.existsSync(ISOK_CACHE_PATH)) {
    const cached = JSON.parse(fs.readFileSync(ISOK_CACHE_PATH, 'utf8'));
    console.log(`Loaded ${cached.features.length} cached ISOK MZP HazardArea features (${cached.acquiredDate})`);
    return cached;
  }

  console.log('Fetching official PGW Wody Polskie ISOK MZP HazardArea features via INSPIRE WFS...');
  const pageSize = 100;
  let startIndex = 0;
  let totalExpected = Infinity;
  const rawFeatures = [];

  while (startIndex < totalExpected) {
    const url =
      `${ISOK_WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeNames=nz-core:HazardArea` +
      `&bbox=${MIN_LAT},${MIN_LNG},${MAX_LAT},${MAX_LNG},urn:ogc:def:crs:EPSG::4258` +
      `&count=${pageSize}&startIndex=${startIndex}&outputFormat=application/json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`ISOK WFS HTTP ${resp.status}`);
    const page = await resp.json();
    const total = Number(page.totalFeatures ?? page.numberMatched ?? page.features?.length ?? 0);
    if (Number.isFinite(total) && total > 0) totalExpected = total;
    const batch = page.features || [];
    if (batch.length === 0) break;
    rawFeatures.push(...batch);
    if (batch.length < pageSize) break;
    startIndex += batch.length;
  }

  const seenIds = new Set();
  const compactFeatures = rawFeatures.flatMap(f => {
    const id = f.properties?.identifier?.value ?? f.id;
    if (seenIds.has(id)) return [];
    seenIds.add(id);
    const lo = f.properties?.likelihoodOfOccurrence?.LikelihoodOfOccurrence;
    const ql = String(lo?.qualitativeLikelihood ?? '');
    const rp = Number(lo?.quantitativeLikelihood?.QuantitativeLikelihood?.returnPeriod ?? 0);
    let tier = 'q100-breach';
    if (ql.includes('Q 10%')) tier = 'q10';
    else if (ql.includes('Q 0,2%')) tier = 'q500';
    else if (ql.includes('Q 1%') && !ql.includes('zniszczenia')) tier = 'q100-intact';
    return [{
      id,
      tier,
      returnPeriod: rp,
      qualitativeLikelihood: ql,
      geometry: f.geometry
    }];
  });

  const payload = {
    sourceUrl: ISOK_WFS_BASE,
    namespace: 'PL.ZIPGW.6453/MZP-MRP',
    acquiredDate: new Date().toISOString().slice(0, 10),
    features: compactFeatures
  };
  fs.mkdirSync(path.dirname(ISOK_CACHE_PATH), { recursive: true });
  fs.writeFileSync(ISOK_CACHE_PATH, JSON.stringify(payload));
  console.log(`✔ Cached ${compactFeatures.length} ISOK MZP HazardArea features to ${ISOK_CACHE_PATH}`);
  return payload;
}

const isokData = await loadIsokHazardFeatures();
const isokByTier = {
  q10: [],
  'q100-intact': [],
  q500: [],
  'q100-breach': []
};
for (const f of isokData.features) {
  if (!f.geometry || !isokByTier[f.tier]) continue;
  if (/budowli/i.test(f.qualitativeLikelihood || '')) continue;
  const bbox = computeGeomBbox(f.geometry);
  if (bbox[2] < MIN_LNG || bbox[0] > MAX_LNG || bbox[3] < MIN_LAT || bbox[1] > MAX_LAT) continue;
  isokByTier[f.tier].push({ bbox, geometry: f.geometry });
}
console.log(
  `ISOK tiers in Wrocław grid -> Q10%: ${isokByTier.q10.length}, Q1% intact: ${isokByTier['q100-intact'].length}, Q0.2%: ${isokByTier.q500.length}, Q1% breach: ${isokByTier['q100-breach'].length}`
);

function inIsokTier(lng, lat, list) {
  for (const item of list) {
    const b = item.bbox;
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    if (pointInGeometry(lng, lat, item.geometry)) return true;
  }
  return false;
}

// 1. Fetch & decode z=12 Terrarium DEM tiles
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

const totalVerts = (GRID_COLS + 1) * (GRID_ROWS + 1);
const elevDm = new Int16Array(totalVerts);
const vertLng = new Float64Array(totalVerts);
const vertLat = new Float64Array(totalVerts);

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
    elevDm[ptr] = Math.round(sampleTileElev(tile, px, py) * 10);
    vertLng[ptr] = lng;
    vertLat[ptr] = lat;
    ptr++;
  }
}

// 2. Load real OSM vectors from www-lod1.json for embankment barrier & floodplain classification
const lod1 = JSON.parse(fs.readFileSync('/workspace/src/assets/data/www-lod1.json', 'utf8'));

// Sample river channel points (excluding small isolated urban fountains)
const riverPts = [];
for (const cf of lod1.canals.features) {
  if (/fontanna/i.test(cf.properties?.name || '')) continue;
  const branchId = cf.properties?.id || 'odra-upper';
  const sectorIdx = BRANCH_TO_MIEDZYWALE_SECTOR.get(branchId) ?? 0;
  const rings = cf.geometry.type === 'Polygon' ? [cf.geometry.coordinates[0]] : cf.geometry.coordinates.map(p => p[0]);
  for (const ring of rings) {
    const step = Math.max(1, Math.floor(ring.length / 18));
    for (let i = 0; i < ring.length; i += step) {
      riverPts.push([ring[i][0], ring[i][1], sectorIdx]);
    }
  }
}

// Build flat array of OSM embankment boundary edges [ax, ay, bx, by, minX, minY, maxX, maxY]
const dykeEdges = [];
for (const ef of lod1.embankments.features) {
  const rings = ef.geometry.type === 'Polygon' ? [ef.geometry.coordinates[0]] : ef.geometry.coordinates.map(p => p[0]);
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      dykeEdges.push([
        a[0],
        a[1],
        b[0],
        b[1],
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1])
      ]);
    }
  }
}

function segmentCrossesDyke(px, py, rx, ry) {
  const minX = Math.min(px, rx);
  const maxX = Math.max(px, rx);
  const minY = Math.min(py, ry);
  const maxY = Math.max(py, ry);
  for (const e of dykeEdges) {
    if (e[6] < minX || e[4] > maxX || e[7] < minY || e[5] > maxY) continue;
    if (segmentsIntersect(px, py, rx, ry, e[0], e[1], e[2], e[3])) return true;
  }
  return false;
}

const mPerLon = 111195 * Math.cos((51.12 * Math.PI) / 180);
const mPerLat = 111195;

// Index basin features in BASIN_IDS order
const basinGeoms = BASIN_IDS.map(id =>
  lod1.depressions.features.find(f => f.properties?.id === id)?.geometry ?? null
);

const zoneCode = new Int8Array(totalVerts).fill(-1);
const isokTierOffsetDm = new Int16Array(totalVerts).fill(14);
for (let i = 0; i < totalVerts; i++) {
  const lng = vertLng[i];
  const lat = vertLat[i];

  // Official ISOK MZP hazard tier lookup at this vertex
  const inQ10 = inIsokTier(lng, lat, isokByTier.q10);
  const inQ100Intact = inQ10 || inIsokTier(lng, lat, isokByTier['q100-intact']);
  const inQ500 = inQ100Intact || inIsokTier(lng, lat, isokByTier.q500);
  const inQ100Breach = inIsokTier(lng, lat, isokByTier['q100-breach']);
  const inAnyIsok = inQ500 || inQ100Breach;

  if (inQ10) isokTierOffsetDm[i] = 0;
  else if (inQ100Intact) isokTierOffsetDm[i] = 2;
  else if (inQ500) isokTierOffsetDm[i] = 5;
  else if (inQ100Breach) isokTierOffsetDm[i] = 9;

  // Find nearest river channel point + sector
  let bestDist2 = Infinity;
  let nearestRiver = riverPts[0];
  for (const rp of riverPts) {
    const dx = (lng - rp[0]) * mPerLon;
    const dy = (lat - rp[1]) * mPerLat;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      nearestRiver = rp;
    }
  }
  const distToRiverM = Math.sqrt(bestDist2);

  // Check OSM depressed basin membership
  let inBasinIdx = -1;
  for (let b = 0; b < BASIN_IDS.length; b++) {
    if (pointInGeometry(lng, lat, basinGeoms[b])) {
      inBasinIdx = b;
      break;
    }
  }
  // shortcut: clip western tail of OSM Pilczyce boundary instead of splitting district relation manually
  if (inBasinIdx === 5 && (lng < 16.968 || lat > 51.140)) {
    inBasinIdx = -1;
  }

  // Retention polder Blizanowice-Trestno behaves as a controlled polder zone (code 0)
  if (inBasinIdx === 0) {
    zoneCode[i] = 0;
    continue;
  }

  const protectedByDyke = segmentCrossesDyke(lng, lat, nearestRiver[0], nearestRiver[1]);

  if (inBasinIdx > 0) {
    // Inside a Wrocław floodplain district:
    // If on the riverfront międzywale (no dyke between vertex & river and inside ISOK Q10%/Q1% or <165 m),
    // classify as unembanked międzywale; otherwise classify as embanked zawale basin (0..8)
    // when inside official ISOK flood hazard extent (Q0.2% or levee-breach) or close floodplain floor.
    if (!protectedByDyke && inBasinIdx !== 4 && (distToRiverM <= 165 || inQ100Intact)) {
      zoneCode[i] = 10 + nearestRiver[2];
    } else if (inAnyIsok || distToRiverM <= 650) {
      zoneCode[i] = inBasinIdx;
    }
  } else if (!protectedByDyke && (inQ100Intact || distToRiverM <= 95)) {
    // Inter-dyke floodway corridor along Widawa, Odra, Bystrzyca defined by official ISOK Q10%/Q1%
    zoneCode[i] = 10 + nearestRiver[2];
  }
}

// Compute local zone floor elevation (12th percentile ground elevation inside each zone/sector)
// and combine with ISOK return-period tier offset (dm) so inundation progresses Q10% -> Q1% -> Q0.2%.
const zoneElevs = new Map();
for (let i = 0; i < totalVerts; i++) {
  const zc = zoneCode[i];
  if (zc < 0) continue;
  if (!zoneElevs.has(zc)) zoneElevs.set(zc, []);
  zoneElevs.get(zc).push(elevDm[i]);
}
const zoneFloorDm = new Map();
for (const [zc, arr] of zoneElevs.entries()) {
  const sorted = [...arr].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.12)] ?? sorted[0];
  zoneFloorDm.set(zc, floor);
}

const relElevDm = new Int16Array(totalVerts);
for (let i = 0; i < totalVerts; i++) {
  const zc = zoneCode[i];
  if (zc < 0) {
    relElevDm[i] = 999;
  } else {
    const floor = zoneFloorDm.get(zc) ?? elevDm[i];
    relElevDm[i] = Math.max(0, elevDm[i] - floor) + isokTierOffsetDm[i];
  }
}

let miedzywaleVerts = 0;
let zawaleVerts = 0;
for (let i = 0; i < totalVerts; i++) {
  if (zoneCode[i] >= 10) miedzywaleVerts++;
  else if (zoneCode[i] >= 0) zawaleVerts++;
}
console.log(`Classified ${totalVerts} vertices -> międzywale: ${miedzywaleVerts}, zawale (embanked): ${zawaleVerts}, upland: ${totalVerts - miedzywaleVerts - zawaleVerts}`);
for (let b = 0; b < BASIN_IDS.length; b++) {
  const cnt = zoneElevs.get(b)?.length ?? 0;
  const fl = ((zoneFloorDm.get(b) ?? 1150) / 10).toFixed(1);
  console.log(`  Zawale [${b}] ${BASIN_IDS[b]}: ${cnt} verts, floor=${fl} m`);
}
for (let s = 0; s < 8; s++) {
  const cnt = zoneElevs.get(10 + s)?.length ?? 0;
  const fl = ((zoneFloorDm.get(10 + s) ?? 1150) / 10).toFixed(1);
  console.log(`  Międzywale [${10 + s}] sector ${s}: ${cnt} verts, floor=${fl} m`);
}

const ts = `// Auto-generated by tools/pipeline/src/build-dem-grid.mjs from z=${DEM_ZOOM} AWS Terrarium EU-DEM + PGW Wody Polskie ISOK MZP WFS (${isokData.acquiredDate}) + OSM embankments
export const ISOK_MZP_METADATA = {
  sourceUrl: '${isokData.sourceUrl}',
  namespace: '${isokData.namespace}',
  featureCount: ${isokData.features.length},
  acquiredDate: '${isokData.acquiredDate}'
} as const;

export const DEM_GRID_COLS = ${GRID_COLS};
export const DEM_GRID_ROWS = ${GRID_ROWS};
export const DEM_MIN_LNG = ${MIN_LNG};
export const DEM_MAX_LNG = ${MAX_LNG};
export const DEM_MIN_LAT = ${MIN_LAT};
export const DEM_MAX_LAT = ${MAX_LAT};

export const DEM_BASIN_IDS = ${JSON.stringify(BASIN_IDS)} as const;

/** Pre-baked real EU-DEM ground elevation in decimetres (m a.s.l. * 10), row-major. */
export const DEM_GRID_ELEV_DM = new Int16Array([
${Array.from(elevDm).join(',')}
]);

/** Hydrological barrier zone code: -1 = upland, 0..8 = embanked zawale basin, 10..17 = unembanked międzywale sector. */
export const DEM_GRID_ZONE_CODE = new Int8Array([
${Array.from(zoneCode).join(',')}
]);

/** Local ground elevation above each zone's 12th-percentile floor (dm), ensuring smooth progressive basin fill. */
export const DEM_GRID_REL_ELEV_DM = new Int16Array([
${Array.from(relElevDm).join(',')}
]);
`;

fs.writeFileSync('/workspace/src/app/core/data/www-dem-grid.data.ts', ts);
console.log('✔ Wrote /workspace/src/app/core/data/www-dem-grid.data.ts');
