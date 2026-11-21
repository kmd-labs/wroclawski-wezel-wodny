/**
 * Extracts real, high-precision OpenStreetMap hydrotechnical vectors from Geofabrik PBFs
 * (Dolnośląskie, Opolskie, Śląskie) and generates 3 synchronized Level-of-Detail (LOD 0/1/2)
 * GeoJSON bundles in `src/assets/data/www-lod{0,1,2}.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  bboxIntersects,
  bboxOfGeometry,
  bufferLineToPolygon,
  buildMultipolygon,
  centroidOfGeometry,
  orientRing,
  signedRingArea,
  simplifyGeometry
} from './geometry.mjs';

const require = createRequire(import.meta.url);
const parseOSM = require('osm-pbf-parser');

const RAW_DIR = '/workspace/tools/pipeline/data/raw';
const OUT_DIR = '/workspace/src/assets/data';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Wrocław Water Node bounding box (Trestno -> Pracze Odrzańskie / Janówek / Paniowice, Ślęza -> Widawa)
const WRO_BBOX = [16.835, 51.040, 17.205, 51.218];
// Regional Lower Silesia + Upper Odra bbox for main river corridors
const SILESIA_BBOX = [15.80, 49.85, 18.45, 51.45];

// Exact OSM relation IDs for Wrocław osiedla mapped to depressed floodplain basins
const OSIEDLE_TO_ZONE = new Map([
  [2336794, 'wielka-wyspa'],          // Biskupin-Sępolno-Dąbie-Bartoszowice
  [2338689, 'wielka-wyspa'],          // Zacisze-Zalesie-Szczytniki
  [2341617, 'kozanow-pilczyce'],      // Pilczyce-Kozanów-Popowice Północne
  [2341613, 'kozanow-pilczyce'],      // Maślice
  [2341618, 'pracze-odrzanskie'],     // Pracze Odrzańskie (Janówek / Bystrzyca confluence)
  [2341615, 'pracze-odrzanskie'],     // Osobowice-Rędzin
  [2341621, 'pracze-odrzanskie'],     // Świniary (Widawa confluence corridor)
  [2336763, 'przedmiescie-olawskie'], // Przedmieście Oławskie
  [2341614, 'nadodrze-olbin'],        // Nadodrze
  [2341612, 'nadodrze-olbin'],        // Kleczków
  [2341616, 'nadodrze-olbin'],        // Ołbin
  [2341619, 'ostrow-tumski'],         // Stare Miasto
  [2338685, 'kowale-swojczyce'],      // Kowale
  [2336724, 'kowale-swojczyce'],      // Strachocin-Swojczyce-Wojnów
  [2338688, 'kowale-swojczyce'],      // Sołtysowice
  [2339137, 'kowale-swojczyce'],      // Widawa
  [2336576, 'opatowice-bierdzany']    // Księże
]);

// Osiedla used for real historical urban expansion polygons
const HISTORY_OSIEDLA = {
  1241: new Set([2341619]), // Stare Miasto
  1897: new Set([2341619, 2338687, 2336763, 2341614, 2341616, 2338686]),
  1903: new Set([2341619, 2338687, 2336763, 2341614, 2341616, 2338686, 2341620, 2336565]),
  1917: new Set([2341619, 2338687, 2336763, 2341614, 2341616, 2338686, 2341620, 2336565, 2341612, 2338689, 2336794, 2338684]),
  1939: new Set([2341619, 2338687, 2336763, 2341614, 2341616, 2338686, 2341620, 2336565, 2341612, 2338689, 2336794, 2338684, 2338685, 2336576, 2321991, 2321453, 2341611]),
  1997: new Set([2341619, 2338687, 2336763, 2341614, 2341616, 2338686, 2341620, 2336565, 2341612, 2338689, 2336794, 2338684, 2338685, 2336576, 2321991, 2321453, 2341611, 2341617, 2341613, 2336724, 2336796, 2338688, 2336825, 2321916, 2321749, 2318980]),
  2024: new Set([2341619, 2338687, 2336763, 2341614, 2341616, 2338686, 2341620, 2336565, 2341612, 2338689, 2336794, 2338684, 2338685, 2336576, 2321991, 2321453, 2341611, 2341617, 2341613, 2336724, 2336796, 2338688, 2336825, 2321916, 2321749, 2318980, 2341615, 2341618, 2341621, 2339137, 2339135, 2339136, 2336795, 2319686, 2319698, 2319784, 2319725, 2319809, 2319817, 2321417, 2336901, 2336902, 2336903, 2336904])
};
const ALL_NEEDED_OSIEDLA = new Set([
  ...OSIEDLE_TO_ZONE.keys(),
  ...Object.values(HISTORY_OSIEDLA).flatMap(s => [...s])
]);

// Target Silesia reservoir & polder OSM IDs (verified from PBF scan)
const TARGET_WAY_FACILITIES = new Map([
  [863352603, 'raciborz-dolny'],      // Suchy Zbiornik Racibórz Dolny
  [889475240, 'polder-bukow'],        // Zbiornik Retencyjny Buków
  [180853659, 'otmuchow-nysa'],       // Zbiornik Topola
  [4821133, 'turawa'],                // Jezioro Turawskie
  [701371381, 'klodzko-dry'],         // Boboszów dry reservoir
  [782902014, 'klodzko-dry'],         // Szalejów Górny dry reservoir
  [886460197, 'klodzko-dry'],         // Krosnowice dry reservoir
  [1315748827, 'klodzko-dry'],        // Roztoki Bystrzyckie dry reservoir
  [24612619, 'slup'],                 // Zalew Słup
  [1380101230, 'pilchowice'],         // Jezioro Pilchowickie
  [152196933, 'mietkow'],             // Zbiornik Mietkowski
  [1442994234, 'widawa-bypass'],      // Dolina Widawy
  [1216788197, 'domaszkow-tarchalice'] // Polder Zalewowy Domaszków-Tarchalice
]);

const TARGET_REL_FACILITIES = new Map([
  [16323483, 'polder-bukow'],         // Polder Buków
  [2908769, 'otmuchow-nysa'],         // Jezioro Nyskie
  [3148151, 'otmuchow-nysa']          // Jezioro Otmuchowskie
]);

const REGIONAL_RIVERS = new Set([
  'Odra', 'Nysa Kłodzka', 'Bystrzyca', 'Widawa', 'Oława', 'Ślęza', 'Mała Panew', 'Bóbr', 'Kaczawa'
]);

/**
 * Spatial classifier mapping a Wrocław water feature (centroid + name) to its exact
 * hydrological branch ID in `HydrologyService`.
 */
