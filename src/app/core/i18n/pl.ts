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
  glossary: 'Słowniczek',
  glossaryDesc: 'Najważniejsze pojęcia hydrotechniczne Wrocławskiego Węzła Wodnego.',
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
  polderShavingLabel: 'Poldery przed Trestnem (-260 m³/s)',
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

  // Settings Popup (Layers & Theme)
  settingsTitle: 'Warstwy mapy i motyw',
  layersLabel: 'Warstwy mapy',
  layerBuildings3d: 'Budynki 3D (OSM)',
  layerEmbankments3d: 'Wały przeciwpowodziowe 3D (OSM)',
  layerDepressions: 'Niecki osiedli poniżej korony wału (-m)',
  themeLabel: 'Motyw interfejsu',
  themeLight: 'Jasny (Dzień)',
  themeDark: 'Midnight (Ciemny)',

  // Map Legend & Depression Callout
  legendNormal: 'Bezpieczny (<75%)',
  legendHigh: 'Wysoki (75–100%)',
  legendOvertop: 'Przelanie (>100%)',
  legendEmbankment: 'Wał 3D',
  legendDepressed: 'Poniżej korony wału',
  legendFlooded: 'Strefa zalania 3D',
  belowFloodCrest: 'poniżej korony fali',

  // Sources & Glossary Popups
  sourcesTitle: 'Literatura hydrologiczna i źródła medialne',
  sourcesLiteratureTitle: 'Publikacje naukowe i dokumentacja techniczna',
  sourcesArticlesTitle: 'Artykuły i raporty z osi czasu powodzi',
  sourcesMethodologyTitle: 'Założenia modelu i oficjalne dane ISOK',
  sourcesMethodologyText: 'Linie brzegowe rzek i kanałów, wały, jazy i granice osiedli pochodzą z OpenStreetMap Geofabrik (Dolnośląskie) w 3 poziomach LOD, połączonych z oficjalnymi Mapami Zagrożenia Powodziowego ISOK (PGW Wody Polskie, INSPIRE WFS PL.ZIPGW.6453/MZP-MRP Q10%/Q1%/Q0,2%, pobrano 2026-11-21) oraz NMT EU-DEM. Wizualizacja ma charakter wyłącznie poglądowy — nie stanowi dokumentu urzędowego.',
  sourcesBuiltTitle: 'Atrybucja i cytowanie',
  sourcesBuiltBy: 'Stworzone przez kmd-labs na danych PGW Wody Polskie ISOK MZP (pobrano 2026-11-21), OpenStreetMap / OpenFreeMap i MapLibre GL 3D.',
  citeStyleLabel: 'Styl cytowania',
  citeCopyBtn: 'Kopiuj cytat',
  citeCopiedBtn: 'Skopiowano',
  citeAppTitle: 'Wrocławski Węzeł Wodny: Interaktywna wizualizacja hydrologiczna 3D',
  citeAccessedLabel: 'dostęp',
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
      name: 'Mapy Zagrożenia Powodziowego ISOK (MZP · II cykl, PL.ZIPGW.6453/MZP-MRP)',
      authors: 'PGW Wody Polskie · Hydroportal (wody.isok.gov.pl)',
      year: '2022–2025 (pobr. 2026-11-21)',
      license: 'Otwarte dane publiczne (HVD / INSPIRE)',
      url: 'https://wody.isok.gov.pl/hydroportal.html',
      desc: 'Oficjalne zasięgi zagrożenia powodziowego Q10%, Q1% i Q0,2% wykorzystane do kalibracji międzywala i progów zalewowych (materiał poglądowy).'
    }
  ],
  glossaryEntries: [
    {
      term: 'Wrocławski Węzeł Wodny (WWW)',
      badge: 'System',
      desc: 'Rozbudowany układ naturalnych ramion Odry, sztucznych kanałów powodziowych i żeglugowych, jazów, śluz oraz polderów chroniący Wrocław (3100 m³/s po modernizacji).'
    },
    {
      term: 'Przewał Widawski (Bypas Widawy)',
      badge: '300 m³/s',
      desc: 'Kanał przerzutowy ze Strachocina do doliny Widawy przejmujący do 300 m³/s nadmiaru wód powodziowych z ominięciem centrum Wrocławia.'
    },
    {
      term: 'Brama Przeciwpowodziowa Psie Pole',
      badge: 'Zasuwa',
      desc: 'Zabytkowa brama z 1897 r. (zmodernizowana w 2015 r.) odcinająca Kanał Miejski podczas wezbrań, chroniąca Nadodrze, Ołbin i Kleczków.'
    },
    {
      term: 'Jaz Szczytniki i Przekop Szczytnicki',
      badge: '680 m³/s',
      desc: 'Węzeł rozrządowy Górnej Odry Miejskiej kierujący do 680 m³/s do Starej Odry, aby Śródmieście nie przekroczyło bezpiecznego limitu 950 m³/s.'
    },
    {
      term: 'Polder zalewowy',
      badge: 'Retencja',
      desc: 'Obwałowana dolina (np. Blizanowice–Trestno, Lipki–Oława, Buków) celowo zalewana podczas szczytu fali w celu jego spłaszczenia.'
    },
    {
      term: 'Cofka',
      badge: 'Hydraulika',
      desc: 'Podpiętrzenie wody w górę rzeki lub dopływu wywołane zdławieniem odpływu (np. przy stopniu Rędzin lub na ujściach Ślęzy i Oławy).'
    }
  ],
  osmAttribution: '© Współtwórcy OpenStreetMap · PGW Wody Polskie (ISOK MZP)'
};
