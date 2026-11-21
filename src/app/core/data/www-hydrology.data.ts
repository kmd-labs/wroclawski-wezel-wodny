import {
  CanalSegment,
  DepressedZone,
  EmbankmentSegment,
  GateId,
  WeirNode
} from '../models/www.model';

/**
 * Converts a polyline in [lng, lat] degrees into a closed polygon buffered by `halfWidthM` metres.
 * Uses local equirectangular scaling at Wrocław's latitude (51.11° N).
 */
export function bufferLineToPolygon(
  coords: [number, number][],
  halfWidthM: number
): [number, number][][] {
  if (coords.length < 2) return [[]];
  const latRad = (51.11 * Math.PI) / 180;
  const mPerDegLat = 111195;
  const mPerDegLon = 111195 * Math.cos(latRad);

  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < coords.length; i++) {
    const prev = coords[Math.max(0, i - 1)];
    const next = coords[Math.min(coords.length - 1, i + 1)];
    const dx = (next[0] - prev[0]) * mPerDegLon;
    const dy = (next[1] - prev[1]) * mPerDegLat;
    const len = Math.hypot(dx, dy) || 1;
    // Unit normal vector
    const nx = -dy / len;
    const ny = dx / len;
    const dLon = (nx * halfWidthM) / mPerDegLon;
    const dLat = (ny * halfWidthM) / mPerDegLat;
    left.push([coords[i][0] + dLon, coords[i][1] + dLat]);
    right.push([coords[i][0] - dLon, coords[i][1] - dLat]);
  }

  const ring = [...left, ...right.reverse(), left[0]];
  return [ring];
}

/** Creates a small rectangular footprint around a point [lng, lat] for 3D weirs/locks. */
export function pointBoxPolygon(
  lngLat: [number, number],
  halfM: number
): [number, number][][] {
  const latRad = (lngLat[1] * Math.PI) / 180;
  const dLon = halfM / (111195 * Math.cos(latRad));
  const dLat = halfM / 111195;
  const [x, y] = lngLat;
  return [[
    [x - dLon, y - dLat],
    [x + dLon, y - dLat],
    [x + dLon, y + dLat],
    [x - dLon, y + dLat],
    [x - dLon, y - dLat]
  ]];
}

/**
 * Wrocławski Węzeł Wodny (WWW) Canal & River Network.
 * Capacities reflect post-POPDO modernization (3100 m³/s total design wave at Trestno:
 * 2800 m³/s through Odra channels + 300 m³/s through the Odra–Widawa transfer bypass).
 */