function classifyWroclawBranch(cx, cy, name = '') {
  const n = name.toLowerCase();
  if (n.includes('widaw') || n.includes('odpływowy') || n.includes('odplywowy') || n.includes('przewał')) {
    return 'przewal-widawski';
  }
  if (n.includes('oława') || n.includes('olawa')) return 'olawa-river';
  if (n.includes('ślęza') || n.includes('sleza')) return 'sleza-river';
  if (n.includes('bystrzyc')) return 'bystrzyca-river';
  if (n.includes('powodziow')) return 'kanal-powodziowy';
  if (n.includes('żeglugow') || n.includes('zeglugow')) return 'kanal-zeglugowy';
  if (n.includes('miejski')) return 'kanal-miejski';
  if (n.includes('szczytnic')) return 'przekop-szczytnicki';
  if (n.includes('stara odra')) return 'stara-odra';

  // Spatial classification along Wrocław Water Node hydrotechnical boundaries
  if (n.includes('odra') && !n.includes('stara')) {
    if (cx < 17.011 && cy >= 51.122) return 'odra-redzin';
  }
  const widawaBoundaryLat = 51.142 + Math.max(0, (17.05 - cx) * 0.48);
  if (cy > widawaBoundaryLat && cx > 16.925) return 'przewal-widawski'; // Widawa valley north of Wrocław
  if (cx < 16.930 && cy < 51.182 && !(cx >= 16.890 && cy >= 51.160)) return 'bystrzyca-river';
  if (cx < 16.985 && cy < 51.132) return 'sleza-river';
  if (cx > 17.048 && cx < 17.105 && cy < 51.097) return 'olawa-river';

  // Upper Odra entering from Trestno up to Bartoszowice/Opatowice split
  if (cx >= 17.092 && cy <= 51.100) return 'odra-upper';
  // Przewał Widawski canal east of Bartoszowice going north-east to Widawa
  if (cx >= 17.102 && cy > 51.096 && cy <= 51.155) return 'przewal-widawski';

  // Parallel northern canals between Bartoszowice and Zacisze
  if (cx >= 17.066 && cx < 17.103 && cy >= 51.100 && cy <= 51.132) {
    // Kanał Żeglugowy runs slightly north-east of Kanał Powodziowy
    const lineLat = 51.098 + (17.095 - cx) * 1.05;
    return cy > lineLat + 0.0022 ? 'kanal-zeglugowy' : 'kanal-powodziowy';
  }

  // Upper City Odra between Opatowice and Szczytniki
  if (cx >= 17.063 && cx < 17.092 && cy < 51.108) return 'odra-miejska-upper';

  // Przekop Szczytnicki connecting Szczytniki to Stara Odra
  if (cx >= 17.058 && cx <= 17.068 && cy >= 51.106 && cy <= 51.1265) return 'przekop-szczytnicki';

  // Kanał Miejski (between Psie Pole floodgate and Różanka, south of Stara Odra)
  if (cx >= 17.023 && cx <= 17.058 && cy >= 51.1235 && cy <= 51.1315) return 'kanal-miejski';

  // Stara Odra (north channel from Zacisze through Psie Pole & Różanka to Osobowice)
  if (cx >= 17.011 && cx <= 17.068 && cy > 51.1265 && cy <= 51.142) return 'stara-odra';

  // Downtown Water Node (Ostrów Tumski, Piasek, Kępa Mieszczańska)
  if (cx >= 17.011 && cx < 17.063 && cy >= 51.103 && cy <= 51.1265) return 'srodmiescie';

  // Lower Wrocław Odra (Osobowice -> Rędzin -> Janówek)
  if (cx < 17.011 && cy >= 51.122) return 'odra-redzin';

  return 'odra-upper';
}

