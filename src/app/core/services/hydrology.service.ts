import { Injectable, computed, inject } from '@angular/core';
import {
  CANAL_SEGMENTS,
  DEPRESSED_ZONES,
  EMBANKMENT_SEGMENTS
} from '../data/www-hydrology.data';
import {
  DEM_BASIN_IDS,
  DEM_GRID_COLS,
  DEM_GRID_ELEV_DM,
  DEM_GRID_REL_ELEV_DM,
  DEM_GRID_ROWS,
  DEM_GRID_ZONE_CODE,
  DEM_MAX_LAT,
  DEM_MAX_LNG,
  DEM_MIN_LAT,
  DEM_MIN_LNG
} from '../data/www-dem-grid.data';
import {
  FLOOD_SCENARIOS,
  HISTORY_ERAS
} from '../data/www-events.data';
import {
  BranchHydrology,
  FloodScenarioKeyframe,
  FloodScenarioMeta,
  GateId
} from '../models/www.model';
import { AppStateService } from './app-state.service';

/**
 * Downstream hydraulic travel lag (in hours) from Trestno entry gauge across the 25 km
 * Wrocław Water Node corridor, so flood waves visibly take ~1 day to traverse the city
 * and days to rise/recede.
 */
const BRANCH_LAG_HOURS: Record<string, number> = {
  'odra-upper': 0,
  'olawa-river': 4,
  'przewal-widawski': 6,
  'kanal-powodziowy': 6,
  'kanal-zeglugowy': 6,
  'odra-miejska-upper': 6,
  'przekop-szczytnicki': 12,
  'stara-odra': 14,
  'srodmiescie': 14,
  'kanal-miejski': 15,
  'odra-redzin': 22,
  'sleza-river': 22,
  'bystrzyca-river': 18
};

export interface FloodBasinLevel {
  id: string;
  center: [number, number];
  radii: [number, number];
  bankfullMasl: number;
  waterMasl: number;
  depthM: number;
  excessRatio: number;
}

export interface FloodPlaneState {
  active: boolean;
  trestnoMasl: number;
  redzinMasl: number;
  displayMasl: number;
  maxDepthM: number;
  submergedCount: number;
  totalZonesCount: number;
  basins: FloodBasinLevel[];
  /** Overbank flood depth (m above floor) inside unembanked międzywale sectors 0..7 (zone codes 10..17). */
  miedzywaleDepths: number[];
}

export interface FloodPointInspection {
  groundMasl: number;
  waterMasl: number | null;
  depthM: number;
  zoneId: string | null;
  kind: 'flooded' | 'protected' | 'upland';
  isFloodway: boolean;
}

interface IsokBasinProfile {
  id: string;
  center: [number, number];
  radii: [number, number];
  bankfullMasl: number;
  maxRiseM: number;
  /** Critical load ratio above 1.0 at which protecting embankment crest is overtopped */
  critLoadRatio: number;
  /** Specific local breach triggers that immediately flood this basin upon gate misuse */
  directBreachTriggers?: Array<{ branchId: string; ratio: number }>;
  triggers: string[];
}

const OVERTOP_TOLERANCE = 1.005;

const MIEDZYWALE_SECTOR_BRANCHES: string[][] = [
  ['odra-upper'],                           // 10: Trestno -> Bartoszowice międzywale
  ['przewal-widawski'],                     // 11: Strachocin -> Widawa -> Świniary floodway
  ['kanal-powodziowy', 'kanal-zeglugowy'],  // 12: Kanał Powodziowy / Żeglugowy międzywale
  ['odra-miejska-upper', 'olawa-river'],    // 13: Opatowice / Oława floodway
  ['przekop-szczytnicki', 'stara-odra'],    // 14: Stara Odra / Szczytniki międzywale
  ['srodmiescie', 'kanal-miejski'],         // 15: Downtown quays & boulevards
  ['odra-redzin', 'sleza-river'],           // 16: Osobowice -> Rędzin / Ślęza międzywale
  ['bystrzyca-river']                       // 17: Marszowice / Bystrzyca floodway
];

/**
 * ISOK-inspired spatially localized flood hazard basin definitions calibrated against
 * real EU-DEM floodplain floors (m a.s.l.) and embankment crest overtopping thresholds.
 */