export const CANAL_SEGMENTS: CanalSegment[] = [
  {
    id: 'odra-upper',
    nameEn: 'Upper Odra (Trestno → Bartoszowice)',
    namePl: 'Odra Górna (Trestno → Bartoszowice)',
    coords: [
      [17.136, 51.069],
      [17.116, 51.080],
      [17.099, 51.091],
      [17.091, 51.097]
    ],
    halfWidthM: 68,
    maxCapacityM3s: 3100,
    normalFlowM3s: 420,
    baseWaterM: 1.6,
    crestHeightM: 7.4,
    builtYear: 1241,
    modernizedYear: 2015
  },
  {
    id: 'przewal-widawski',
    nameEn: 'Odra–Widawa Transfer Canal (Przewał Widawski)',
    namePl: 'Kanał Przerzutowy Odra–Widawa (Przewał Widawski)',
    coords: [
      [17.103, 51.094],
      [17.118, 51.105],
      [17.134, 51.119],
      [17.141, 51.135],
      [17.125, 51.150],
      [17.075, 51.163],
      [17.015, 51.174],
      [16.968, 51.190],
      [16.912, 51.203]
    ],
    halfWidthM: 38,
    maxCapacityM3s: 300,
    normalFlowM3s: 0,
    baseWaterM: 0.4,
    crestHeightM: 5.0,
    builtYear: 1917,
    modernizedYear: 2016
  },
  {
    id: 'kanal-powodziowy',
    nameEn: 'Flood Canal (Kanał Powodziowy)',
    namePl: 'Kanał Powodziowy (Bartoszowice → Zacisze)',
    coords: [
      [17.091, 51.098],
      [17.094, 51.106],
      [17.089, 51.116],
      [17.074, 51.124],
      [17.064, 51.127]
    ],
    halfWidthM: 48,
    maxCapacityM3s: 1170,
    normalFlowM3s: 130,
    baseWaterM: 1.3,
    crestHeightM: 6.8,
    builtYear: 1917,
    modernizedYear: 2015
  },
  {
    id: 'kanal-zeglugowy',
    nameEn: 'Navigation Canal (Kanał Żeglugowy)',
    namePl: 'Kanał Żeglugowy (Bartoszowice → Zacisze)',
    coords: [
      [17.093, 51.099],
      [17.097, 51.107],
      [17.092, 51.118],
      [17.076, 51.126],
      [17.065, 51.128]
    ],
    halfWidthM: 22,
    maxCapacityM3s: 110,
    normalFlowM3s: 35,
    baseWaterM: 1.1,
    crestHeightM: 6.2,
    builtYear: 1917,
    modernizedYear: 2015
  },
  {
    id: 'odra-miejska-upper',
    nameEn: 'Upper City Odra (Opatowice → Szczytniki)',
    namePl: 'Górna Odra Miejska (Opatowice → Szczytniki)',
    coords: [
      [17.091, 51.097],
      [17.081, 51.100],
      [17.071, 51.103],
      [17.063, 51.106]
    ],
    halfWidthM: 52,
    maxCapacityM3s: 1630,
    normalFlowM3s: 255,
    baseWaterM: 1.4,
    crestHeightM: 6.9,
    builtYear: 1241,
    modernizedYear: 2015
  },
  {
    id: 'przekop-szczytnicki',
    nameEn: 'Szczytniki Cut (Przekop Szczytnicki)',
    namePl: 'Przekop Szczytnicki (Szczytniki → Stara Odra)',
    coords: [
      [17.063, 51.106],
      [17.064, 51.112],
      [17.063, 51.120],
      [17.064, 51.127]
    ],
    halfWidthM: 42,
    maxCapacityM3s: 680,
    normalFlowM3s: 90,
    baseWaterM: 1.2,
    crestHeightM: 6.4,
    builtYear: 1555,
    modernizedYear: 2015
  },
  {
    id: 'srodmiescie',
    nameEn: 'Downtown Water Node (Śródmieście & Ostrów Tumski)',
    namePl: 'Śródmiejski Węzeł Wodny (Ostrów Tumski, Kępa Mieszczańska)',
    coords: [
      [17.063, 51.106],
      [17.053, 51.109],
      [17.043, 51.114],
      [17.032, 51.116],
      [17.022, 51.119],
      [17.011, 51.124]
    ],
    halfWidthM: 46,
    maxCapacityM3s: 950,
    normalFlowM3s: 165,
    baseWaterM: 1.3,
    crestHeightM: 5.9,
    builtYear: 1241,
    modernizedYear: 2015
  },
  {
    id: 'stara-odra',
    nameEn: 'Old Odra Floodway (Stara Odra)',
    namePl: 'Stara Odra (Zacisze → Psie Pole → Osobowice)',
    coords: [
      [17.064, 51.127],
      [17.053, 51.129],
      [17.042, 51.132],
      [17.031, 51.135],
      [17.018, 51.133],
      [17.011, 51.124]
    ],
    halfWidthM: 58,
    maxCapacityM3s: 1850,
    normalFlowM3s: 220,
    baseWaterM: 1.4,
    crestHeightM: 7.0,
    builtYear: 1241,
    modernizedYear: 2015
  },
  {
    id: 'kanal-miejski',
    nameEn: 'City Navigation Canal (Kanał Miejski — Floodgate Protected)',
    namePl: 'Kanał Miejski (chroniony Bramą Przeciwpowodziową Psie Pole)',
    coords: [
      [17.056, 51.128],
      [17.044, 51.126],
      [17.033, 51.127],
      [17.026, 51.133]
    ],
    halfWidthM: 22,
    maxCapacityM3s: 180,
    normalFlowM3s: 35,
    baseWaterM: 1.0,
    crestHeightM: 4.4,
    builtYear: 1897,
    modernizedYear: 2015
  },
  {
    id: 'odra-redzin',
    nameEn: 'Lower Wrocław Odra (Osobowice → Rędzin → Pracze Odrzańskie)',
    namePl: 'Dolna Odra Wrocławska (Osobowice → Rędzin → Pracze Odrzańskie)',
    coords: [
      [17.011, 51.124],
      [16.995, 51.129],
      [16.979, 51.139],
      [16.960, 51.150],
      [16.939, 51.163],
      [16.916, 51.184],
      [16.906, 51.204]
    ],
    halfWidthM: 72,
    maxCapacityM3s: 3100,
    normalFlowM3s: 420,
    baseWaterM: 1.5,
    crestHeightM: 7.2,
    builtYear: 1241,
    modernizedYear: 2015
  },
  {
    id: 'olawa-river',
    nameEn: 'Oława River (Przedmieście Oławskie)',
    namePl: 'Rzeka Oława (Przedmieście Oławskie)',
    coords: [
      [17.090, 51.072],
      [17.075, 51.084],
      [17.064, 51.096],
      [17.056, 51.106]
    ],
    halfWidthM: 18,
    maxCapacityM3s: 160,
    normalFlowM3s: 18,
    baseWaterM: 0.9,
    crestHeightM: 4.5,
    builtYear: 1241,
    isTributary: true
  },
  {
    id: 'sleza-river',
    nameEn: 'Ślęza River (Kozanów)',
    namePl: 'Rzeka Ślęza (Kozanów)',
    coords: [
      [16.968, 51.092],
      [16.973, 51.110],
      [16.977, 51.125],
      [16.979, 51.139]
    ],
    halfWidthM: 18,
    maxCapacityM3s: 140,
    normalFlowM3s: 14,
    baseWaterM: 0.9,
    crestHeightM: 4.8,
    builtYear: 1241,
    isTributary: true
  },
  {
    id: 'bystrzyca-river',
    nameEn: 'Bystrzyca River (Marszowice → Pracze Odrzańskie)',
    namePl: 'Rzeka Bystrzyca (Marszowice → Pracze Odrzańskie)',
    coords: [
      [16.885, 51.128],
      [16.901, 51.145],
      [16.912, 51.164],
      [16.917, 51.183]
    ],
    halfWidthM: 20,
    maxCapacityM3s: 210,
    normalFlowM3s: 24,
    baseWaterM: 1.0,
    crestHeightM: 5.0,
    builtYear: 1241,
    isTributary: true
  }
];