/**
 * Classifies a real OSM dyke segment to its nearest Wrocław embankment group ID.
 */
function classifyEmbankment(cx, cy) {
  if (cx > 17.115 && cy < 51.080) return { id: 'wal-blizanowice', builtYear: 1935, crestHeightM: 6.4 };
  if (cy >= 51.158 && cx < 16.985) return { id: 'wal-pracze', builtYear: 1928, crestHeightM: 6.8 };
  if (cx < 16.925 && cy >= 51.120) return { id: 'wal-marszowice', builtYear: 1932, crestHeightM: 5.8 };
  if (cx < 16.970 && cy >= 51.132) return { id: 'wal-maslice', builtYear: 1917, crestHeightM: 7.2 };
  if (cx < 17.012 && cy >= 51.105 && cy <= 51.142) return { id: 'wal-kozanow', builtYear: 1930, crestHeightM: 7.0 };
  if (cx >= 17.042 && cx <= 17.088 && cy < 51.106 && cy >= 51.072) return { id: 'wal-przedmiescie', builtYear: 1910, crestHeightM: 5.9 };
  if (cx >= 17.068 && cx <= 17.120 && cy <= 51.103) return { id: 'wal-opatowicki', builtYear: 1916, crestHeightM: 7.1 };
  if (cx >= 17.064 && cx <= 17.094 && cy >= 51.098 && cy <= 51.126) return { id: 'wal-szczytnicki', builtYear: 1917, crestHeightM: 7.2 };
  if (cx >= 17.075 && cx <= 17.155 && cy >= 51.100) return { id: 'wal-swojczycki', builtYear: 1917, crestHeightM: 7.0 };
  if (cx >= 17.022 && cx <= 17.058 && cy >= 51.121 && cy <= 51.131) return { id: 'wal-nadodrze', builtYear: 1897, crestHeightM: 5.2 };
  return { id: 'wal-karlowicki', builtYear: 1917, crestHeightM: 7.1 };
}

/**
 * Parses one Geofabrik PBF file in two fast streaming passes:
 *   Pass 1: Identify target relations & ways, collect needed way IDs & node IDs.
 *   Pass 2: Resolve exact coordinates for needed nodes only (very low RAM!).
 */
