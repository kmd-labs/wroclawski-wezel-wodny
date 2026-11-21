import { Injectable, computed, inject } from '@angular/core';
import {
  CANAL_SEGMENTS,
  DEPRESSED_ZONES,
  EMBANKMENT_SEGMENTS
} from '../data/www-hydrology.data';
import {
  FLOOD_SCENARIOS,
  HISTORY_ERAS,
  SILESIA_FACILITIES
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
}

interface IsokBasinProfile {
  id: string;
  center: [number, number];
  radii: [number, number];
  bankfullMasl: number;
  maxRiseM: number;
  /** Critical load ratio above 1.0 (3,100 m³/s baseline) at which embankment overtopping begins */
  critLoadRatio: number;
  /** Specific local breach triggers that immediately flood this basin upon gate misuse */
  directBreachTriggers?: Array<{ branchId: string; ratio: number }>;
  triggers: string[];
}

const OVERTOP_TOLERANCE = 1.005;

/**
 * ISOK-inspired spatially localized flood hazard basin definitions calibrated against
 * real EU-DEM valley elevations in Wrocław (m a.s.l.) and progressive failure thresholds.
 */
const ISOK_BASIN_PROFILES: IsokBasinProfile[] = [
  {
    id: 'polder-blizanowice-trestno',
    center: [17.135, 51.062],
    radii: [0.028, 0.018],
    bankfullMasl: 118.2,
    maxRiseM: 3.2,
    critLoadRatio: 0.99,
    triggers: ['odra-upper']
  },
  {
    id: 'opatowice-bierdzany',
    center: [17.090, 51.088],
    radii: [0.030, 0.018],
    bankfullMasl: 117.8,
    maxRiseM: 3.4,
    critLoadRatio: 1.008,
    triggers: ['odra-upper', 'odra-miejska-upper']
  },
  {
    id: 'przedmiescie-olawskie',
    center: [17.059, 51.095],
    radii: [0.024, 0.015],
    bankfullMasl: 116.4,
    maxRiseM: 3.5,
    critLoadRatio: 1.032,
    triggers: ['odra-miejska-upper', 'srodmiescie', 'olawa-river']
  },
  {
    id: 'kowale-swojczyce',
    center: [17.098, 51.116],
    radii: [0.028, 0.020],
    bankfullMasl: 116.8,
    maxRiseM: 3.1,
    critLoadRatio: 1.045,
    triggers: ['kanal-powodziowy', 'przewal-widawski', 'kanal-zeglugowy']
  },
  {
    id: 'ostrow-tumski',
    center: [17.038, 51.112],
    radii: [0.022, 0.010],
    bankfullMasl: 115.6,
    maxRiseM: 3.2,
    critLoadRatio: 1.062,
    triggers: ['srodmiescie', 'przekop-szczytnicki']
  },
  {
    id: 'kozanow-pilczyce',
    center: [16.985, 51.124],
    radii: [0.032, 0.020],
    bankfullMasl: 112.4,
    maxRiseM: 3.8,
    critLoadRatio: 1.078,
    directBreachTriggers: [
      { branchId: 'odra-redzin', ratio: 1.008 },
      { branchId: 'sleza-river', ratio: 1.008 }
    ],
    triggers: ['odra-redzin', 'stara-odra', 'sleza-river']
  },
  {
    id: 'nadodrze-olbin',
    center: [17.042, 51.121],
    radii: [0.022, 0.012],
    bankfullMasl: 114.8,
    maxRiseM: 3.4,
    critLoadRatio: 1.105,
    directBreachTriggers: [{ branchId: 'kanal-miejski', ratio: 1.008 }],
    triggers: ['kanal-miejski', 'stara-odra', 'srodmiescie']
  },
  {
    id: 'wielka-wyspa',
    center: [17.078, 51.110],
    radii: [0.022, 0.015],
    bankfullMasl: 116.9,
    maxRiseM: 3.0,
    critLoadRatio: 1.145,
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

  applyPresetNormal(): void {
    this.state.inflowM3s.set(450);
    this.state.polderRetentionActive.set(true);
    this.state.gateOpenings.set(this.computeOptimalGateOpenings(450));
  }

  applyPreset1997Wave(): void {
    this.state.inflowM3s.set(3640);
    this.state.polderRetentionActive.set(true);
    this.state.gateOpenings.set(this.computeOptimalGateOpenings(3640));
  }

  applyGateErrorDemo(): void {
    this.state.inflowM3s.set(2550);
    this.state.gateOpenings.set({
      bartoszowice: 45,
      opatowice: 95,
      szczytniki: 25,
      widawa: 0,
      'psie-pole': 85,
      redzin: 65
    });
  }

  readonly activeFloodScenario = computed(() => FLOOD_SCENARIOS[this.state.floodScenario()]);

  /** Smoothly interpolated multi-day flood state at current timeline position. */
  readonly activeFloodKeyframe = computed<InterpolatedFloodState>(() => {
    return interpolateScenarioAtStep(
      this.activeFloodScenario(),
      this.state.floodTimelineStep()
    );
  });

  /** SVG hydrograph polyline & capacity line for the multi-day dock chart. */
  readonly floodHydrographChart = computed(() => {
    const scenario = this.activeFloodScenario();
    const w = 320;
    const h = 42;
    const maxQ = 3900;
    const pts: string[] = [];
    for (let s = 0; s <= 100; s += 2) {
      const sample = interpolateScenarioAtStep(scenario, s);
      const x = ((s / 100) * w).toFixed(1);
      const y = (h - Math.min(1, sample.flowTrestnoM3s / maxQ) * (h - 6) - 3).toFixed(1);
      pts.push(`${x},${y}`);
    }
    const linePoints = pts.join(' ');
    const areaPoints = `0,${h} ${linePoints} ${w},${h}`;
    const capY = Number((h - (scenario.systemCapacityM3s / maxQ) * (h - 6) - 3).toFixed(1));
    const cursorX = Number(((this.state.floodTimelineStep() / 100) * w).toFixed(1));
    return { width: w, height: h, linePoints, areaPoints, capY, cursorX };
  });

  readonly activeHistoryEra = computed(() => {
    const yr = this.state.historyYear();
    let era = HISTORY_ERAS[0];
    for (const e of HISTORY_ERAS) {
      if (e.year <= yr) era = e;
    }
    return era;
  });

  readonly silesiaSummary = computed(() => {
    const active = this.state.silesiaActiveIds();
    const step = this.state.silesiaWaveStep();
    const rawPeak = 3850;
    let totalCapacity = 0;
    let totalReduction = 0;

    for (const f of SILESIA_FACILITIES) {
      if (active.has(f.id)) {
        totalCapacity += f.capacityMlnM3;
        if (step >= f.waveArrivalStep - 10) {
          const effectiveness = Math.min(1, Math.max(0.2, (step - (f.waveArrivalStep - 15)) / 25));
          totalReduction += f.peakReductionM3s * effectiveness;
        }
      }
    }

    const atWroclaw = Math.max(950, Math.round(rawPeak - totalReduction));
    return {
      rawPeak,
      totalCapacity: Math.round(totalCapacity * 10) / 10,
      totalReduction: Math.round(totalReduction),
      atWroclaw,
      safeForModernWww: atWroclaw <= 3100
    };
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

    const redzinCap =
      view === 'equilibrium'
        ? Math.max(400, (gates.redzin / 100) * 3100)
        : view === 'floods' && scenarioId !== '2024'
          ? 2350
          : 3100;
    const qRedzin = qStaraOdra + qSrodmiescie + qKanalMiejski;
    const backwaterFactor = qRedzin > redzinCap ? qRedzin / redzinCap : 1;

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
      'odra-redzin': qRedzin * backwaterFactor,
      'olawa-river': 22 + Math.max(0, effectiveTrestno - 2000) * 0.11,
      'sleza-river':
        (view === 'floods' && scenarioId === '2012' && step >= 45 ? 165 : 18) +
        (backwaterFactor - 1) * 180,
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
      let polderShave =
        this.state.polderRetentionActive() && inflow > 2100
          ? Math.min(260, (inflow - 2100) * 0.26)
          : 0;

      if (view === 'silesia') {
        inflow = this.silesiaSummary().atWroclaw;
        polderShave = 0;
      } else if (view === 'history') {
        inflow = Math.min(2100, this.activeHistoryEra().capacityM3s * 0.85);
        polderShave = 0;
      }

      const effectiveTrestno = Math.max(250, inflow - polderShave);
      Object.assign(rawFlows, this.routeWaveFlows(effectiveTrestno, view, scenario.id, step));
    }

    const result: Record<string, BranchHydrology> = {};
    for (const seg of CANAL_SEGMENTS) {
      const flowM3s = Math.round(rawFlows[seg.id] ?? seg.normalFlowM3s);
      const effectiveMax =
        view === 'floods' && this.state.floodScenario() !== '2024'
          ? Math.round(seg.maxCapacityM3s * 0.76)
          : seg.maxCapacityM3s;
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
    if (view === 'history' || view === 'silesia') return [];

    const branches = this.branchHydrology();
    const polderOn = this.state.polderRetentionActive();
    const inflow = this.state.inflowM3s();
    const basins: FloodBasinLevel[] = [];

    if (view === 'floods') {
      const kf = this.activeFloodKeyframe();
      const kfZones = new Set(kf.floodedZones);
      const cap = this.activeFloodScenario().systemCapacityM3s;
      const waveExcess = Math.max(0, (kf.flowTrestnoM3s - cap) / 1300);

      for (const profile of ISOK_BASIN_PROFILES) {
        if (!kfZones.has(profile.id)) continue;
        if (profile.id === 'polder-blizanowice-trestno') {
          basins.push({
            id: profile.id,
            center: profile.center,
            radii: profile.radii,
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
        const excessRatio = Math.min(1, Math.max(0.08, waveExcess * 0.65 + branchExcess * 0.55));
        const depthM = Math.round((0.25 + excessRatio * (profile.maxRiseM - 0.25)) * 100) / 100;
        basins.push({
          id: profile.id,
          center: profile.center,
          radii: profile.radii,
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
        if ((polderOn && inflow > 2100) || odraLoad > 1.005) {
          const norm = polderOn
            ? Math.min(1, Math.max(0.15, (inflow - 2100) / 1000))
            : Math.min(1, (odraLoad - 1.0) / 0.25);
          const depthM = Math.round((0.35 + norm * 2.4) * 100) / 100;
          basins.push({
            id: profile.id,
            center: profile.center,
            radii: profile.radii,
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
        const depthM = Math.round((0.2 + excessRatio * (profile.maxRiseM - 0.2)) * 100) / 100;
        basins.push({
          id: profile.id,
          center: profile.center,
          radii: profile.radii,
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
    if (view === 'history' || view === 'silesia') {
      return new Set();
    }
    return new Set(this.floodBasinLevels().map(b => b.id));
  });

  readonly breachedEmbankmentIds = computed<Set<string>>(() => {
    if (this.state.currentView() !== 'floods') return new Set();
    return new Set(this.activeFloodKeyframe().breachedEmbankments);
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
   * Real-elevation (1:1 m a.s.l., zero vertical exaggeration) localized flood water surface upon failure.
   * Each active basin rises continuously above its real EU-DEM bankfull floor only in the affected sectors.
   */
  readonly floodPlaneState = computed<FloodPlaneState>(() => {
    const totalZonesCount = ISOK_BASIN_PROFILES.length - 1; // exclude upstream retention polder
    const view = this.state.currentView();
    if (view === 'history' || view === 'silesia') {
      return {
        active: false,
        trestnoMasl: 85,
        redzinMasl: 85,
        displayMasl: 0,
        maxDepthM: 0,
        submergedCount: 0,
        totalZonesCount,
        basins: []
      };
    }

    const activeBasins = this.floodBasinLevels().filter(
      b => b.id !== 'polder-blizanowice-trestno'
    );

    if (activeBasins.length === 0) {
      return {
        active: false,
        trestnoMasl: 85,
        redzinMasl: 85,
        displayMasl: 0,
        maxDepthM: 0,
        submergedCount: 0,
        totalZonesCount,
        basins: []
      };
    }

    let maxDepthM = 0;
    let sumMasl = 0;
    for (const b of activeBasins) {
      maxDepthM = Math.max(maxDepthM, b.depthM);
      sumMasl += b.waterMasl;
    }

    const displayMasl = Math.round((sumMasl / activeBasins.length) * 10) / 10;
    return {
      active: true,
      trestnoMasl: activeBasins[0].waterMasl,
      redzinMasl: activeBasins[activeBasins.length - 1].waterMasl,
      displayMasl,
      maxDepthM: Math.round(maxDepthM * 10) / 10,
      submergedCount: activeBasins.length,
      totalZonesCount,
      basins: activeBasins
    };
  });
}
