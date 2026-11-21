export type Lang = 'en' | 'pl';

export interface GlossaryEntry {
  term: string;
  badge: string;
  desc: string;
}

export interface LiteratureSourceItem {
  name: string;
  authors: string;
  year: string;
  license: string;
  url: string;
  desc: string;
}

/**
 * Every user-facing text of the application in one language.
 * Add new translation keys here first so TypeScript enforces parity across en.ts and pl.ts.
 */
export interface Dict {
  htmlLang: string;
  docTitle: string;
  langName: string;

  // Top HUD & Navigation
  changeLanguage: string;
  chooseView: string;
  viewEquilibrium: string;
  viewFloods: string;
  viewHistory: string;
  viewSilesia: string;
  stageAriaLabel: string;

  // Bottom Dock & Playback
  timelineLabel: string;
  dischargeSliderLabel: string;
  playStart: string;
  playStop: string;
  glossary: string;
  glossaryDesc: string;
  sourcesBtn: string;
  settingsBtn: string;
  close: string;

  // Map Camera Controls (floating icon button above bottom timeline)
  cameraBtn: string;
  cameraHeading: string;
  cameraZoom: string;
  cameraTilt: string;
  cameraResetNorth: string;
  cameraZoomIn: string;
  cameraZoomOut: string;
  cameraTiltFlat: string;
  cameraTilt3d: string;
  cameraResetView: string;

  // Hydrological Telemetry & Readouts
  readoutTrestno: string;
  readoutNodeLoad: string;
  readoutWidawa: string;
  readoutDowntown: string;
  readoutStaraOdra: string;
  readoutCapacity: string;
  readoutPeak: string;
  readoutStage: string;
  readoutYear: string;
  readoutRetention: string;
  readoutReducedFlow: string;
  segmentCapacity: string;
  segmentLoad: string;

  // Equilibrium View (Weir & Gate Controls)
  weirPanelTitle: string;
  weirPanelSubtitle: string;
  weirToggleBtn: string;
  autoEquilibriumBtn: string;
  presetNormalBtn: string;
  preset1997Btn: string;
  presetMisuseBtn: string;
  polderShavingLabel: string;
  statusSafe: string;
  statusWarning: string;
  statusOverflow: string;
  floodedDistrictsLabel: string;
  noFloodingLabel: string;
  gateClosed: string;
  gateOpen: string;

  // Historical Floods View
  scenario1997: string;
  scenario2012: string;
  scenario2024: string;
  scenario1997Subtitle: string;
  scenario2012Subtitle: string;
  scenario2024Subtitle: string;
  wwwStatePreModern: string;
  wwwStateModern: string;
  pinPendingLabel: string;
  pinOccurredLabel: string;
  readArticleBtn: string;
  waterStageLabel: string;
  dischargeLabel: string;
  floodDayLabel: string;
  hydrographAriaLabel: string;
  waveTransitNote: string;

  // History View
  historySubtitle: string;
  historyNoBuildingsNote: string;

  // Lower Silesia View
  silesiaSubtitle: string;
  silesiaToggleAll: string;
  silesiaWaveLabel: string;
  silesiaInflowPeak: string;
  silesiaAtWroclaw: string;
  silesiaCapacityUnit: string;

  // Settings Popup (Layers & Theme)
  settingsTitle: string;
  layersLabel: string;
  layerBuildings3d: string;
  layerEmbankments3d: string;
  layerDepressions: string;
  themeLabel: string;
  themeLight: string;
  themeDark: string;

  // Map Legend & Depression Callout
  legendNormal: string;
  legendHigh: string;
  legendOvertop: string;
  legendEmbankment: string;
  legendDepressed: string;
  legendFlooded: string;
  belowFloodCrest: string;

  // Sources & Glossary Popups
  sourcesTitle: string;
  sourcesLiteratureTitle: string;
  sourcesArticlesTitle: string;
  sourcesMethodologyTitle: string;
  sourcesMethodologyText: string;
  sourcesBuiltTitle: string;
  sourcesBuiltBy: string;
  citeStyleLabel: string;
  citeCopyBtn: string;
  citeCopiedBtn: string;
  citeAppTitle: string;
  citeAccessedLabel: string;
  sourcesList: LiteratureSourceItem[];
  glossaryEntries: GlossaryEntry[];
  osmAttribution: string;
}