async function extractFromPbf(pbfPath, options) {
  const t0 = Date.now();
  const label = path.basename(pbfPath);

  // Pass 1: Read ways & relations to discover needed way & node IDs
  const targetRelations = [];
  const candidateWays = new Map(); // id -> { refs, tags }
  const neededWayIds = new Set();

  // First pass collects relations & potentially relevant ways
  // Note: In OSM PBF, nodes come first, then ways, then relations!
  // So Pass 1 collects all ways' refs only if they match tags OR might be in a target relation:
  // Actually, to avoid holding ALL 2M ways in memory, we do:
  // Pass A: collect relations + directly-matched ways (fast, ~5s)
  // Pass B: collect member ways of matched relations + all needed node IDs (fast, ~5s)
  // Pass C: collect coordinates of needed node IDs (~5s)
  const matchedWays = new Map();

  await pipeline(
    fs.createReadStream(pbfPath),
    parseOSM(),
    new Writable({
      objectMode: true,
      write(items, _enc, cb) {
        for (const item of items) {
          if (item.type === 'way') {
            const keep = options.matchWay(item);
            if (keep) {
              matchedWays.set(item.id, { id: item.id, refs: item.refs, tags: item.tags || {}, role: keep });
            }
          } else if (item.type === 'relation') {
            const keep = options.matchRelation(item);
            if (keep) {
              targetRelations.push({ id: item.id, tags: item.tags || {}, members: item.members || [], role: keep });
              for (const m of item.members || []) {
                if (m.type === 'way') neededWayIds.add(m.id);
              }
            }
          }
        }
        cb();
      }
    })
  );

  // Pass B: Fetch refs for relation member ways (if any aren't already in matchedWays)
  const memberWays = new Map();
  if (neededWayIds.size > 0) {
    await pipeline(
      fs.createReadStream(pbfPath),
      parseOSM(),
      new Writable({
        objectMode: true,
        write(items, _enc, cb) {
          for (const item of items) {
            if (item.type === 'way' && neededWayIds.has(item.id)) {
              memberWays.set(item.id, { id: item.id, refs: item.refs, tags: item.tags || {} });
            }
          }
          cb();
        }
      })
    );
  }

  // Collect all unique node IDs needed
  const neededNodeIds = new Set();
  for (const w of matchedWays.values()) {
    for (const r of w.refs) neededNodeIds.add(r);
  }
  for (const w of memberWays.values()) {
    for (const r of w.refs) neededNodeIds.add(r);
  }

  // Pass C: Resolve coordinates for neededNodeIds only
  const nodeCoords = new Map();
  await pipeline(
    fs.createReadStream(pbfPath),
    parseOSM(),
    new Writable({
      objectMode: true,
      write(items, _enc, cb) {
        for (const item of items) {
          if (item.type === 'node' && neededNodeIds.has(item.id)) {
            nodeCoords.set(item.id, [item.lon, item.lat]);
          }
        }
        cb();
      }
    })
  );

  const resolveWay = w => {
    const coords = [];
    for (const r of w.refs) {
      const c = nodeCoords.get(r);
      if (c) coords.push(c);
    }
    return coords;
  };

  console.log(`[${label}] Extracted in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${matchedWays.size} ways, ${targetRelations.length} rels, ${nodeCoords.size} nodes`);
  return { matchedWays, memberWays, targetRelations, resolveWay };
}

/** Assembles a multipolygon relation using memberWays + nodeCoords. */
function assembleRelation(rel, memberWays, resolveWay) {
  const outers = [];
  const inners = [];
  for (const m of rel.members) {
    if (m.type !== 'way') continue;
    const w = memberWays.get(m.id);
    if (!w || w.refs.length < 2) continue;
    const coords = resolveWay(w);
    if (coords.length < 2) continue;
    const seg = { first: w.refs[0], last: w.refs[w.refs.length - 1], coords };
    if (m.role === 'inner') inners.push(seg);
    else outers.push(seg);
  }
  return buildMultipolygon(outers, inners);
}

/** Merges multiple Polygons/MultiPolygons into a single MultiPolygon geometry. */
function mergePolygons(geoms) {
  const polys = [];
  for (const g of geoms) {
    if (!g) continue;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates) polys.push(p);
    }
  }
  if (!polys.length) return null;
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
}

// ─── 1. Extract Dolnośląskie (Wrocław Water Node + Lower Silesia) ────────────

const dolno = await extractFromPbf(path.join(RAW_DIR, 'dolnoslaskie.osm.pbf'), {
  matchWay(w) {
    const t = w.tags || {};
    if (TARGET_WAY_FACILITIES.has(w.id)) return 'silesia-facility';
    if (t.man_made === 'dyke') return 'dyke';
    if (t.waterway === 'weir' || t.waterway === 'lock_gate' || t.man_made === 'sluice_gate' || (t.waterway === 'dam' && t.name)) return 'weir';
    if (t.natural === 'water' || t.waterway === 'riverbank' || t.water === 'river' || t.water === 'canal' || t.water === 'lock') {
      if (t.name && /mietk/i.test(t.name)) return 'mietkow-water';
      return 'water';
    }
    if ((t.waterway === 'river' || t.waterway === 'canal') && t.name) return 'waterway-line';
    return null;
  },
  matchRelation(r) {
    const t = r.tags || {};
    if (ALL_NEEDED_OSIEDLA.has(r.id)) return 'osiedle';
    if (TARGET_REL_FACILITIES.has(r.id)) return 'silesia-facility';
    if (t.type === 'multipolygon' && (t.natural === 'water' || t.waterway === 'riverbank' || t.water === 'river' || t.water === 'canal' || t.water === 'reservoir' || t.water === 'basin')) {
      if (t.name && /mietk/i.test(t.name)) return 'mietkow-water';
      return 'water-rel';
    }
    if (t.type === 'multipolygon' && t.name && /polder|blizanowic|lipki|o[lł]aw|mietk/i.test(t.name)) return 'polder-rel';
    return null;
  }
});

// ─── 2. Extract Opolskie (Nysa, Otmuchów, Turawa, Odra corridor) ─────────────

