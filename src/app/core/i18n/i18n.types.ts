export type Lang = 'en' | 'pl';

export interface DataSourceItem {
  name: string;
  provider: string;
  url: string;
  license: string;
  licenseUrl: string;
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
  stageAriaLabel: string;

  // Bottom Dock & Playback
  timelineLabel: string;
  dischargeSliderLabel: string;
  playStart: string;
  playStop: string;
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
  statusSafe: string;
  statusWarning: string;
  statusOverflow: string;
  floodedDistrictsLabel: string;
  noFloodingLabel: string;
  gateClosed: string;
  gateOpen: string;
  gateOpeningLabel: string;

  // Map Click Flood Level Popup
  floodPopupTitle: string;
  floodPopupGround: string;
  floodPopupWaterLevel: string;
  floodPopupDepth: string;
  floodPopupDry: string;
  floodPopupProtected: string;
  floodPopupFloodway: string;
  floodPopupUpland: string;

  // Historical Floods View
  scenario1997: string;
  scenario2010: string;
  scenario2024: string;
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

  // Settings & Layers Popups
  settingsTitle: string;
  layersTitle: string;
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

  // Sources Popup
  sourcesTitle: string;
  sourcesDataTitle: string;
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
  dataSourcesList: DataSourceItem[];
  sourcesList: LiteratureSourceItem[];
  osmAttribution: string;
}