export const EMBANKMENT_SEGMENTS: EmbankmentSegment[] = [
  {
    id: 'wal-szczytnicki',
    nameEn: 'Bartoszowice–Szczytniki Embankment (Wielka Wyspa)',
    namePl: 'Grobla Szczytnicko-Bartoszowicka (Wielka Wyspa)',
    coords: [
      [17.089, 51.098],
      [17.092, 51.106],
      [17.087, 51.115],
      [17.073, 51.122],
      [17.065, 51.125]
    ],
    halfWidthM: 14,
    crestHeightM: 7.2,
    elevationMasl: 122.4,
    builtYear: 1917,
    modernizedYear: 2015,
    protectsZoneId: 'wielka-wyspa'
  },
  {
    id: 'wal-swojczycki',
    nameEn: 'Swojczyce–Kowale Embankment',
    namePl: 'Wał Swojczycko-Kowalski',
    coords: [
      [17.099, 51.096],
      [17.100, 51.108],
      [17.095, 51.119],
      [17.078, 51.128]
    ],
    halfWidthM: 14,
    crestHeightM: 7.0,
    elevationMasl: 122.1,
    builtYear: 1917,
    modernizedYear: 2015,
    protectsZoneId: 'kowale-swojczyce'
  },
  {
    id: 'wal-karlowicki',
    nameEn: 'Karłowice–Różanka Embankment',
    namePl: 'Wał Karłowicko-Różankowski',
    coords: [
      [17.063, 51.129],
      [17.044, 51.134],
      [17.028, 51.137],
      [17.012, 51.127]
    ],
    halfWidthM: 14,
    crestHeightM: 7.1,
    elevationMasl: 120.8,
    builtYear: 1917,
    modernizedYear: 2015,
    protectsZoneId: 'nadodrze-olbin'
  },
  {
    id: 'wal-nadodrze',
    nameEn: 'Nadodrze–Kleczków Canal Dike',
    namePl: 'Wał Kanału Miejskiego (Nadodrze / Kleczków)',
    coords: [
      [17.055, 51.126],
      [17.044, 51.124],
      [17.033, 51.125],
      [17.025, 51.131]
    ],
    halfWidthM: 12,
    crestHeightM: 5.1,
    elevationMasl: 118.9,
    builtYear: 1897,
    modernizedYear: 2015,
    protectsZoneId: 'nadodrze-olbin'
  },
  {
    id: 'wal-opatowicki',
    nameEn: 'Opatowice–Bierdzany Embankment',
    namePl: 'Wał Opatowicko-Bierdzański',
    coords: [
      [17.115, 51.078],
      [17.097, 51.090],
      [17.081, 51.098],
      [17.068, 51.102]
    ],
    halfWidthM: 14,
    crestHeightM: 7.1,
    elevationMasl: 122.6,
    builtYear: 1916,
    modernizedYear: 2015,
    protectsZoneId: 'opatowice-bierdzany'
  },
  {
    id: 'wal-przedmiescie',
    nameEn: 'Przedmieście Oławskie / Niskie Łąki Embankment',
    namePl: 'Wał Przedmieścia Oławskiego i Niskich Łąk',
    coords: [
      [17.088, 51.074],
      [17.073, 51.086],
      [17.062, 51.098],
      [17.054, 51.107]
    ],
    halfWidthM: 12,
    crestHeightM: 5.8,
    elevationMasl: 120.4,
    builtYear: 1910,
    modernizedYear: 2014,
    protectsZoneId: 'przedmiescie-olawskie'
  },
  {
    id: 'wal-kozanow',
    nameEn: 'Kozanów Embankment (Odra & Ślęza)',
    namePl: 'Wał Kozanowski (Odra i Ślęza)',
    coords: [
      [17.008, 51.123],
      [16.992, 51.128],
      [16.979, 51.137],
      [16.975, 51.122],
      [16.971, 51.108]
    ],
    halfWidthM: 14,
    crestHeightM: 7.0,
    elevationMasl: 118.4,
    builtYear: 1930,
    modernizedYear: 2014,
    protectsZoneId: 'kozanow-pilczyce'
  },
  {
    id: 'wal-maslice',
    nameEn: 'Pilczyce–Rędzin Embankment',
    namePl: 'Wał Pilczycko-Rędziński',
    coords: [
      [16.975, 51.138],
      [16.957, 51.148],
      [16.937, 51.161]
    ],
    halfWidthM: 14,
    crestHeightM: 7.2,
    elevationMasl: 117.6,
    builtYear: 1917,
    modernizedYear: 2015,
    protectsZoneId: 'kozanow-pilczyce'
  },
  {
    id: 'wal-blizanowice',
    nameEn: 'Blizanowice–Trestno Polder Ring Dike',
    namePl: 'Wał Polderu Blizanowice–Trestno',
    coords: [
      [17.152, 51.055],
      [17.136, 51.067],
      [17.116, 51.077]
    ],
    halfWidthM: 13,
    crestHeightM: 6.4,
    elevationMasl: 123.3,
    builtYear: 1935,
    modernizedYear: 2014,
    protectsZoneId: 'polder-blizanowice-trestno'
  },
  {
    id: 'wal-marszowice',
    nameEn: 'Marszowice–Stabłowice (Bystrzyca) Embankment',
    namePl: 'Wał Marszowicko-Stabłowicki (Bystrzyca)',
    coords: [
      [16.889, 51.130],
      [16.904, 51.146],
      [16.914, 51.164]
    ],
    halfWidthM: 12,
    crestHeightM: 5.6,
    elevationMasl: 116.8,
    builtYear: 1932,
    modernizedYear: 2018,
    protectsZoneId: 'pracze-odrzanskie'
  },
  {
    id: 'wal-pracze',
    nameEn: 'Pracze Odrzańskie–Janówek–Osobowice Embankment',
    namePl: 'Wał Praczy Odrzańskich, Janówka i Osobowic',
    coords: [
      [16.938, 51.162],
      [16.924, 51.178],
      [16.912, 51.196]
    ],
    halfWidthM: 13,
    crestHeightM: 6.8,
    elevationMasl: 114.2,
    builtYear: 1928,
    modernizedYear: 2016,
    protectsZoneId: 'pracze-odrzanskie'
  }
];