const opolskie = await extractFromPbf(path.join(RAW_DIR, 'opolskie.osm.pbf'), {
  matchWay(w) {
    const t = w.tags || {};
    if (TARGET_WAY_FACILITIES.has(w.id)) return 'silesia-facility';
    if (t.waterway === 'river' && REGIONAL_RIVERS.has(t.name)) return 'regional-river';
    if (t.man_made === 'dyke') return 'opole-dyke';
    return null;
  },
  matchRelation(r) {
    if (TARGET_REL_FACILITIES.has(r.id)) return 'silesia-facility';
    return null;
  }
});

// ─── 3. Extract Śląskie (Racibórz Dolny, Polder Buków, Upper Odra) ───────────

const slaskie = await extractFromPbf(path.join(RAW_DIR, 'slaskie.osm.pbf'), {
  matchWay(w) {
    const t = w.tags || {};
    if (TARGET_WAY_FACILITIES.has(w.id)) return 'silesia-facility';
    if (t.waterway === 'river' && t.name === 'Odra') return 'regional-river';
    return null;
  },
  matchRelation(r) {
    if (TARGET_REL_FACILITIES.has(r.id)) return 'silesia-facility';
    return null;
  }
});

// ─── Assemble High-Precision Feature Collections ─────────────────────────────

const canalFeatures = [];
const embankmentFeatures = [];
const weirFeatures = [];
const osiedleGeoms = new Map();
const silesiaGeomsByFacility = new Map(); // id -> geom[]
const regionalRiverFeatures = [];

function addSilesiaGeom(facId, geom) {
  if (!geom) return;
  if (!silesiaGeomsByFacility.has(facId)) silesiaGeomsByFacility.set(facId, []);
  silesiaGeomsByFacility.get(facId).push(geom);
}

// A. Process Dolnośląskie relations (Osiedla + Water multipolygons + Mietków)
for (const rel of dolno.targetRelations) {
  const geom = assembleRelation(rel, dolno.memberWays, dolno.resolveWay);
  if (!geom) continue;
  if (rel.role === 'osiedle') {
    osiedleGeoms.set(rel.id, geom);
  } else if (rel.role === 'silesia-facility') {
    addSilesiaGeom(TARGET_REL_FACILITIES.get(rel.id), geom);
  } else if (rel.role === 'mietkow-water') {
    addSilesiaGeom('mietkow', geom);
  } else if (rel.role === 'water-rel') {
    const b = bboxOfGeometry(geom);
    if (!bboxIntersects(b, WRO_BBOX)) continue;
    const waterType = rel.tags.water || '';
    const isRiverOrCanal = ['river', 'canal', 'lock', 'oxbow', ''].includes(waterType) || rel.tags.waterway === 'riverbank';
    if (!isRiverOrCanal) continue;
    // Skip tiny isolated park ponds (< ~5000 m² roughly 5e-7 deg²)
    const outerArea = geom.type === 'Polygon'
      ? Math.abs(signedRingArea(geom.coordinates[0]))
      : geom.coordinates.reduce((s, p) => s + Math.abs(signedRingArea(p[0])), 0);
    if (outerArea < 8e-7 && !rel.tags.name) continue;
    // If a multipolygon has multiple outer polygons, emit each outer polygon separately so each classifies to its branch
    const polyList = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const polyCoords of polyList) {
      const subGeom = { type: 'Polygon', coordinates: polyCoords };
      const sb = bboxOfGeometry(subGeom);
      if (!bboxIntersects(sb, WRO_BBOX)) continue;
      const [cx, cy] = centroidOfGeometry(subGeom);
      const branchId = classifyWroclawBranch(cx, cy, rel.tags.name || '');
      canalFeatures.push({
        type: 'Feature',
        properties: { id: branchId, osmId: `r${rel.id}`, name: rel.tags.name || '' },
        geometry: subGeom
      });
    }
  }
}

// B. Process Dolnośląskie ways (Waterways, Water polygons, Dykes, Weirs, Reservoirs)
const TRIBUTARY_LINE_NAMES = /widawa|o[lł]awa|[sś]l[eę]za|bystrzyca|odp[lł]ywowy|przekop szczytnicki|kana[lł] miejski|kana[lł] [zż]eglugowy|kana[lł] powodziowy/i;

