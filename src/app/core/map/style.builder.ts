import type { Feature, FeatureCollection } from 'geojson';
import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { ThemeMode } from '@kmd/design-system';
import {
  BASEMAP_GLYPHS_URL,
  BASEMAP_TILEJSON_URL,
  DEM_TILES_URL,
  MAP_FONT_ITALIC,
  MAP_FONT_REGULAR,
  SRC_BASEMAP,
  SRC_CANALS,
  SRC_DEM,
  SRC_DEPRESSIONS,
  SRC_EMBANKMENTS,
  SRC_HISTORY_URBAN,
  SRC_INUNDATION,
  SRC_SILESIA,
  SRC_SILESIA_RIVERS,
  SRC_WEIRS
} from './map.config';
import { Lang } from '../i18n/i18n.types';
import { BranchHydrology, ViewMode } from '../models/www.model';
import { HISTORY_ERAS, SILESIA_FACILITIES } from '../data/www-events.data';
import { LodLevel, WwwLodBundle } from '../services/vector-data.service';

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Computes 3D river segment extrusion height proportional to discharge Q (m³/s)
 * and calibrated per LOD tier so water volume remains visually legible at every zoom.
 */
const LOD_Q_SCALE: Record<LodLevel, { baseM: number; mPerM3s: number }> = {
  0: { baseM: 4.0, mPerM3s: 0.085 },  // Overview zoom: 400 m³/s -> 38 m, 3640 m³/s -> 313 m
  1: { baseM: 2.5, mPerM3s: 0.022 },  // City zoom:     400 m³/s -> 11 m, 3640 m³/s -> 83 m
  2: { baseM: 1.2, mPerM3s: 0.0065 }  // Street zoom:   400 m³/s -> 3.8 m, 3640 m³/s -> 25 m
};

export function computeCanalVolumeHeight(
  flowM3s: number,
  lod: LodLevel,
  riverScale = 5
): number {
  const { baseM, mPerM3s } = LOD_Q_SCALE[lod];
  return Math.round((baseM + Math.max(0, flowM3s) * mPerM3s) * riverScale * 100) / 100;
}

export interface DynamicDataContext {
  lang: Lang;
  view: ViewMode;
  lod: LodLevel;
  riverScale: number;
  bundle: WwwLodBundle | null;
  show3dEmbankments: boolean;
  showDepressionZones: boolean;
  branches: Record<string, BranchHydrology>;
  floodedZones: Set<string>;
  breachedEmbankments: Set<string>;
  historyYear: number;
  silesiaWaveStep: number;
  silesiaActiveIds: Set<string>;
  selectedSegmentKey: string | null;
}

export interface DynamicSourcesPayload {
  canals: FeatureCollection;
  embankments: FeatureCollection;
  weirs: FeatureCollection;
  depressions: FeatureCollection;
  inundation: FeatureCollection;
  silesia: FeatureCollection;
  silesiaRivers: FeatureCollection;
  historyUrban: FeatureCollection;
}

const SILESIA_FACILITY_MAP = new Map(SILESIA_FACILITIES.map(f => [f.id, f]));

/**
 * Projects dynamic hydrological/timeline state onto the currently active Multi-LOD
 * OSM GeoJSON bundle without rebuilding the MapLibre style.
 */