/**
 * Low-lying floodplain basins inside Wrocław whose ground sits several metres BELOW
 * the adjacent river flood stage / embankment crest.
 */
export const DEPRESSED_ZONES: DepressedZone[] = [
  {
    id: 'wielka-wyspa',
    nameEn: 'Wielka Wyspa (Biskupin / Sępolno / Zalesie)',
    namePl: 'Wielka Wyspa (Biskupin / Sępolno / Zalesie)',
    polygon: [
      [17.067, 51.107],
      [17.087, 51.099],
      [17.090, 51.114],
      [17.073, 51.121],
      [17.065, 51.116],
      [17.067, 51.107]
    ],
    groundMasl: 118.4,
    riverFloodMasl: 122.0,
    depressionDepthM: -3.6,
    triggerBranches: ['kanal-powodziowy', 'przekop-szczytnicki']
  },
  {
    id: 'kozanow-pilczyce',
    nameEn: 'Kozanów & Pilczyce Basin',
    namePl: 'Niecka Kozanowa i Pilczyc',
    polygon: [
      [16.973, 51.123],
      [16.995, 51.126],
      [17.007, 51.122],
      [17.004, 51.113],
      [16.982, 51.111],
      [16.973, 51.123]
    ],
    groundMasl: 114.2,
    riverFloodMasl: 118.4,
    depressionDepthM: -4.2,
    triggerBranches: ['odra-redzin', 'sleza-river']
  },
  {
    id: 'przedmiescie-olawskie',
    nameEn: 'Przedmieście Oławskie & Niskie Łąki',
    namePl: 'Przedmieście Oławskie i Niskie Łąki',
    polygon: [
      [17.048, 51.105],
      [17.062, 51.097],
      [17.074, 51.089],
      [17.065, 51.084],
      [17.043, 51.095],
      [17.048, 51.105]
    ],
    groundMasl: 117.0,
    riverFloodMasl: 120.4,
    depressionDepthM: -3.4,
    triggerBranches: ['odra-miejska-upper', 'olawa-river']
  },
  {
    id: 'nadodrze-olbin',
    nameEn: 'Nadodrze, Ołbin & Kleczków',
    namePl: 'Nadodrze, Ołbin i Kleczków',
    polygon: [
      [17.028, 51.125],
      [17.043, 51.124],
      [17.055, 51.125],
      [17.053, 51.116],
      [17.032, 51.117],
      [17.028, 51.125]
    ],
    groundMasl: 115.6,
    riverFloodMasl: 119.4,
    depressionDepthM: -3.8,
    triggerBranches: ['kanal-miejski', 'stara-odra']
  },
  {
    id: 'ostrow-tumski',
    nameEn: 'Śródmieście, Ostrów Tumski & Kępa Mieszczańska',
    namePl: 'Śródmieście, Ostrów Tumski i Kępa Mieszczańska',
    polygon: [
      [17.022, 51.117],
      [17.042, 51.115],
      [17.053, 51.112],
      [17.049, 51.108],
      [17.024, 51.111],
      [17.022, 51.117]
    ],
    groundMasl: 116.8,
    riverFloodMasl: 119.3,
    depressionDepthM: -2.5,
    triggerBranches: ['srodmiescie']
  },
  {
    id: 'kowale-swojczyce',
    nameEn: 'Kowale, Swojczyce & Strachocin',
    namePl: 'Kowale, Swojczyce i Strachocin',
    polygon: [
      [17.078, 51.130],
      [17.098, 51.120],
      [17.116, 51.108],
      [17.104, 51.099],
      [17.095, 51.118],
      [17.078, 51.130]
    ],
    groundMasl: 118.9,
    riverFloodMasl: 122.0,
    depressionDepthM: -3.1,
    triggerBranches: ['kanal-powodziowy', 'przewal-widawski']
  },
  {
    id: 'opatowice-bierdzany',
    nameEn: 'Opatowice, Bierdzany & Księże Małe',
    namePl: 'Opatowice, Bierdzany i Księże Małe',
    polygon: [
      [17.070, 51.100],
      [17.096, 51.089],
      [17.112, 51.078],
      [17.096, 51.073],
      [17.072, 51.088],
      [17.070, 51.100]
    ],
    groundMasl: 118.7,
    riverFloodMasl: 122.6,
    depressionDepthM: -3.9,
    triggerBranches: ['odra-upper', 'odra-miejska-upper']
  },
  {
    id: 'polder-blizanowice-trestno',
    nameEn: 'Polder Blizanowice–Trestno (Retention Basin)',
    namePl: 'Polder Blizanowice–Trestno (Zbiornik zalewowy)',
    polygon: [
      [17.120, 51.074],
      [17.136, 51.066],
      [17.152, 51.056],
      [17.139, 51.050],
      [17.118, 51.064],
      [17.120, 51.074]
    ],
    groundMasl: 118.5,
    riverFloodMasl: 123.3,
    depressionDepthM: -4.8,
    triggerBranches: ['odra-upper']
  },
  {
    id: 'pracze-odrzanskie',
    nameEn: 'Pracze Odrzańskie, Janówek & Rędzin–Świniary',
    namePl: 'Pracze Odrzańskie, Janówek i Rędzin–Świniary',
    polygon: [
      [16.885, 51.162],
      [16.925, 51.164],
      [16.985, 51.182],
      [16.968, 51.206],
      [16.905, 51.206],
      [16.885, 51.162]
    ],
    groundMasl: 110.5,
    riverFloodMasl: 114.2,
    depressionDepthM: -3.7,
    triggerBranches: ['odra-redzin', 'bystrzyca-river', 'przewal-widawski']
  }
];