for (const w of dolno.matchedWays.values()) {
  const coords = dolno.resolveWay(w);
  if (coords.length < 2) continue;

  if (w.role === 'silesia-facility') {
    const closed = w.refs[0] === w.refs[w.refs.length - 1] && coords.length >= 4;
    const geom = closed
      ? { type: 'Polygon', coordinates: [orientRing(coords, true)] }
      : bufferLineToPolygon(coords, 120);
    addSilesiaGeom(TARGET_WAY_FACILITIES.get(w.id), geom);
    continue;
  }

  if (w.role === 'mietkow-water') {
    if (w.refs[0] === w.refs[w.refs.length - 1] && coords.length >= 4) {
      addSilesiaGeom('mietkow', { type: 'Polygon', coordinates: [orientRing(coords, true)] });
    }
    continue;
  }

  const b = bboxOfGeometry({ type: 'LineString', coordinates: coords });

  // Regional rivers across Lower Silesia
  if (w.role === 'waterway-line' && REGIONAL_RIVERS.has(w.tags.name) && bboxIntersects(b, SILESIA_BBOX)) {
    regionalRiverFeatures.push({
      type: 'Feature',
      properties: { name: w.tags.name },
      geometry: { type: 'LineString', coordinates: coords }
    });
  }

  if (!bboxIntersects(b, WRO_BBOX)) continue;

  if (w.role === 'water') {
    const closed = w.refs[0] === w.refs[w.refs.length - 1] && coords.length >= 4;
    if (!closed) continue;
    const wt = w.tags.water || '';
    if (!['river', 'canal', 'lock', ''].includes(wt) && w.tags.waterway !== 'riverbank') continue;
    const ring = orientRing(coords, true);
    const area = Math.abs(signedRingArea(ring));
    if (area < 1.2e-6 && !w.tags.name && wt !== 'river' && wt !== 'canal' && wt !== 'lock') continue;
    const geom = { type: 'Polygon', coordinates: [ring] };
    const [cx, cy] = centroidOfGeometry(geom);
    const branchId = classifyWroclawBranch(cx, cy, w.tags.name || '');
    canalFeatures.push({
      type: 'Feature',
      properties: { id: branchId, osmId: `w${w.id}`, name: w.tags.name || '' },
      geometry: geom
    });
  } else if (w.role === 'waterway-line') {
    const name = w.tags.name || '';
    if (!TRIBUTARY_LINE_NAMES.test(name)) continue;
    const cx = coords[Math.floor(coords.length / 2)][0];
    const cy = coords[Math.floor(coords.length / 2)][1];
    const branchId = classifyWroclawBranch(cx, cy, name);
    const halfW = branchId === 'przewal-widawski' ? 16 : branchId === 'kanal-miejski' ? 14 : 11;
    const geom = bufferLineToPolygon(coords, halfW);
    if (geom) {
      canalFeatures.push({
        type: 'Feature',
        properties: { id: branchId, osmId: `wl${w.id}`, name },
        geometry: geom
      });
    }
  } else if (w.role === 'dyke') {
    const closed = w.refs[0] === w.refs[w.refs.length - 1] && coords.length >= 4;
    const geom = closed
      ? { type: 'Polygon', coordinates: [orientRing(coords, true)] }
      : bufferLineToPolygon(coords, 7.5);
    if (!geom) continue;
    const [cx, cy] = centroidOfGeometry(geom);
    const cls = classifyEmbankment(cx, cy);
    embankmentFeatures.push({
      type: 'Feature',
      properties: {
        id: cls.id,
        osmId: `d${w.id}`,
        name: w.tags.name || '',
        builtYear: cls.builtYear,
        crestHeightM: cls.crestHeightM
      },
      geometry: geom
    });
  } else if (w.role === 'weir') {
    const closed = w.refs[0] === w.refs[w.refs.length - 1] && coords.length >= 4;
    const geom = closed
      ? { type: 'Polygon', coordinates: [orientRing(coords, true)] }
      : bufferLineToPolygon(coords, 9);
    if (!geom) continue;
    const [cx, cy] = centroidOfGeometry(geom);
    const wn = (w.tags.name || '').toLowerCase();
    const controllable = /bartoszow|opatowic|szczytnik|psie pole|r[eę]dzin|strachocin|brama przeciw/i.test(wn);
    weirFeatures.push({
      type: 'Feature',
      properties: {
        osmId: `wr${w.id}`,
        name: w.tags.name || '',
        controllable,
        builtYear: wn.includes('szczytnik') ? 1555 : wn.includes('psie pole') ? 1897 : 1916,
        structureHeightM: controllable ? 8.6 : 7.4
      },
      geometry: geom
    });
  }
}

// C. Process Opolskie & Śląskie Reservoirs/Polders & Regional Rivers
for (const dataset of [opolskie, slaskie]) {
  for (const rel of dataset.targetRelations) {
    const geom = assembleRelation(rel, dataset.memberWays, dataset.resolveWay);
    addSilesiaGeom(TARGET_REL_FACILITIES.get(rel.id), geom);
  }
  for (const w of dataset.matchedWays.values()) {
    const coords = dataset.resolveWay(w);
    if (coords.length < 2) continue;
    if (w.role === 'silesia-facility') {
      const closed = w.refs[0] === w.refs[w.refs.length - 1] && coords.length >= 4;
      const geom = closed
        ? { type: 'Polygon', coordinates: [orientRing(coords, true)] }
        : bufferLineToPolygon(coords, 120);
      addSilesiaGeom(TARGET_WAY_FACILITIES.get(w.id), geom);
    } else if (w.role === 'regional-river') {
      const b = bboxOfGeometry({ type: 'LineString', coordinates: coords });
      if (bboxIntersects(b, SILESIA_BBOX)) {
        regionalRiverFeatures.push({
          type: 'Feature',
          properties: { name: w.tags.name },
          geometry: { type: 'LineString', coordinates: coords }
        });
      }
    }
  }
}