export function buildDynamicSources(ctx: DynamicDataContext): DynamicSourcesPayload {
  const b = ctx.bundle;
  if (!b) {
    return {
      canals: EMPTY_FC,
      embankments: EMPTY_FC,
      weirs: EMPTY_FC,
      depressions: EMPTY_FC,
      inundation: EMPTY_FC,
      silesia: EMPTY_FC,
      silesiaRivers: EMPTY_FC,
      historyUrban: EMPTY_FC
    };
  }

  const era = HISTORY_ERAS.reduce(
    (acc, item) => (item.year <= ctx.historyYear ? item : acc),
    HISTORY_ERAS[0]
  );

  // 1. Real OSM River & Canal Polygons colored/extruded by live Q (m³/s) volume per LOD
  const canalFeatures: Feature[] = [];
  if (ctx.view !== 'silesia') {
    for (let i = 0; i < b.canals.features.length; i++) {
      const f = b.canals.features[i];
      const branchId = String(f.properties?.['id'] ?? 'odra-upper');
      if (ctx.view === 'history' && !era.activeCanals.includes(branchId)) continue;
      const osmId = String(f.properties?.['osmId'] ?? i);
      const segKey = `${branchId}::${osmId}`;
      const hydro = ctx.branches[branchId];
      const flowM3s = hydro?.flowM3s ?? 120;
      const load = hydro?.loadRatio ?? 0.3;
      const status = load > 1.0 ? 'overtop' : load > 0.78 ? 'warning' : 'safe';
      canalFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: branchId,
          segKey,
          selected: ctx.selectedSegmentKey === segKey,
          flowM3s,
          status,
          height: computeCanalVolumeHeight(flowM3s, ctx.lod, ctx.riverScale)
        }
      });
    }
  }

  // 2. Real OSM Flood Embankments (man_made=dyke) at true 1:1 crest heights
  const embankmentFeatures: Feature[] = [];
  if (ctx.show3dEmbankments && ctx.view !== 'silesia') {
    for (const f of b.embankments.features) {
      const embId = String(f.properties?.['id'] ?? '');
      const builtYear = Number(f.properties?.['builtYear'] ?? 1917);
      if (ctx.view === 'history' && builtYear > ctx.historyYear) continue;
      const breached = ctx.breachedEmbankments.has(embId);
      const crestHeightM = Number(f.properties?.['crestHeightM'] ?? 6.8);
      embankmentFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: embId,
          breached,
          height: breached ? 1.0 : crestHeightM
        }
      });
    }
  }

  // 3. Real OSM Weirs, Locks & Floodgates at true structure heights
  const weirFeatures: Feature[] = [];
  if (ctx.view !== 'silesia') {
    for (const f of b.weirs.features) {
      const builtYear = Number(f.properties?.['builtYear'] ?? 1916);
      if (ctx.view === 'history' && builtYear > ctx.historyYear) continue;
      weirFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          controllable: Boolean(f.properties?.['controllable']),
          height: Number(f.properties?.['structureHeightM'] ?? 7.8)
        }
      });
    }
  }

  // 4. Real Official OSM Wrocław Osiedla Depressed Basins & Inundation Volumes
  const depressionFeatures: Feature[] = [];
  const inundationFeatures: Feature[] = [];
  if (ctx.view !== 'silesia') {
    for (const f of b.depressions.features) {
      const zoneId = String(f.properties?.['id'] ?? '');
      const flooded = ctx.floodedZones.has(zoneId);
      if (ctx.showDepressionZones) {
        depressionFeatures.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            id: zoneId,
            name: ctx.lang === 'pl' ? f.properties?.['namePl'] : f.properties?.['nameEn'],
            deficit: f.properties?.['deficit'] ?? '-3.5 m',
            flooded
          }
        });
      }
      if (flooded && zoneId === 'polder-blizanowice-trestno') {
        const depthM = Number(f.properties?.['depthM'] ?? 3.0);
        inundationFeatures.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            id: zoneId,
            isPolder: true,
            height: Math.max(1.2, depthM * 0.65)
          }
        });
      }
    }
  }

  // 5. Real OSM Lower Silesia & Upper Odra Reservoirs, Polders & Regional Rivers
  const silesiaFeatures: Feature[] = [];
  let silesiaRivers: FeatureCollection = EMPTY_FC;
  if (ctx.view === 'silesia') {
    silesiaRivers = b.silesiaRivers;
    for (const f of b.silesia.features) {
      const facId = String(f.properties?.['id'] ?? '');
      const meta = SILESIA_FACILITY_MAP.get(facId);
      const active = meta ? ctx.silesiaActiveIds.has(facId) : true;
      const arrival = meta?.waveArrivalStep ?? 50;
      const filledRatio = active
        ? Math.max(0.2, Math.min(1, (ctx.silesiaWaveStep - (arrival - 20)) / 30))
        : 0.08;
      const labelName = meta
        ? `${ctx.lang === 'pl' ? meta.namePl : meta.nameEn} (${meta.capacityMlnM3} mln m³)`
        : facId;
      silesiaFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: facId,
          kind: meta?.kind ?? 'polder',
          active,
          name: labelName,
          // Subtle regional basin fill height readable at zoom 7.5–10
          height: active ? 80 + filledRatio * 240 : 25
        }
      });
    }
  }

  // 6. Real Historical Urban Footprint (assembled from official OSM osiedla)
  const historyUrbanFeatures: Feature[] = [];
  if (ctx.view === 'history') {
    const feat = b.historyUrban[String(era.year)];
    if (feat) historyUrbanFeatures.push(feat);
  }

  return {
    canals: { type: 'FeatureCollection', features: canalFeatures },
    embankments: { type: 'FeatureCollection', features: embankmentFeatures },
    weirs: { type: 'FeatureCollection', features: weirFeatures },
    depressions: { type: 'FeatureCollection', features: depressionFeatures },
    inundation: { type: 'FeatureCollection', features: inundationFeatures },
    silesia: { type: 'FeatureCollection', features: silesiaFeatures },
    silesiaRivers,
    historyUrban: { type: 'FeatureCollection', features: historyUrbanFeatures }
  };
}