export const WEIR_NODES: WeirNode[] = [
  {
    id: 'bartoszowice',
    controllable: true,
    gateId: 'bartoszowice',
    nameEn: 'Jaz Bartoszowice',
    namePl: 'Jaz Bartoszowice',
    roleEn: 'Controls northern floodway intake into Kanał Powodziowy (max 1170 m³/s)',
    rolePl: 'Steruje dopływem wód do Kanału Powodziowego (maks. 1170 m³/s)',
    lngLat: [17.091, 51.101],
    footprintHalfM: 52,
    structureHeightM: 8.5,
    maxCapacityM3s: 1170,
    builtYear: 1916,
    modernizedYear: 2015
  },
  {
    id: 'opatowice',
    controllable: true,
    gateId: 'opatowice',
    nameEn: 'Jaz Opatowice',
    namePl: 'Jaz Opatowice',
    roleEn: 'Regulates Upper City Odra toward Szczytniki & Downtown (max 1630 m³/s)',
    rolePl: 'Reguluje przepływ Odrą Miejską w stronę Szczytnik i Śródmieścia (maks. 1630 m³/s)',
    lngLat: [17.087, 51.098],
    footprintHalfM: 50,
    structureHeightM: 8.2,
    maxCapacityM3s: 1630,
    builtYear: 1916,
    modernizedYear: 2014
  },
  {
    id: 'szczytniki',
    controllable: true,
    gateId: 'szczytniki',
    nameEn: 'Jaz Szczytniki',
    namePl: 'Jaz Szczytniki',
    roleEn: 'Diverts up to 680 m³/s via Przekop Szczytnicki to protect Downtown (≤950 m³/s)',
    rolePl: 'Kieruje do 680 m³/s Przekopem Szczytnickim do Starej Odry, chroniąc Śródmieście (≤950 m³/s)',
    lngLat: [17.063, 51.107],
    footprintHalfM: 46,
    structureHeightM: 8.0,
    maxCapacityM3s: 680,
    builtYear: 1555,
    modernizedYear: 2015
  },
  {
    id: 'widawa',
    controllable: true,
    gateId: 'widawa',
    nameEn: 'Przewał Widawski (Strachocin)',
    namePl: 'Przewał Widawski (Śluza Strachocin)',
    roleEn: 'Transfers up to 300 m³/s excess floodwater into the Widawa valley bypass',
    rolePl: 'Przerzuca do 300 m³/s nadmiaru wód powodziowych do doliny Widawy',
    lngLat: [17.108, 51.098],
    footprintHalfM: 44,
    structureHeightM: 7.2,
    maxCapacityM3s: 300,
    builtYear: 1917,
    modernizedYear: 2016
  },
  {
    id: 'psie-pole',
    controllable: true,
    gateId: 'psie-pole',
    nameEn: 'Brama Przeciwpowodziowa Psie Pole',
    namePl: 'Brama Przeciwpowodziowa Psie Pole',
    roleEn: 'Closes Kanał Miejski during floods (0% open); opening during flood inundates Nadodrze',
    rolePl: 'Zamyka Kanał Miejski w czasie powodzi (0%); otwarcie podczas fali zalewa Nadodrze',
    lngLat: [17.056, 51.128],
    footprintHalfM: 42,
    structureHeightM: 7.5,
    maxCapacityM3s: 180,
    builtYear: 1897,
    modernizedYear: 2015
  },
  {
    id: 'redzin',
    controllable: true,
    gateId: 'redzin',
    nameEn: 'Stopień Wodny Rędzin',
    namePl: 'Stopień Wodny Rędzin',
    roleEn: 'Outlet weir (3100 m³/s); throttling causes backwater flooding in Kozanów & Pilczyce',
    rolePl: 'Węzeł zamykający WWW (3100 m³/s); dławienie wywołuje cofkę i zalanie Kozanowa',
    lngLat: [16.960, 51.150],
    footprintHalfM: 60,
    structureHeightM: 9.0,
    maxCapacityM3s: 3100,
    builtYear: 1917,
    modernizedYear: 2015
  },
  {
    id: 'trestno',
    controllable: false,
    nameEn: 'Wodowskaz IMGW Trestno',
    namePl: 'Wodowskaz IMGW Trestno',
    roleEn: 'Primary inflow gauge entering Wrocław (km 242.1)',
    rolePl: 'Główny wodowskaz wejściowy do Wrocławia (km 242,1)',
    lngLat: [17.136, 51.069],
    footprintHalfM: 34,
    structureHeightM: 6.0,
    maxCapacityM3s: 3850,
    builtYear: 1903
  },
  {
    id: 'zacisze',
    controllable: false,
    nameEn: 'Jaz Zacisze',
    namePl: 'Jaz Zacisze',
    roleEn: 'Confluence of Kanał Powodziowy and Stara Odra',
    rolePl: 'Połączenie Kanału Powodziowego ze Starą Odrą',
    lngLat: [17.064, 51.127],
    footprintHalfM: 40,
    structureHeightM: 7.2,
    maxCapacityM3s: 1850,
    builtYear: 1917,
    modernizedYear: 2015
  },
  {
    id: 'wroclaw-i',
    controllable: false,
    nameEn: 'Elektrownia Wodna Wrocław I & II',
    namePl: 'Elektrownia Wodna Wrocław I i II',
    roleEn: 'Downtown hydropower weirs at Kępa Mieszczańska (max 950 m³/s)',
    rolePl: 'Jazy śródmiejskie przy Kępie Mieszczańskiej (maks. 950 m³/s)',
    lngLat: [17.028, 51.116],
    footprintHalfM: 38,
    structureHeightM: 6.8,
    maxCapacityM3s: 950,
    builtYear: 1924
  }
];

export const DEFAULT_GATE_OPENINGS: Record<GateId, number> = {
  bartoszowice: 100,
  opatowice: 90,
  szczytniki: 100,
  widawa: 100,
  'psie-pole': 0,
  redzin: 100
};