const ISOK_BASIN_PROFILES: IsokBasinProfile[] = [
  {
    id: 'polder-blizanowice-trestno',
    center: [17.135, 51.062],
    radii: [0.028, 0.018],
    bankfullMasl: 116.5,
    maxRiseM: 3.6,
    critLoadRatio: 0.99,
    triggers: ['odra-upper']
  },
  {
    id: 'opatowice-bierdzany',
    center: [17.090, 51.088],
    radii: [0.030, 0.018],
    bankfullMasl: 116.3,
    maxRiseM: 5.0,
    critLoadRatio: 1.045,
    triggers: ['odra-upper', 'odra-miejska-upper']
  },
  {
    id: 'kowale-swojczyce',
    center: [17.098, 51.116],
    radii: [0.028, 0.020],
    bankfullMasl: 112.9,
    maxRiseM: 4.8,
    critLoadRatio: 1.068,
    triggers: ['kanal-powodziowy', 'przewal-widawski', 'kanal-zeglugowy']
  },
  {
    id: 'przedmiescie-olawskie',
    center: [17.059, 51.095],
    radii: [0.024, 0.015],
    bankfullMasl: 117.2,
    maxRiseM: 5.2,
    critLoadRatio: 1.088,
    directBreachTriggers: [{ branchId: 'olawa-river', ratio: 1.02 }],
    triggers: ['odra-miejska-upper', 'srodmiescie', 'olawa-river']
  },
  {
    id: 'ostrow-tumski',
    center: [17.038, 51.112],
    radii: [0.022, 0.010],
    bankfullMasl: 112.8,
    maxRiseM: 5.8,
    critLoadRatio: 1.105,
    triggers: ['srodmiescie', 'przekop-szczytnicki']
  },
  {
    id: 'kozanow-pilczyce',
    center: [16.988, 51.123],
    radii: [0.022, 0.014],
    bankfullMasl: 110.6,
    maxRiseM: 5.6,
    critLoadRatio: 1.122,
    directBreachTriggers: [
      { branchId: 'odra-redzin', ratio: 1.015 },
      { branchId: 'sleza-river', ratio: 1.015 }
    ],
    triggers: ['odra-redzin', 'stara-odra', 'sleza-river']
  },
  {
    id: 'pracze-odrzanskie',
    center: [16.932, 51.182],
    radii: [0.045, 0.028],
    bankfullMasl: 108.5,
    maxRiseM: 5.4,
    critLoadRatio: 1.135,
    directBreachTriggers: [
      { branchId: 'odra-redzin', ratio: 1.03 },
      { branchId: 'bystrzyca-river', ratio: 1.015 }
    ],
    triggers: ['odra-redzin', 'bystrzyca-river', 'przewal-widawski']
  },
  {
    id: 'nadodrze-olbin',
    center: [17.042, 51.121],
    radii: [0.022, 0.012],
    bankfullMasl: 114.2,
    maxRiseM: 5.2,
    critLoadRatio: 1.152,
    directBreachTriggers: [{ branchId: 'kanal-miejski', ratio: 1.015 }],
    triggers: ['kanal-miejski', 'stara-odra', 'srodmiescie']
  },
  {
    id: 'wielka-wyspa',
    center: [17.078, 51.110],
    radii: [0.022, 0.015],
    bankfullMasl: 116.5,
    maxRiseM: 4.8,
    critLoadRatio: 1.175,
    triggers: ['kanal-powodziowy', 'odra-miejska-upper', 'przekop-szczytnicki']
  }
];

export interface InterpolatedFloodState {
  step: number;
  hoursFromStart: number;
  dayNumber: number;
  durationDays: number;
  dateLabel: string;
  flowTrestnoM3s: number;
  stageTrestnoCm: number;
  floodedZones: string[];
  breachedEmbankments: string[];
  overloadedCanals: string[];
}