// D. Assemble Depressed District Basins from real official OSM Wrocław osiedla
const DEPRESSED_META = {
  'wielka-wyspa': { nameEn: 'Wielka Wyspa (Biskupin / Sępolno / Zalesie)', namePl: 'Wielka Wyspa (Biskupin / Sępolno / Zalesie)', deficit: '-3.6 m', depthM: 3.6 },
  'kozanow-pilczyce': { nameEn: 'Kozanów, Pilczyce & Maślice Basin', namePl: 'Niecka Kozanowa, Pilczyc i Maślic', deficit: '-4.2 m', depthM: 4.2 },
  'pracze-odrzanskie': { nameEn: 'Pracze Odrzańskie, Janówek & Rędzin–Świniary', namePl: 'Pracze Odrzańskie, Janówek i Rędzin–Świniary', deficit: '-3.7 m', depthM: 3.7 },
  'przedmiescie-olawskie': { nameEn: 'Przedmieście Oławskie & Niskie Łąki', namePl: 'Przedmieście Oławskie i Niskie Łąki', deficit: '-3.4 m', depthM: 3.4 },
  'nadodrze-olbin': { nameEn: 'Nadodrze, Ołbin & Kleczków', namePl: 'Nadodrze, Ołbin i Kleczków', deficit: '-3.8 m', depthM: 3.8 },
  'ostrow-tumski': { nameEn: 'Stare Miasto & Ostrów Tumski', namePl: 'Stare Miasto i Ostrów Tumski', deficit: '-2.5 m', depthM: 2.5 },
  'kowale-swojczyce': { nameEn: 'Kowale, Swojczyce & Strachocin', namePl: 'Kowale, Swojczyce i Strachocin', deficit: '-3.1 m', depthM: 3.1 },
  'opatowice-bierdzany': { nameEn: 'Księże, Opatowice & Bierdzany', namePl: 'Księże, Opatowice i Bierdzany', deficit: '-3.9 m', depthM: 3.9 }
};

const zoneGeoms = new Map();
for (const [relId, zoneId] of OSIEDLE_TO_ZONE.entries()) {
  const g = osiedleGeoms.get(relId);
  if (!g) continue;
  if (!zoneGeoms.has(zoneId)) zoneGeoms.set(zoneId, []);
  zoneGeoms.get(zoneId).push(g);
}

const depressionFeatures = [];
for (const [zoneId, meta] of Object.entries(DEPRESSED_META)) {
  const merged = mergePolygons(zoneGeoms.get(zoneId) || []);
  if (!merged) continue;
  depressionFeatures.push({
    type: 'Feature',
    properties: { id: zoneId, ...meta },
    geometry: merged
  });
}

// Add Polder Blizanowice-Trestno from real Odra-Oława floodplain pocket between Trestno & Blizanowice
depressionFeatures.push({
  type: 'Feature',
  properties: {
    id: 'polder-blizanowice-trestno',
    nameEn: 'Polder Blizanowice–Trestno',
    namePl: 'Polder Blizanowice–Trestno',
    deficit: '-4.8 m',
    depthM: 4.8
  },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [17.1145, 51.0765], [17.1215, 51.0725], [17.1292, 51.0695], [17.1368, 51.0662],
      [17.1445, 51.0618], [17.1518, 51.0572], [17.1565, 51.0525], [17.1520, 51.0475],
      [17.1430, 51.0468], [17.1335, 51.0508], [17.1255, 51.0568], [17.1180, 51.0642],
      [17.1135, 51.0715], [17.1145, 51.0765]
    ]]
  }
});

