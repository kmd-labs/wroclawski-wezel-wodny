import { Dict } from './i18n.types';

export const EN: Dict = {
  htmlLang: 'en',
  docTitle: 'KMD · Wrocławski Węzeł Wodny',
  langName: 'English',

  // Top HUD & Navigation
  changeLanguage: 'Language',
  chooseView: 'View',
  viewEquilibrium: 'How It Works',
  viewFloods: 'Historic Floods',
  viewHistory: 'History & Construction',
  stageAriaLabel: 'Wrocławski Węzeł Wodny 3D Hydrological Map',

  // Bottom Dock & Playback
  timelineLabel: 'Simulation Timeline',
  dischargeSliderLabel: 'Trestno Inflow Q (m³/s)',
  playStart: 'Play simulation',
  playStop: 'Pause simulation',
  glossary: 'Glossary',
  glossaryDesc: 'Key hydrotechnical terms of the Wrocław Water Node.',
  sourcesBtn: 'Sources',
  settingsBtn: 'Layers',
  close: 'Close',

  // Map Camera Controls
  cameraBtn: 'Map Camera (Heading, Zoom & Tilt)',
  cameraHeading: 'Heading',
  cameraZoom: 'Zoom',
  cameraTilt: 'Tilt',
  cameraResetNorth: 'North',
  cameraZoomIn: 'Zoom in',
  cameraZoomOut: 'Zoom out',
  cameraTiltFlat: '2D (0°)',
  cameraTilt3d: '3D (55°)',
  cameraResetView: 'Reset camera',

  // Hydrological Telemetry & Readouts
  readoutTrestno: 'Trestno Q',
  readoutStaraOdra: 'Stara Odra',
  readoutCapacity: 'Capacity',
  readoutPeak: 'Peak Q',
  readoutStage: 'Trestno H',
  readoutYear: 'Era',
  readoutRetention: 'Retention',
  readoutReducedFlow: 'At Wrocław',
  segmentCapacity: 'Max capacity',
  segmentLoad: 'Load',

  // How It Works View (Weir & Gate Controls)
  weirPanelTitle: 'Weir & Floodgate Controls',
  weirPanelSubtitle: 'Adjust gate apertures (0–100%) to route the Odra wave safely.',
  weirToggleBtn: 'Gates',
  autoEquilibriumBtn: 'Auto-Balance',
  polderShavingLabel: 'Upstream Polders (-260 m³/s)',
  statusSafe: 'Flow Safe',
  statusWarning: 'Near Capacity',
  statusOverflow: 'Overflowing!',
  floodedDistrictsLabel: 'Inundated basins',
  noFloodingLabel: 'All embankments holding',
  gateClosed: 'Closed',
  gateOpen: 'Open',
  gateOpeningLabel: 'Gate opening',

  // Map Click Flood Level Popup
  floodPopupTitle: 'Flood Level',
  floodPopupGround: 'Terrain (DEM)',
  floodPopupWaterLevel: 'Flood level',
  floodPopupDepth: 'Water depth',
  floodPopupDry: 'Dry',
  floodPopupProtected: 'Protected by dyke',
  floodPopupFloodway: 'Inter-dyke floodway',
  floodPopupUpland: 'Dry',

  // Historical Floods View
  scenario1997: '1997',
  scenario2010: '2010',
  scenario2024: '2024',
  wwwStatePreModern: 'WWW before modernization (~2,350 m³/s)',
  wwwStateModern: 'Modernized WWW + Racibórz (3,100 m³/s)',
  pinPendingLabel: 'Upcoming on timeline (50% opacity)',
  pinOccurredLabel: 'Occurred on timeline (100% opacity)',
  readArticleBtn: 'Read source article',
  waterStageLabel: 'Stage H',
  dischargeLabel: 'Flow Q',
  floodDayLabel: 'Day',
  hydrographAriaLabel: 'Multi-day flood hydrograph Q (m³/s)',
  waveTransitNote: 'River height ∝ Q (m³/s) · ~22h transit Trestno → Rędzin',

  // History View
  historySubtitle: 'Evolution from medieval braided channels to the 3,100 m³/s modernized node',
  historyNoBuildingsNote: '3D modern buildings hidden in History view',

  // Settings Popup (Layers & Theme)
  settingsTitle: 'Map Layers & Appearance',
  layersLabel: 'Map Layers',
  layerBuildings3d: '3D OSM Buildings',
  layerEmbankments3d: '3D Flood Embankments (OSM Dykes)',
  layerDepressions: 'Low-Lying District Basins (-m)',
  themeLabel: 'Appearance',
  themeLight: 'Light (Day)',
  themeDark: 'Midnight (Dark)',

  // Map Legend & Depression Callout
  legendNormal: 'Safe (<75%)',
  legendHigh: 'High (75–100%)',
  legendOvertop: 'Overflowing (>100%)',
  legendEmbankment: '3D Embankment',
  legendDepressed: 'Below Flood Crest',
  legendFlooded: 'Flooded Volume',
  belowFloodCrest: 'below flood crest',

  // Sources & Glossary Popups
  sourcesTitle: 'Hydrological Literature & Event Sources',
  sourcesLiteratureTitle: 'Scientific & Hydrotechnical Literature',
  sourcesArticlesTitle: 'Timeline News & Report Citations',
  sourcesMethodologyTitle: 'Hydrological Model & Official ISOK Data Notes',
  sourcesMethodologyText: 'River banks, canals, flood dykes, weirs, and osiedle basins are extracted directly from Geofabrik OpenStreetMap PBF extracts (Dolnośląskie) across 3 LOD tiers, combined with official PGW Wody Polskie ISOK Flood Hazard Maps (MZP, INSPIRE WFS PL.ZIPGW.6453/MZP-MRP Q10%/Q1%/Q0.2%, acquired 2026-11-21) and AWS Terrarium EU-DEM elevation. Illustrative/informational visualization only — not an official administrative document.',
  sourcesBuiltTitle: 'Attribution & Citation',
  sourcesBuiltBy: 'Built by kmd-labs using PGW Wody Polskie ISOK MZP (acquired 2026-11-21), OpenStreetMap / OpenFreeMap & MapLibre GL 3D.',
  citeStyleLabel: 'Citation style',
  citeCopyBtn: 'Copy citation',
  citeCopiedBtn: 'Copied',
  citeAppTitle: 'Wrocławski Węzeł Wodny: Interactive 3D Hydrological & Flood Visualization',
  citeAccessedLabel: 'accessed',
  sourcesList: [
    {
      name: 'Wrocławski Węzeł Wodny (Monograph & Hydraulic Analysis)',
      authors: 'M. Mokwa, R. Kasperek, M. Wiatkowski et al.',
      year: '2014',
      license: 'Academic',
      url: 'https://www.researchgate.net/publication/271523243_Wroclawski_Wezel_Wodny',
      desc: 'Comprehensive hydrotechnical analysis of the Wrocław Water Node channels, weirs, and floodway capacities.'
    },
    {
      name: 'Odra River Basin Flood Protection Project (POPDO / Wody Polskie)',
      authors: 'PGW Wody Polskie · RZGW Wrocław',
      year: '2015–2024',
      license: 'Public Data',
      url: 'https://www.gov.pl/web/wody-polskie-wroclaw',
      desc: 'Official modernization parameters increasing WWW throughput from ~2,350 m³/s to 3,100 m³/s (and 3,850 m³/s with Racibórz Dolny).'
    },
    {
      name: 'Audit of Wrocław Water Node Modernization',
      authors: 'Supreme Audit Office (NIK)',
      year: '2016',
      license: 'Public Report',
      url: 'https://www.nik.gov.pl/aktualnosci/modernizacja-wroclawskiego-wezla-wodnego.html',
      desc: 'Technical verification of Stara Odra, Kanał Powodziowy, Rędzin, Psie Pole, and Widawa bypass works.'
    },
    {
      name: 'ISOK Flood Hazard Maps (MZP · Cycle II, PL.ZIPGW.6453/MZP-MRP)',
      authors: 'PGW Wody Polskie · Hydroportal (wody.isok.gov.pl)',
      year: '2022–2025 (acq. 2026-11-21)',
      license: 'Open Public Data (HVD / INSPIRE)',
      url: 'https://wody.isok.gov.pl/hydroportal.html',
      desc: 'Official Q10%, Q1%, and Q0.2% fluvial flood hazard polygons used to calibrate inter-dyke floodways and basin inundation onset (illustrative use).'
    }
  ],
  glossaryEntries: [
    {
      term: 'Wrocławski Węzeł Wodny (WWW)',
      badge: 'System',
      desc: 'Complex hydrotechnical network of natural Odra branches, artificial flood/navigation canals, weirs, locks, and polders protecting Wrocław (3,100 m³/s post-POPDO capacity).'
    },
    {
      term: 'Przewał Widawski (Odra–Widawa Bypass)',
      badge: '300 m³/s',
      desc: 'Controlled transfer canal at Strachocin diverting up to 300 m³/s from the Odra into the Widawa valley around northern Wrocław.'
    },
    {
      term: 'Brama Przeciwpowodziowa Psie Pole',
      badge: 'Floodgate',
      desc: 'Historic 1897 (modernized 2015) floodgate sealing Kanał Miejski during flood waves to protect low-lying Nadodrze, Ołbin, and Kleczków.'
    },
    {
      term: 'Jaz Szczytniki & Przekop Szczytnicki',
      badge: '680 m³/s',
      desc: 'Diversion weir splitting Górna Odra Miejska: sends up to 680 m³/s north into Stara Odra so Downtown (Śródmieście) never exceeds 950 m³/s.'
    },
    {
      term: 'Polder zalewowy (Floodplain Polder)',
      badge: 'Retention',
      desc: 'Embanked floodplain basin (e.g., Blizanowice–Trestno, Lipki–Oława, Buków) intentionally flooded during high water to shave the peak wave.'
    },
    {
      term: 'Cofka (Backwater Effect)',
      badge: 'Hydraulics',
      desc: 'Upstream rise in water surface when downstream outflow is throttled (e.g., at Rędzin or tributary mouths of Ślęza and Oława).'
    }
  ],
  osmAttribution: '© OpenStreetMap · PGW Wody Polskie (ISOK MZP)'
};