function formatScenarioTimestamp(startIso: string, hoursFromStart: number): string {
  const ms = Date.parse(startIso) + hoursFromStart * 3600 * 1000;
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:00`;
}

function interpolateScenarioAtStep(
  scenario: FloodScenarioMeta,
  rawStep: number
): InterpolatedFloodState {
  const step = Math.max(0, Math.min(100, rawStep));
  const frames = scenario.keyframes;
  let prev: FloodScenarioKeyframe = frames[0];
  let next: FloodScenarioKeyframe = frames[frames.length - 1];

  for (let i = 0; i < frames.length; i++) {
    if (frames[i].step <= step) prev = frames[i];
    if (frames[i].step >= step) {
      next = frames[i];
      break;
    }
  }

  const span = next.step - prev.step;
  const ratio = span > 0 ? (step - prev.step) / span : 0;
  const hoursFromStart = Math.round(
    prev.hoursFromStart + (next.hoursFromStart - prev.hoursFromStart) * ratio
  );
  const flowTrestnoM3s = Math.round(
    prev.flowTrestnoM3s + (next.flowTrestnoM3s - prev.flowTrestnoM3s) * ratio
  );
  const stageTrestnoCm = Math.round(
    prev.stageTrestnoCm + (next.stageTrestnoCm - prev.stageTrestnoCm) * ratio
  );
  const dayNumber = Math.min(
    scenario.durationDays,
    Math.floor(hoursFromStart / 24) + 1
  );

  return {
    step,
    hoursFromStart,
    dayNumber,
    durationDays: scenario.durationDays,
    dateLabel: formatScenarioTimestamp(scenario.startIso, hoursFromStart),
    flowTrestnoM3s,
    stageTrestnoCm,
    floodedZones: prev.floodedZones,
    breachedEmbankments: prev.breachedEmbankments,
    overloadedCanals: prev.overloadedCanals
  };
}

const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [56, 189, 248]],   // cool sky blue (#38bdf8)
  [0.35, [14, 165, 233]],  // vivid Odra blue (#0ea5e9)
  [0.62, [245, 158, 11]],  // warning amber (#f59e0b)
  [0.82, [211, 116, 0]],   // high flood orange (#d37400)
  [1.0, [220, 38, 38]]     // extreme peak crimson (#dc2626)
];

function heatToHex(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  let a = HEAT_STOPS[0];
  let b = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (clamped >= HEAT_STOPS[i][0] && clamped <= HEAT_STOPS[i + 1][0]) {
      a = HEAT_STOPS[i];
      b = HEAT_STOPS[i + 1];
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const f = (clamped - a[0]) / span;
  const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
  const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
  const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function scenarioFlowHeat(flowM3s: number, systemCapacityM3s: number): number {
  if (flowM3s >= systemCapacityM3s) {
    return Math.min(1, 0.72 + ((flowM3s - systemCapacityM3s) / 1300) * 0.28);
  }
  const denom = Math.max(900, systemCapacityM3s - 500);
  return Math.max(0, Math.min(0.7, ((flowM3s - 500) / denom) * 0.68));
}

@Injectable({ providedIn: 'root' })
export class HydrologyService {
  private readonly state = inject(AppStateService);

  computeOptimalGateOpenings(inflowM3s: number): Record<GateId, number> {
    if (inflowM3s <= 950) {
      return {
        bartoszowice: 35,
        opatowice: 65,
        szczytniki: 30,
        widawa: 0,
        'psie-pole': 100,
        redzin: 100
      };
    }
    if (inflowM3s <= 2150) {
      return {
        bartoszowice: 85,
        opatowice: 75,
        szczytniki: 75,
        widawa: 15,
        'psie-pole': 0,
        redzin: 100
      };
    }
    return {
      bartoszowice: 100,
      opatowice: 90,
      szczytniki: 100,
      widawa: 100,
      'psie-pole': 0,
      redzin: 100
    };
  }

  applyOptimalEquilibrium(): void {
    const optimal = this.computeOptimalGateOpenings(this.state.inflowM3s());
    this.state.gateOpenings.set(optimal);
  }

  readonly activeFloodScenario = computed(() => FLOOD_SCENARIOS[this.state.floodScenario()]);

  /** Smoothly interpolated multi-day flood state at current timeline position. */
  readonly activeFloodKeyframe = computed<InterpolatedFloodState>(() => {
    return interpolateScenarioAtStep(
      this.activeFloodScenario(),
      this.state.floodTimelineStep()
    );
  });

  /** SVG hydrograph polyline, capacity line, and Q-following slider gradient for the multi-day dock chart. */
  readonly floodHydrographChart = computed(() => {
    const scenario = this.activeFloodScenario();
    const w = 320;
    const h = 42;
    const maxQ = 3900;
    const pts: string[] = [];
    const gradStops: string[] = [];
    for (let s = 0; s <= 100; s += 2) {
      const sample = interpolateScenarioAtStep(scenario, s);
      const x = ((s / 100) * w).toFixed(1);
      const y = (h - Math.min(1, sample.flowTrestnoM3s / maxQ) * (h - 6) - 3).toFixed(1);
      pts.push(`${x},${y}`);
      if (s % 4 === 0 || s === 100) {
        gradStops.push(`${heatToHex(scenarioFlowHeat(sample.flowTrestnoM3s, scenario.systemCapacityM3s))} ${s}%`);
      }
    }
    const linePoints = pts.join(' ');
    const areaPoints = `0,${h} ${linePoints} ${w},${h}`;
    const capY = Number((h - (scenario.systemCapacityM3s / maxQ) * (h - 6) - 3).toFixed(1));
    const cursorX = Number(((this.state.floodTimelineStep() / 100) * w).toFixed(1));
    const trackGradient = `linear-gradient(90deg, ${gradStops.join(', ')})`;
    return { width: w, height: h, linePoints, areaPoints, capY, cursorX, trackGradient };
  });

  readonly activeHistoryEra = computed(() => {
    const yr = this.state.historyYear();
    let era = HISTORY_ERAS[0];
    for (const e of HISTORY_ERAS) {
      if (e.year <= yr) era = e;
    }
    return era;
  });

  private routeWaveFlows(
    effectiveTrestno: number,
    view: string,
    scenarioId: string,
    step: number
  ): Record<string, number> {
    const gates = this.state.gateOpenings();

    // Post-POPDO Odra–Widawa transfer (Przewał Widawski) takes up to 300 m³/s at 3,100 m³/s
    const widawaDemand =
      effectiveTrestno > 1100 ? ((effectiveTrestno - 1100) / 2000) * 300 : 0;
    const widawaShare =
      view === 'equilibrium'
        ? Math.min(390, Math.round((gates.widawa / 100) * widawaDemand))
        : view === 'floods' && scenarioId === '1997'
          ? Math.min(210, Math.max(0, effectiveTrestno - 1400) * 0.14)
          : Math.min(300, Math.max(0, effectiveTrestno - 1100) * 0.15);

    const remainingCity = Math.max(200, effectiveTrestno - widawaShare);

    // At 3,100 m³/s design capacity (remainingCity = 2,800 m³/s):
    // Bartoszowice complex = 1,195 m³/s (1,110 Powodziowy + 85 Żeglugowy),
    // Opatowice / Górna Odra Miejska = 1,605 m³/s.
    const bOpen = view === 'equilibrium' ? Math.max(0.05, gates.bartoszowice / 100) : 1.0;
    const oRaw = view === 'equilibrium' ? gates.opatowice / 100 : 0.9;
    const oEff = oRaw >= 0.85 ? 1.0 + (oRaw - 0.9) * 0.25 : Math.max(0.05, oRaw / 0.85);
    const bWeight = bOpen * 1195;
    const oWeight = oEff * 1605;
    const weightSum = bWeight + oWeight || 1;

    const qBartoszowiceTotal = remainingCity * (bWeight / weightSum);
    const qOdraMiejskaUpper = Math.max(0, remainingCity - qBartoszowiceTotal);

    const ppOpen =
      view === 'equilibrium'
        ? gates['psie-pole'] / 100
        : scenarioId === '1997' && step > 65
          ? 0.85
          : 0.0;
    const qKanalMiejski =
      view === 'equilibrium'
        ? ppOpen * Math.min(480, qBartoszowiceTotal * 0.34)
        : Math.min(420, qBartoszowiceTotal * 0.28 * ppOpen);

    const qKanalZeglugowyBase = Math.min(95, qBartoszowiceTotal * (85 / 1195));
    const qKanalZeglugowy = qKanalZeglugowyBase + qKanalMiejski;
    const qKanalPowodziowy = Math.max(0, qBartoszowiceTotal - qKanalZeglugowy);

    // At 3,100 m³/s, Szczytniki diverts 655 m³/s (655/1605 = 0.4081) -> Stara Odra = 1,850 m³/s, Śródmieście = 950 m³/s
    const szOpen = view === 'equilibrium' ? gates.szczytniki / 100 : 1.0;
    const qSzczytniki = qOdraMiejskaUpper * ((655 / 1605) * szOpen);
    const qSrodmiescie = Math.max(0, qOdraMiejskaUpper - qSzczytniki);
    const qStaraOdra = Math.max(0, qKanalPowodziowy + qKanalZeglugowyBase + qSzczytniki);
    const qRedzin = qStaraOdra + qSrodmiescie + qKanalMiejski;

    return {
      'odra-upper': effectiveTrestno,
      'przewal-widawski': widawaShare,
      'kanal-powodziowy': qKanalPowodziowy,
      'kanal-zeglugowy': qKanalZeglugowy,
      'odra-miejska-upper': qOdraMiejskaUpper,
      'przekop-szczytnicki': qSzczytniki,
      'stara-odra': qStaraOdra,
      'srodmiescie': qSrodmiescie,
      'kanal-miejski': qKanalMiejski,
      'odra-redzin': qRedzin,
      'olawa-river': 22 + Math.max(0, effectiveTrestno - 2000) * 0.11,
      'sleza-river':
        (view === 'floods' && scenarioId === '2010' && step >= 45 ? 165 : 18) +
        Math.max(0, effectiveTrestno - 2000) * 0.04,
      'bystrzyca-river':
        view === 'floods' && scenarioId === '2024' && step >= 35 && step <= 70 ? 195 : 26
    };
  }

  /**
   * Real-time mass-balanced hydrology across every canal branch in Wrocław.
   * In `floods` view, applies realistic upstream-to-downstream travel lag (hours/days)
   * across the 25 km Wrocław corridor so the wave propagates progressively.
   */
  readonly branchHydrology = computed<Record<string, BranchHydrology>>(() => {
    const view = this.state.currentView();
    const scenario = this.activeFloodScenario();
    const step = this.state.floodTimelineStep();
    const totalHours = scenario.durationDays * 24;
    const gates = this.state.gateOpenings();

    const rawFlows: Record<string, number> = {};

    if (view === 'floods') {
      for (const seg of CANAL_SEGMENTS) {
        const lagHours = BRANCH_LAG_HOURS[seg.id] ?? 8;
        const lagSteps = (lagHours / totalHours) * 100;
        const laggedStep = Math.max(0, step - lagSteps);
        const laggedSample = interpolateScenarioAtStep(scenario, laggedStep);
        const routed = this.routeWaveFlows(
          laggedSample.flowTrestnoM3s,
          view,
          scenario.id,
          laggedStep
        );
        rawFlows[seg.id] = routed[seg.id] ?? seg.normalFlowM3s;
      }
    } else {
      let inflow = this.state.inflowM3s();

      if (view === 'history') {
        inflow = Math.min(2100, this.activeHistoryEra().capacityM3s * 0.85);
      }

      const effectiveTrestno = Math.max(250, inflow);
      Object.assign(rawFlows, this.routeWaveFlows(effectiveTrestno, view, scenario.id, step));
    }

    const redzinGateFactor =
      view === 'equilibrium' ? 0.35 + 0.65 * (gates.redzin / 100) : 1.0;
    const redzinFlow = Math.round(rawFlows['odra-redzin'] ?? 420);
    const redzinEffectiveCap =
      view === 'floods' && this.state.floodScenario() !== '2024'
        ? Math.round(3100 * 0.76)
        : Math.max(400, Math.round(3100 * redzinGateFactor));
    const redzinOverload = Math.max(1, redzinFlow / redzinEffectiveCap);

    const result: Record<string, BranchHydrology> = {};
    for (const seg of CANAL_SEGMENTS) {
      const flowM3s = Math.round(rawFlows[seg.id] ?? seg.normalFlowM3s);
      let effectiveMax =
        view === 'floods' && this.state.floodScenario() !== '2024'
          ? Math.round(seg.maxCapacityM3s * 0.76)
          : seg.maxCapacityM3s;

      if (seg.id === 'odra-redzin' && view === 'equilibrium') {
        effectiveMax = redzinEffectiveCap;
      } else if (seg.id === 'sleza-river' && redzinOverload > 1.0) {
        // Rędzin tailwater backwater (cofka) reduces Ślęza gravity discharge capacity
        effectiveMax = Math.max(20, Math.round(effectiveMax / Math.pow(redzinOverload, 1.35)));
      }

      const loadRatio = effectiveMax > 0 ? flowM3s / effectiveMax : 0;
      const stageRange = seg.crestHeightM - seg.baseWaterM;
      const stageM = seg.baseWaterM + Math.min(1.35, loadRatio) * stageRange;
      const freeboardM = Math.round((seg.crestHeightM - stageM) * 100) / 100;
      result[seg.id] = {
        id: seg.id,
        flowM3s,
        maxCapacityM3s: effectiveMax,
        loadRatio,
        stageM,
        freeboardM,
        overtopped: loadRatio > OVERTOP_TOLERANCE
      };
    }
    return result;
  });

  /**
   * Computes spatially localized ISOK-inspired basin flood depths (0 -> maxRiseM)
   * so submergence begins progressively in vulnerable riverside sectors right above 3,100 m³/s
   * or under specific gate failures, rather than flooding the whole city in one binary jump.
   */
  readonly floodBasinLevels = computed<FloodBasinLevel[]>(() => {
    const view = this.state.currentView();
    if (view === 'history') return [];

    const branches = this.branchHydrology();
    const basins: FloodBasinLevel[] = [];

    if (view === 'floods') {
      const kf = this.activeFloodKeyframe();
      const kfZones = new Set(kf.floodedZones);
      const scenarioId = this.state.floodScenario();
      const cap = this.activeFloodScenario().systemCapacityM3s;
      const waveExcess = Math.max(0, (kf.flowTrestnoM3s - cap) / 1300);

      for (const profile of ISOK_BASIN_PROFILES) {
        if (!kfZones.has(profile.id)) continue;
        if (profile.id === 'polder-blizanowice-trestno') {
          basins.push({
            id: profile.id,
            center: profile.center,
            radii: profile.radii,
            bankfullMasl: profile.bankfullMasl,
            waterMasl: Math.round((profile.bankfullMasl + 1.8) * 100) / 100,
            depthM: 1.8,
            excessRatio: 0.4
          });
          continue;
        }
        let maxTriggerLoad = 0;
        for (const bId of profile.triggers) {
          maxTriggerLoad = Math.max(maxTriggerLoad, branches[bId]?.loadRatio ?? 0);
        }
        const branchExcess = Math.max(0, maxTriggerLoad - 0.96);
        const is2010Kozanow = scenarioId === '2010' && profile.id === 'kozanow-pilczyce';
        const excessRatio = is2010Kozanow
          ? 0.72
          : Math.min(1, Math.max(0.08, waveExcess * 0.65 + branchExcess * 0.55));
        const depthM = Math.round((0.25 + excessRatio * (profile.maxRiseM - 0.25)) * 100) / 100;
        basins.push({
          id: profile.id,
          center: profile.center,
          radii: profile.radii,
          bankfullMasl: profile.bankfullMasl,
          waterMasl: Math.round((profile.bankfullMasl + depthM) * 100) / 100,
          depthM,
          excessRatio
        });
      }
      return basins;
    }

    for (const profile of ISOK_BASIN_PROFILES) {
      if (profile.id === 'polder-blizanowice-trestno') {
        const odraLoad = branches['odra-upper']?.loadRatio ?? 0;
        if (odraLoad > 1.005) {
          const norm = Math.min(1, (odraLoad - 1.0) / 0.25);
          const depthM = Math.round((0.35 + norm * 2.4) * 100) / 100;
          basins.push({
            id: profile.id,
            center: profile.center,
            radii: profile.radii,
            bankfullMasl: profile.bankfullMasl,
            waterMasl: Math.round((profile.bankfullMasl + depthM) * 100) / 100,
            depthM,
            excessRatio: norm
          });
        }
        continue;
      }

      let maxOverCrit = 0;
      if (profile.directBreachTriggers) {
        for (const dt of profile.directBreachTriggers) {
          const r = branches[dt.branchId]?.loadRatio ?? 0;
          if (r > dt.ratio) {
            maxOverCrit = Math.max(maxOverCrit, r - dt.ratio);
          }
        }
      }
      for (const bId of profile.triggers) {
        const r = branches[bId]?.loadRatio ?? 0;
        if (r > profile.critLoadRatio) {
          maxOverCrit = Math.max(maxOverCrit, r - profile.critLoadRatio);
        }
      }

      if (maxOverCrit > 0) {
        const excessRatio = Math.min(1, Math.pow(maxOverCrit / 0.24, 0.85));
        const depthM = Math.round((0.05 + excessRatio * (profile.maxRiseM - 0.05)) * 100) / 100;
        basins.push({
          id: profile.id,
          center: profile.center,
          radii: profile.radii,
          bankfullMasl: profile.bankfullMasl,
          waterMasl: Math.round((profile.bankfullMasl + depthM) * 100) / 100,
          depthM,
          excessRatio
        });
      }
    }

    return basins;
  });

  readonly floodedZoneIds = computed<Set<string>>(() => {
    const view = this.state.currentView();
    if (view === 'floods') {
      return new Set(this.activeFloodKeyframe().floodedZones);
    }
    if (view === 'history') {
      return new Set();
    }
    return new Set(this.floodBasinLevels().map(b => b.id));
  });

  readonly breachedEmbankmentIds = computed<Set<string>>(() => {
    const view = this.state.currentView();
    if (view === 'floods') {
      return new Set(this.activeFloodKeyframe().breachedEmbankments);
    }
    if (view !== 'equilibrium') return new Set();

    const floodedZones = this.floodedZoneIds();
    const breached = new Set<string>();
    for (const emb of EMBANKMENT_SEGMENTS) {
      if (emb.protectsZoneId !== 'polder-blizanowice-trestno' && floodedZones.has(emb.protectsZoneId)) {
        breached.add(emb.id);
      }
    }
    return breached;
  });

  readonly equilibriumSummary = computed(() => {
    const branches = this.branchHydrology();
    const flooded = this.floodedZoneIds();
    const mainIds = [
      'kanal-powodziowy',
      'stara-odra',
      'srodmiescie',
      'kanal-miejski',
      'odra-redzin',
      'przewal-widawski'
    ];
    let maxLoad = 0;
    for (const id of mainIds) {
      if (branches[id]) {
        maxLoad = Math.max(maxLoad, branches[id].loadRatio);
      }
    }

    const nonPolderFlooded = [...flooded].filter(id => id !== 'polder-blizanowice-trestno');
    const status: 'safe' | 'warning' | 'overflow' =
      nonPolderFlooded.length > 0 || maxLoad > OVERTOP_TOLERANCE
        ? 'overflow'
        : maxLoad > 0.8
          ? 'warning'
          : 'safe';

    return {
      status,
      maxLoadPct: Math.round(maxLoad * 100),
      widawaFlow: branches['przewal-widawski']?.flowM3s ?? 0,
      downtownFlow: branches['srodmiescie']?.flowM3s ?? 0,
      staraOdraFlow: branches['stara-odra']?.flowM3s ?? 0,
      floodedCount: nonPolderFlooded.length,
      totalEmbankments: EMBANKMENT_SEGMENTS.length
    };
  });

  /**
   * Real-elevation (1:1 m a.s.l., zero vertical exaggeration) embankment-aware flood water surface:
   *  - Between 3,100 m³/s and an embankment crest threshold, ONLY the unembanked międzywale
   *    corridors wet between rivers and dykes.
   *  - Protected zawale basins behind holding embankments stay 100% dry until their specific
   *    embankment overtops or breaches.
   */
  readonly floodPlaneState = computed<FloodPlaneState>(() => {
    const totalZonesCount = ISOK_BASIN_PROFILES.length - 1; // exclude upstream retention polder
    const view = this.state.currentView();
    const zeroSectors = [0, 0, 0, 0, 0, 0, 0, 0];
    if (view === 'history') {
      return {
        active: false,
        trestnoMasl: 85,
        redzinMasl: 85,
        displayMasl: 0,
        maxDepthM: 0,
        submergedCount: 0,
        totalZonesCount,
        basins: [],
        miedzywaleDepths: zeroSectors
      };
    }

    const branches = this.branchHydrology();
    const miedzywaleDepths = MIEDZYWALE_SECTOR_BRANCHES.map(sectorBranches => {
      let maxSectorLoad = 0;
      for (const bId of sectorBranches) {
        maxSectorLoad = Math.max(maxSectorLoad, branches[bId]?.loadRatio ?? 0);
      }
      if (maxSectorLoad <= OVERTOP_TOLERANCE) return 0;
      const excess = maxSectorLoad - OVERTOP_TOLERANCE;
      const norm = Math.min(1, Math.pow(excess / 0.24, 0.8));
      return Math.round((0.25 + norm * 3.35) * 100) / 100;
    });

    const allBasins = this.floodBasinLevels();
    const urbanBasins = allBasins.filter(b => b.id !== 'polder-blizanowice-trestno');
    const maxMiedzywale = Math.max(...miedzywaleDepths);

    if (allBasins.length === 0 && maxMiedzywale <= 0) {
      return {
        active: false,
        trestnoMasl: 85,
        redzinMasl: 85,
        displayMasl: 0,
        maxDepthM: 0,
        submergedCount: 0,
        totalZonesCount,
        basins: [],
        miedzywaleDepths: zeroSectors
      };
    }

    let maxDepthM = maxMiedzywale;
    let maxMasl = 0;
    for (const b of urbanBasins) {
      maxDepthM = Math.max(maxDepthM, b.depthM);
      maxMasl = Math.max(maxMasl, b.waterMasl);
    }

    const displayMasl = Math.round(maxMasl * 10) / 10;
    return {
      active: true,
      trestnoMasl: urbanBasins[0]?.waterMasl ?? 117.5,
      redzinMasl: urbanBasins[urbanBasins.length - 1]?.waterMasl ?? 111.5,
      displayMasl,
      maxDepthM: Math.round(maxDepthM * 10) / 10,
      submergedCount: urbanBasins.length,
      totalZonesCount,
      basins: allBasins,
      miedzywaleDepths
    };
  });

  /**
   * Returns exact ground elevation, water surface level (m a.s.l.), and water depth (m)
   * at a clicked `[lng, lat]` point using the pre-baked DEM + embankment barrier grid.
   */
  inspectFloodAtLngLat(lng: number, lat: number): FloodPointInspection {
    const cFloat = ((lng - DEM_MIN_LNG) / (DEM_MAX_LNG - DEM_MIN_LNG)) * DEM_GRID_COLS;
    const rFloat = ((lat - DEM_MIN_LAT) / (DEM_MAX_LAT - DEM_MIN_LAT)) * DEM_GRID_ROWS;

    if (cFloat < 0 || cFloat > DEM_GRID_COLS || rFloat < 0 || rFloat > DEM_GRID_ROWS) {
      return {
        groundMasl: 118.0,
        waterMasl: null,
        depthM: 0,
        zoneId: null,
        kind: 'upland',
        isFloodway: false
      };
    }

    const c0 = Math.max(0, Math.min(DEM_GRID_COLS - 1, Math.floor(cFloat)));
    const r0 = Math.max(0, Math.min(DEM_GRID_ROWS - 1, Math.floor(rFloat)));
    const tc = cFloat - c0;
    const tr = rFloat - r0;
    const stride = DEM_GRID_COLS + 1;
    const e00 = DEM_GRID_ELEV_DM[r0 * stride + c0] / 10;
    const e10 = DEM_GRID_ELEV_DM[r0 * stride + (c0 + 1)] / 10;
    const e01 = DEM_GRID_ELEV_DM[(r0 + 1) * stride + c0] / 10;
    const e11 = DEM_GRID_ELEV_DM[(r0 + 1) * stride + (c0 + 1)] / 10;
    const groundMasl =
      Math.round(
        ((e00 + (e10 - e00) * tc) * (1 - tr) + (e01 + (e11 - e01) * tc) * tr) * 10
      ) / 10;

    const cNear = Math.max(0, Math.min(DEM_GRID_COLS, Math.round(cFloat)));
    const rNear = Math.max(0, Math.min(DEM_GRID_ROWS, Math.round(rFloat)));
    const idx = rNear * stride + cNear;
    const zoneCode = DEM_GRID_ZONE_CODE[idx];
    const relElevM = DEM_GRID_REL_ELEV_DM[idx] / 10;
    const plane = this.floodPlaneState();

    if (zoneCode < 0) {
      return {
        groundMasl,
        waterMasl: null,
        depthM: 0,
        zoneId: null,
        kind: 'upland',
        isFloodway: false
      };
    }

    if (zoneCode >= 10) {
      const sectorDepth = plane.active ? (plane.miedzywaleDepths[zoneCode - 10] ?? 0) : 0;
      const depthM = Math.max(0, Math.round((sectorDepth - relElevM) * 10) / 10);
      return {
        groundMasl,
        waterMasl: depthM > 0 ? Math.round((groundMasl + depthM) * 10) / 10 : null,
        depthM,
        zoneId: null,
        kind: depthM > 0 ? 'flooded' : 'upland',
        isFloodway: true
      };
    }

    const basinId = DEM_BASIN_IDS[zoneCode] ?? null;
    const activeBasin = plane.active ? plane.basins.find(b => b.id === basinId) : undefined;
    const depthM = activeBasin
      ? Math.max(0, Math.round((activeBasin.depthM - relElevM) * 10) / 10)
      : 0;
    return {
      groundMasl,
      waterMasl: depthM > 0 ? Math.round((groundMasl + depthM) * 10) / 10 : null,
      depthM,
      zoneId: basinId,
      kind: depthM > 0 ? 'flooded' : 'protected',
      isFloodway: false
    };
  }
}