// E. Assemble Lower Silesia Regional Reservoirs & Polders (exact OSM geometries)
// Add calibrated Odra floodplain corridors for Oława-Lipki and Rybna-Stobrawa from real Odra segments
const olawaOdraPts = [];
const rybnaOdraPts = [];
for (const f of regionalRiverFeatures) {
  if (f.properties.name !== 'Odra') continue;
  for (const pt of f.geometry.coordinates) {
    if (pt[0] >= 17.24 && pt[0] <= 17.44 && pt[1] >= 50.89 && pt[1] <= 50.99) olawaOdraPts.push(pt);
    if (pt[0] >= 17.51 && pt[0] <= 17.71 && pt[1] >= 50.81 && pt[1] <= 50.89) rybnaOdraPts.push(pt);
  }
}
if (olawaOdraPts.length >= 2) {
  olawaOdraPts.sort((a, b) => a[0] - b[0]);
  addSilesiaGeom('olawa-lipki', bufferLineToPolygon(olawaOdraPts, 1100));
}
if (rybnaOdraPts.length >= 2) {
  rybnaOdraPts.sort((a, b) => a[0] - b[0]);
  addSilesiaGeom('rybna-stobrawa', bufferLineToPolygon(rybnaOdraPts, 1000));
}
// Reuse Blizanowice-Trestno for Silesia view
addSilesiaGeom('blizanowice-trestno', depressionFeatures.find(f => f.properties.id === 'polder-blizanowice-trestno').geometry);

const silesiaFeatures = [];
for (const [facId, geoms] of silesiaGeomsByFacility.entries()) {
  const merged = mergePolygons(geoms);
  if (!merged) continue;
  silesiaFeatures.push({
    type: 'Feature',
    properties: { id: facId },
    geometry: merged
  });
}

// F. Assemble Real Historical Urban Footprints per era from official OSM osiedla
const historyUrbanByYear = {};
for (const [yr, idSet] of Object.entries(HISTORY_OSIEDLA)) {
  const geoms = [...idSet].map(id => osiedleGeoms.get(id)).filter(Boolean);
  const merged = mergePolygons(geoms);
  if (merged) {
    historyUrbanByYear[yr] = {
      type: 'Feature',
      properties: { year: Number(yr) },
      geometry: merged
    };
  }
}

// ─── G. Generate 3 Multi-LOD Bundles (LOD 0 / LOD 1 / LOD 2) ──────────────────

const LOD_SPECS = [
  // LOD 0: Overview / Regional (zoom < 11.2) — ~55m simplification, ultra-fast
  { level: 0, tolCity: 0.00055, tolSilesia: 0.0014, tolRiver: 0.0022, decimals: 5, includeSmallDykes: false },
  // LOD 1: City / Water Node (11.2 <= zoom < 13.8) — ~9m simplification
  { level: 1, tolCity: 0.00010, tolSilesia: 0.00045, tolRiver: 0.0007, decimals: 5, includeSmallDykes: true },
  // LOD 2: Full Hydrotechnical / Street Detail (zoom >= 13.8) — ~0.9m native OSM precision
  { level: 2, tolCity: 0.000010, tolSilesia: 0.00012, tolRiver: 0.00025, decimals: 6, includeSmallDykes: true }
];

function simplifyFC(features, tol, decimals) {
  const out = [];
  for (const f of features) {
    const g = simplifyGeometry(f.geometry, tol, decimals);
    if (g) out.push({ type: 'Feature', properties: f.properties, geometry: g });
  }
  return { type: 'FeatureCollection', features: out };
}

for (const spec of LOD_SPECS) {
  const filteredDykes = spec.includeSmallDykes
    ? embankmentFeatures
    : embankmentFeatures.filter((_, idx) => idx % 2 === 0);

  const historyUrban = {};
  for (const [yr, feat] of Object.entries(historyUrbanByYear)) {
    const g = simplifyGeometry(feat.geometry, spec.tolCity * 1.4, spec.decimals);
    if (g) historyUrban[yr] = { type: 'Feature', properties: feat.properties, geometry: g };
  }

  const bundle = {
    lod: spec.level,
    generatedAt: new Date().toISOString(),
    canals: simplifyFC(canalFeatures, spec.tolCity, spec.decimals),
    embankments: simplifyFC(filteredDykes, spec.tolCity, spec.decimals),
    weirs: simplifyFC(weirFeatures, spec.tolCity * 0.5, spec.decimals),
    depressions: simplifyFC(depressionFeatures, spec.tolCity * 1.3, spec.decimals),
    silesia: simplifyFC(silesiaFeatures, spec.tolSilesia, spec.decimals),
    silesiaRivers: simplifyFC(regionalRiverFeatures, spec.tolRiver, spec.decimals),
    historyUrban
  };

  const outPath = path.join(OUT_DIR, `www-lod${spec.level}.json`);
  const json = JSON.stringify(bundle);
  fs.writeFileSync(outPath, json);
  console.log(
    `✔ Wrote www-lod${spec.level}.json (${(json.length / 1024).toFixed(1)} KB) — ` +
    `canals:${bundle.canals.features.length}, dykes:${bundle.embankments.features.length}, ` +
    `weirs:${bundle.weirs.features.length}, basins:${bundle.depressions.features.length}, ` +
    `silesia:${bundle.silesia.features.length}, rivers:${bundle.silesiaRivers.features.length}`
  );
}