/**
 * Builds the theme- and language-aware base MapLibre style.
 * Dynamic GeoJSON payloads are injected initially and then patched in-place via `source.setData()`.
 */
export function buildBaseWwwStyle(
  mode: ThemeMode,
  lang: Lang,
  show3dBuildings: boolean,
  view: ViewMode,
  initialSources: DynamicSourcesPayload,
  tokenColor: (token: string, fallback?: string) => string
): StyleSpecification {
  const dark = mode === 'dark';

  const bg = tokenColor('map-bg', dark ? '#0d0d0d' : '#e5ecf2');
  const landPark = dark ? '#131d17' : '#d8eadb';
  const roadMinor = dark ? '#1f2329' : '#f8fafc';
  const roadMajor = dark ? '#2a3038' : '#ffffff';
  const roadCasing = dark ? '#14161a' : '#cfd8e3';
  const baseWater = dark ? '#102433' : '#bfd8eb';
  const textColor = tokenColor('text-main', dark ? '#e3e3e3' : '#1e293b');
  const textDim = tokenColor('text-dim', dark ? '#8f8f8f' : '#64748b');
  const buildingColor = dark ? '#262b34' : '#d5dde8';

  const safeWater = '#0ea5e9';
  const warnWater = '#d37400';
  const overtopWater = '#ef4444';
  const selectedWater = dark ? '#a78bfa' : '#7c3aed';
  const embankmentColor = dark ? '#9a8466' : '#78716c';
  const breachedColor = '#dc2626';
  const depressedFill = dark ? 'rgba(99, 102, 241, 0.14)' : 'rgba(99, 102, 241, 0.11)';
  const depressedOutline = dark ? '#818cf8' : '#4f46e5';
  const floodVolumeColor = '#2563eb';
  const polderVolumeColor = '#0d9488';

  const nameField: unknown[] = ['coalesce', ['get', `name:${lang}`], ['get', 'name']];

  const layers: LayerSpecification[] = [
    { id: 'bg', type: 'background', paint: { 'background-color': bg } },
    {
      id: 'base-hillshade',
      type: 'hillshade',
      source: SRC_DEM,
      paint: {
        'hillshade-exaggeration': 0.28,
        'hillshade-shadow-color': dark ? '#000000' : '#475569',
        'hillshade-highlight-color': dark ? '#334155' : '#ffffff'
      }
    },
    {
      id: 'base-park',
      type: 'fill',
      source: SRC_BASEMAP,
      'source-layer': 'park',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': landPark, 'fill-opacity': 0.7 }
    },
    {
      id: 'base-water',
      type: 'fill',
      source: SRC_BASEMAP,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': baseWater }
    },
    {
      id: 'base-waterway',
      type: 'line',
      source: SRC_BASEMAP,
      'source-layer': 'waterway',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': baseWater, 'line-width': 1.3 }
    },
    {
      id: 'history-urban-fill',
      type: 'fill',
      source: SRC_HISTORY_URBAN,
      paint: {
        'fill-color': '#d37400',
        'fill-opacity': 0.14,
        'fill-outline-color': '#d37400'
      }
    },
    {
      id: 'depression-zones-fill',
      type: 'fill',
      source: SRC_DEPRESSIONS,
      paint: {
        'fill-color': depressedFill,
        'fill-opacity': 0.85
      }
    },
    {
      id: 'depression-zones-outline',
      type: 'line',
      source: SRC_DEPRESSIONS,
      paint: {
        'line-color': depressedOutline,
        'line-width': 1.4,
        'line-dasharray': [3, 2],
        'line-opacity': 0.8
      }
    },
    {
      id: 'base-road-minor',
      type: 'line',
      source: SRC_BASEMAP,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false]],
      paint: { 'line-color': roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 4] }
    },
    {
      id: 'base-road-casing',
      type: 'line',
      source: SRC_BASEMAP,
      'source-layer': 'transportation',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false]],
      paint: { 'line-color': roadCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 4.2] }
    },
    {
      id: 'base-road-major',
      type: 'line',
      source: SRC_BASEMAP,
      'source-layer': 'transportation',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false]],
      paint: { 'line-color': roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 2.8] }
    },
    {
      id: 'silesia-rivers-line',
      type: 'line',
      source: SRC_SILESIA_RIVERS,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'name'], 'Odra', '#0284c7', '#38bdf8'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.8, 10, 3.2],
        'line-opacity': 0.85
      }
    },
    {
      id: 'inundation-3d',
      type: 'fill-extrusion',
      source: SRC_INUNDATION,
      paint: {
        'fill-extrusion-color': ['case', ['get', 'isPolder'], polderVolumeColor, floodVolumeColor],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.48
      }
    },
    {
      id: 'canals-3d',
      type: 'fill-extrusion',
      source: SRC_CANALS,
      paint: {
        'fill-extrusion-color': [
          'case',
          ['get', 'selected'],
          selectedWater,
          [
            'match',
            ['get', 'status'],
            'overtop', overtopWater,
            'warning', warnWater,
            safeWater
          ]
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.88
      }
    },
    {
      id: 'embankments-3d',
      type: 'fill-extrusion',
      source: SRC_EMBANKMENTS,
      paint: {
        'fill-extrusion-color': ['case', ['get', 'breached'], breachedColor, embankmentColor],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.94
      }
    },
    {
      id: 'weirs-3d',
      type: 'fill-extrusion',
      source: SRC_WEIRS,
      paint: {
        'fill-extrusion-color': ['case', ['get', 'controllable'], '#d37400', '#64748b'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.96
      }
    },
    {
      id: 'silesia-facilities-3d',
      type: 'fill-extrusion',
      source: SRC_SILESIA,
      paint: {
        'fill-extrusion-color': [
          'case',
          ['!', ['get', 'active']],
          '#94a3b8',
          ['match', ['get', 'kind'], 'reservoir', '#0284c7', 'polder', '#0d9488', '#d37400']
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.8
      }
    },
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: SRC_BASEMAP,
      'source-layer': 'building',
      minzoom: 12.5,
      layout: {
        visibility: show3dBuildings && view !== 'history' ? 'visible' : 'none'
      },
      paint: {
        'fill-extrusion-color': buildingColor,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.88
      }
    },
    {
      id: 'depression-labels',
      type: 'symbol',
      source: SRC_DEPRESSIONS,
      minzoom: 11.4,
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n', ['get', 'deficit']],
        'text-font': MAP_FONT_REGULAR,
        'text-size': 10.5,
        'text-max-width': 11
      },
      paint: {
        'text-color': depressedOutline,
        'text-halo-color': bg,
        'text-halo-width': 1.5
      }
    },
    {
      id: 'silesia-labels',
      type: 'symbol',
      source: SRC_SILESIA,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': MAP_FONT_REGULAR,
        'text-size': 11,
        'text-max-width': 12
      },
      paint: {
        'text-color': textColor,
        'text-halo-color': bg,
        'text-halo-width': 1.5
      }
    },
    {
      id: 'base-label-water',
      type: 'symbol',
      source: SRC_BASEMAP,
      'source-layer': 'water_name',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: {
        'symbol-placement': 'line',
        'text-field': nameField as never,
        'text-font': MAP_FONT_ITALIC,
        'text-size': 11.5
      },
      paint: {
        'text-color': '#0284c7',
        'text-halo-color': bg,
        'text-halo-width': 1.2
      }
    },
    {
      id: 'base-label-place',
      type: 'symbol',
      source: SRC_BASEMAP,
      'source-layer': 'place',
      filter: ['match', ['get', 'class'], ['city', 'town', 'suburb', 'neighbourhood'], true, false],
      layout: {
        'text-field': nameField as never,
        'text-font': MAP_FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 13, 13],
        'text-max-width': 8
      },
      paint: {
        'text-color': textDim,
        'text-halo-color': bg,
        'text-halo-width': 1.4
      }
    }
  ];

  return {
    version: 8,
    glyphs: BASEMAP_GLYPHS_URL,
    sources: {
      [SRC_BASEMAP]: { type: 'vector', url: BASEMAP_TILEJSON_URL },
      [SRC_DEM]: {
        type: 'raster-dem',
        tiles: [DEM_TILES_URL],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15
      },
      [SRC_DEPRESSIONS]: { type: 'geojson', data: initialSources.depressions, tolerance: 0.25 },
      [SRC_INUNDATION]: { type: 'geojson', data: initialSources.inundation, tolerance: 0.25 },
      [SRC_CANALS]: { type: 'geojson', data: initialSources.canals, tolerance: 0.2 },
      [SRC_EMBANKMENTS]: { type: 'geojson', data: initialSources.embankments, tolerance: 0.2 },
      [SRC_WEIRS]: { type: 'geojson', data: initialSources.weirs, tolerance: 0.15 },
      [SRC_SILESIA]: { type: 'geojson', data: initialSources.silesia, tolerance: 0.25 },
      [SRC_SILESIA_RIVERS]: { type: 'geojson', data: initialSources.silesiaRivers, tolerance: 0.25 },
      [SRC_HISTORY_URBAN]: { type: 'geojson', data: initialSources.historyUrban, tolerance: 0.25 }
    },
    terrain: {
      source: SRC_DEM,
      exaggeration: 1.0
    },
    light: {
      anchor: 'viewport',
      position: [1.2, 210, 35],
      intensity: dark ? 0.55 : 0.45
    },
    layers
  };
}
