import { ISOK_MZP_METADATA } from '../data/www-dem-grid.data';
import { Dict } from './i18n.types';

export const PL: Dict = {
  htmlLang: 'pl',
  docTitle: 'KMD · Wrocławski Węzeł Wodny',
  langName: 'Polski',

  // Top HUD & Navigation
  changeLanguage: 'Język',
  chooseView: 'Widok',
  viewEquilibrium: 'Jak działa system',
  viewFloods: 'Historyczne powodzie',
  viewHistory: 'Historia i budowa WWW',
  stageAriaLabel: 'Wizualizacja 3D Wrocławskiego Węzła Wodnego',

  // Bottom Dock & Playback
  timelineLabel: 'Oś czasu symulacji',
  dischargeSliderLabel: 'Dopływ Q w Trestnie (m³/s)',
  playStart: 'Odtwórz symulację',
  playStop: 'Wstrzymaj symulację',
  sourcesBtn: 'Źródła',
  settingsBtn: 'Warstwy',
  close: 'Zamknij',

  // Map Camera Controls
  cameraBtn: 'Kamera mapy (Kierunek, Zoom i Pochylenie)',
  cameraHeading: 'Kierunek',
  cameraZoom: 'Zoom',
  cameraTilt: 'Pochylenie',
  cameraResetNorth: 'Północ',
  cameraZoomIn: 'Przybliż',
  cameraZoomOut: 'Oddal',
  cameraTiltFlat: '2D (0°)',
  cameraTilt3d: '3D (55°)',
  cameraResetView: 'Resetuj kamerę',

  // Hydrological Telemetry & Readouts
  readoutTrestno: 'Trestno Q',
  readoutStaraOdra: 'Stara Odra',
  readoutCapacity: 'Przepustowość',
  readoutPeak: 'Szczyt Q',
  readoutStage: 'Trestno H',
  readoutYear: 'Okres',
  readoutRetention: 'Retencja',
  readoutReducedFlow: 'We Wrocławiu',
  segmentCapacity: 'Przepustowość',
  segmentLoad: 'Obciążenie',

  // How It Works View (Weir & Gate Controls)
  weirPanelTitle: 'Sterowanie jazami i zasuwami',
  weirPanelSubtitle: 'Przesuń zasuwy (0–100%), aby bezpiecznie przeprowadzić falę przez miasto.',
  weirToggleBtn: 'Zasuwy',
  autoEquilibriumBtn: 'Auto-sterowanie',
  statusSafe: 'Przepływ bezpieczny',
  statusWarning: 'Blisko limitu',
  statusOverflow: 'Przelanie wałów!',
  floodedDistrictsLabel: 'Zalane niecki',
  noFloodingLabel: 'Wszystkie wały bezpieczne',
  gateClosed: 'Zamknięta',
  gateOpen: 'Otwarta',
  gateOpeningLabel: 'Otwarcie zasuwy',

  // Map Click Flood Level Popup
  floodPopupTitle: 'Poziom wody powodziowej',
  floodPopupGround: 'Teren (DEM)',
  floodPopupWaterLevel: 'Zwierciadło wody',
  floodPopupDepth: 'Głębokość zalania',
  floodPopupDry: 'Sucho',
  floodPopupProtected: 'Chronione wałem',
  floodPopupFloodway: 'Międzywale',
  floodPopupUpland: 'Sucho',

  // Historical Floods View
  scenario1997: '1997',
  scenario2010: '2010',
  scenario2024: '2024',
  wwwStatePreModern: 'WWW sprzed przebudowy (limit ok. 2350 m³/s)',
  wwwStateModern: 'Zmodernizowany WWW + Racibórz (3100 m³/s)',
  pinPendingLabel: 'Przed wydarzeniem na osi czasu (50% przezroczystości)',
  pinOccurredLabel: 'Wydarzenie nastąpiło (100% widoczności)',
  readArticleBtn: 'Czytaj źródło / artykuł',
  waterStageLabel: 'Stan H',
  dischargeLabel: 'Przepływ Q',
  floodDayLabel: 'Dzień',
  hydrographAriaLabel: 'Wielodniowy hydrogram fali Q (m³/s)',
  waveTransitNote: 'Wysokość rzeki ∝ Q (m³/s) · ~22h przejścia Trestno → Rędzin',

  // History View
  historySubtitle: 'Ewolucja od średniowiecznych rozlewisk do węzła o przepustowości 3100 m³/s',
  historyNoBuildingsNote: 'Współczesne budynki 3D ukryte w widoku historycznym',

  // Settings & Layers Popups
  settingsTitle: 'Ustawienia',
  layersTitle: 'Warstwy mapy',
  layersLabel: 'Warstwy mapy',
  layerBuildings3d: 'Budynki 3D (OSM)',
  layerEmbankments3d: 'Wały przeciwpowodziowe 3D (OSM)',
  layerDepressions: 'Niecki osiedli poniżej korony wału (-m)',
  themeLabel: 'Motyw interfejsu',
  themeLight: 'Jasny',
  themeDark: 'Ciemny',

  // Map Legend & Depression Callout
  legendNormal: 'Bezpieczny (<75%)',
  legendHigh: 'Wysoki (75–100%)',
  legendOvertop: 'Przelanie (>100%)',
  legendEmbankment: 'Wał 3D',
  legendDepressed: 'Poniżej korony wału',
  legendFlooded: 'Strefa zalania 3D',
  belowFloodCrest: 'poniżej korony fali',

  // Sources Popup
  sourcesTitle: 'Źródła danych, licencje i literatura',
  sourcesDataTitle: 'Dane mapowe, integracje i licencje',
  sourcesLiteratureTitle: 'Publikacje naukowe i dokumentacja techniczna',
  sourcesArticlesTitle: 'Artykuły i raporty z osi czasu powodzi',
  sourcesMethodologyTitle: 'Założenia modelu i oficjalne dane ISOK',
  sourcesMethodologyText: `Linie brzegowe rzek i kanałów, wały, jazy i granice osiedli pochodzą z OpenStreetMap Geofabrik (Dolnośląskie) w 3 poziomach LOD, połączonych z oficjalnymi Mapami Zagrożenia Powodziowego ISOK (PGW Wody Polskie, INSPIRE WFS ${ISOK_MZP_METADATA.namespace} Q10%/Q1%/Q0,2%, pobrano ${ISOK_MZP_METADATA.acquiredDate}) oraz NMT EU-DEM. Wizualizacja ma charakter wyłącznie poglądowy — nie stanowi dokumentu urzędowego.`,
  sourcesBuiltTitle: 'Atrybucja i cytowanie',
  sourcesBuiltBy: `Stworzone przez kmd-labs na danych PGW Wody Polskie ISOK MZP (pobrano ${ISOK_MZP_METADATA.acquiredDate}), OpenStreetMap / OpenFreeMap i MapLibre GL 3D.`,
  citeStyleLabel: 'Styl cytowania',
  citeCopyBtn: 'Kopiuj cytat',
  citeCopiedBtn: 'Skopiowano',
  citeAppTitle: 'Wrocławski Węzeł Wodny: Interaktywna wizualizacja hydrologiczna 3D',
  citeAccessedLabel: 'dostęp',
  dataSourcesList: [
    {
      name: 'OpenStreetMap (Geofabrik Dolnośląskie / Opolskie / Śląskie)',
      provider: 'Współtwórcy OpenStreetMap · Geofabrik GmbH',
      url: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
      desc: 'Geometrie rzek i kanałów, wały przeciwpowodziowe, jazy, granice wrocławskich osiedli oraz zbiorniki i poldery w dorzeczu Odry.'
    },
    {
      name: 'Mapy Zagrożenia Powodziowego ISOK (MZP · II cykl)',
      provider: `PGW Wody Polskie · Hydroportal (${ISOK_MZP_METADATA.namespace}, pobr. ${ISOK_MZP_METADATA.acquiredDate})`,
      url: 'https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WFS',
      license: 'Otwarte dane publiczne (INSPIRE / HVD)',
      licenseUrl: 'https://dane.gov.pl/en/regulations',
      desc: 'Oficjalne zasięgi zagrożenia powodziowego Q10%, Q1% i Q0,2% użyte do kalibracji międzywala i progów zalewowych (materiał poglądowy).'
    },
    {
      name: 'OpenFreeMap: Budynki 3D, kafelki wektorowe i fonty Noto',
      provider: 'OpenFreeMap / OpenMapTiles (bryły i wysokości budynków z OSM)',
      url: 'https://openfreemap.org/',
      license: 'MIT / ODbL',
      licenseUrl: 'https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md',
      desc: 'Budynki 3D (ekstruzja render_height na bazie OpenStreetMap), sieć dróg, zieleń, wody oraz glify etykiet mapy.'
    },
    {
      name: 'AWS Terrain Tiles (Terrarium DEM / EU-DEM)',
      provider: 'Mapzen / Registry of Open Data on AWS',
      url: 'https://registry.opendata.aws/terrain-tiles/',
      license: 'Open Data / Copernicus',
      licenseUrl: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
      desc: 'Kafelki wysokościowe Terrarium (z=12) do rzeźby terenu 1:1 oraz siatki zwierciadła wody powodziowej.'
    },
    {
      name: 'MapLibre GL JS',
      provider: 'MapLibre Organization',
      url: 'https://maplibre.org/',
      license: 'BSD-3-Clause',
      licenseUrl: 'https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt',
      desc: 'Otwartoźródłowy silnik WebGL2 do renderowania mapy 3D i niestandardowych shaderów.'
    }
  ],
  sourcesList: [
    {
      name: 'Wrocławski Węzeł Wodny (Monografia i analiza hydrauliczna)',
      authors: 'M. Mokwa, R. Kasperek, M. Wiatkowski i in.',
      year: '2014',
      license: 'Publikacja naukowa',
      url: 'https://www.researchgate.net/publication/271523243_Wroclawski_Wezel_Wodny',
      desc: 'Szczegółowa charakterystyka hydrotechniczna koryt, jazów, śluz i przepustowości Wrocławskiego Węzła Wodnego.'
    },
    {
      name: 'Projekt Ochrony Przeciwpowodziowej Dorzecza Odry (POPDO)',
      authors: 'PGW Wody Polskie · RZGW we Wrocławiu',
      year: '2015–2024',
      license: 'Dane publiczne',
      url: 'https://www.gov.pl/web/wody-polskie-wroclaw',
      desc: 'Parametry modernizacji podnoszącej przepustowość WWW z ok. 2350 m³/s do 3100 m³/s (oraz 3850 m³/s ze zbiornikiem Racibórz Dolny).'
    },
    {
      name: 'Informacja o wynikach kontroli modernizacji WWW',
      authors: 'Najwyższa Izba Kontroli (NIK)',
      year: '2016',
      license: 'Raport publiczny',
      url: 'https://www.nik.gov.pl/aktualnosci/modernizacja-wroclawskiego-wezla-wodnego.html',
      desc: 'Weryfikacja przebudowy Starej Odry, Kanału Powodziowego, stopni Rędzin i Psie Pole oraz bajpasu Widawy.'
    },
    {
      name: `Mapy Zagrożenia Powodziowego ISOK (MZP · II cykl, ${ISOK_MZP_METADATA.namespace})`,
      authors: 'PGW Wody Polskie · Hydroportal (wody.isok.gov.pl)',
      year: `2022–2025 (pobr. ${ISOK_MZP_METADATA.acquiredDate})`,
      license: 'Otwarte dane publiczne (HVD / INSPIRE)',
      url: 'https://wody.isok.gov.pl/hydroportal.html',
      desc: 'Oficjalne zasięgi zagrożenia powodziowego Q10%, Q1% i Q0,2% wykorzystane do kalibracji międzywala i progów zalewowych (materiał poglądowy).'
    }
  ],
  osmAttribution: '© Współtwórcy OpenStreetMap'
};
