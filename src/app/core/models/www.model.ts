export type ViewMode = 'equilibrium' | 'floods' | 'history' | 'silesia';

export type GateId =
  | 'bartoszowice'
  | 'opatowice'
  | 'szczytniki'
  | 'widawa'
  | 'psie-pole'
  | 'redzin';

export type FloodScenarioId = '1997' | '2012' | '2024';

export type PinCategory = 'breach' | 'weir' | 'polder' | 'defense' | 'milestone' | 'reservoir';

export interface CanalSegment {
  id: string;
  nameEn: string;
  namePl: string;
  coords: [number, number][];
  halfWidthM: number;
  maxCapacityM3s: number;
  normalFlowM3s: number;
  /** Low-water reference height in metres for 3D extrusion baseline. */
  baseWaterM: number;
  /** Bankfull / embankment crest height in metres above local datum. */
  crestHeightM: number;
  builtYear: number;
  modernizedYear?: number;
  isTributary?: boolean;
}

export interface EmbankmentSegment {
  id: string;
  nameEn: string;
  namePl: string;
  coords: [number, number][];
  halfWidthM: number;
  crestHeightM: number;
  elevationMasl: number;
  builtYear: number;
  modernizedYear?: number;
  protectsZoneId: string;
}

export interface DepressedZone {
  id: string;
  nameEn: string;
  namePl: string;
  polygon: [number, number][];
  groundMasl: number;
  riverFloodMasl: number;
  /** Negative value in metres indicating how far ground sits below flood crest. */
  depressionDepthM: number;
  /** Branches whose overtopping (>100% load) inundates this zone. */
  triggerBranches: string[];
}

export interface WeirNode {
  id: string;
  controllable: boolean;
  gateId?: GateId;
  nameEn: string;
  namePl: string;
  roleEn: string;
  rolePl: string;
  lngLat: [number, number];
  footprintHalfM: number;
  structureHeightM: number;
  maxCapacityM3s: number;
  builtYear: number;
  modernizedYear?: number;
}

export interface FloodEventPin {
  id: string;
  scenario: FloodScenarioId;
  /** Timeline position 0..100 when this event occurs. */
  step: number;
  lngLat: [number, number];
  dateLabel: string;
  category: PinCategory;
  waterLevelCm?: number;
  flowM3s?: number;
  titleEn: string;
  titlePl: string;
  descEn: string;
  descPl: string;
  sourceOutlet: string;
  sourceTitleEn: string;
  sourceTitlePl: string;
  sourceUrl: string;
  breachedZoneId?: string;
}

export interface FloodScenarioKeyframe {
  step: number;
  dateLabel: string;
  flowTrestnoM3s: number;
  stageTrestnoCm: number;
  /** Zone IDs inundated at or after this step. */
  floodedZones: string[];
  /** Embankment IDs breached at or after this step. */
  breachedEmbankments: string[];
  /** Overloaded canal IDs. */
  overloadedCanals: string[];
}

export interface FloodScenarioMeta {
  id: FloodScenarioId;
  year: number;
  peakFlowM3s: number;
  peakStageCm: number;
  systemCapacityM3s: number;
  keyframes: FloodScenarioKeyframe[];
  pins: FloodEventPin[];
}

export interface HistoryEra {
  year: number;
  labelEn: string;
  labelPl: string;
  capacityM3s: number;
  summaryEn: string;
  summaryPl: string;
  activeCanals: string[];
  activeWeirs: string[];
  urbanFootprint: [number, number][];
  pin: {
    id: string;
    lngLat: [number, number];
    titleEn: string;
    titlePl: string;
    descEn: string;
    descPl: string;
    sourceOutlet: string;
    sourceUrl: string;
  };
}

export interface SilesiaFacility {
  id: string;
  kind: 'reservoir' | 'polder' | 'bypass';
  nameEn: string;
  namePl: string;
  river: string;
  lngLat: [number, number];
  polygon: [number, number][];
  capacityMlnM3: number;
  peakReductionM3s: number;
  commissionedYear: number;
  waveArrivalStep: number;
  descEn: string;
  descPl: string;
}

export interface BranchHydrology {
  id: string;
  flowM3s: number;
  maxCapacityM3s: number;
  loadRatio: number;
  stageM: number;
  freeboardM: number;
  overtopped: boolean;
}

export interface MapPinViewModel {
  id: string;
  lngLat: [number, number];
  screenX: number;
  screenY: number;
  visible: boolean;
  reached: boolean;
  opacity: number;
  category: PinCategory;
  label: string;
  dateLabel: string;
  waterLevelCm?: number;
  flowM3s?: number;
  title: string;
  desc: string;
  sourceOutlet: string;
  sourceTitle: string;
  sourceUrl: string;
}
