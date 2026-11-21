import type { LngLatBoundsLike, LngLatLike } from 'maplibre-gl';

export const WROCLAW_CENTER: LngLatLike = [17.048, 51.113];
export const SILESIA_CENTER: LngLatLike = [17.35, 50.62];

export const WROCLAW_BOUNDS: LngLatBoundsLike = [
  [15.65, 49.75],
  [18.65, 51.55]
];

export const MAP_DEFAULT_ZOOM = 12.1;
export const MAP_SILESIA_ZOOM = 8.1;
export const MAP_MIN_ZOOM = 6.5;
export const MAP_MAX_ZOOM = 18;

export const BASEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
export const BASEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const MAP_FONT_REGULAR = ['Noto Sans Regular'];
export const MAP_FONT_BOLD = ['Noto Sans Bold'];
export const MAP_FONT_ITALIC = ['Noto Sans Italic'];

export const SRC_BASEMAP = 'basemap';
export const SRC_DEM = 'www-dem';
export const DEM_TILES_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const SRC_DEPRESSIONS = 'www-depressions';
export const SRC_INUNDATION = 'www-inundation';
export const SRC_CANALS = 'www-canals';
export const SRC_EMBANKMENTS = 'www-embankments';
export const SRC_WEIRS = 'www-weirs';
export const SRC_SILESIA = 'www-silesia';
export const SRC_SILESIA_RIVERS = 'www-silesia-rivers';
export const SRC_HISTORY_URBAN = 'www-history-urban';
