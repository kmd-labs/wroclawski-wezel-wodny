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

    const widawaShare =
      view === 'equilibrium'
        ? Math.min(350, (gates.widawa / 100) * Math.max(0, effectiveTrestno - 1100) * 0.28)
        : view === 'floods' && scenarioId === '1997'
          ? Math.min(210, Math.max(0, effectiveTrestno - 1400) * 0.14)
          : Math.min(300, Math.max(0, effectiveTrestno - 1300) * 0.25);

    const remainingCity = Math.max(200, effectiveTrestno - widawaShare);

    const bOpen = view === 'equilibrium' ? Math.max(0.05, gates.bartoszowice / 100) : 0.9;
    const oOpen = view === 'equilibrium' ? Math.max(0.05, gates.opatowice / 100) : 0.85;
    const bWeight = bOpen * 1170;
    const oWeight = oOpen * 1630;
    const weightSum = bWeight + oWeight || 1;

    const qBartoszowiceTotal = remainingCity * (bWeight / weightSum);
    const qKanalPowodziowy = qBartoszowiceTotal * 0.93;
    const qKanalZeglugowy = qBartoszowiceTotal * 0.07;
    const qOdraMiejskaUpper = remainingCity - qBartoszowiceTotal;

    const szOpen = view === 'equilibrium' ? gates.szczytniki / 100 : 0.85;
    const qSzczytniki = qOdraMiejskaUpper * (0.44 * szOpen);
    const qAfterSzczytniki = qOdraMiejskaUpper - qSzczytniki;

    const qStaraOdraTotal = qKanalPowodziowy + qKanalZeglugowy + qSzczytniki;
    const ppOpen =
      view === 'equilibrium'
        ? gates['psie-pole'] / 100
        : scenarioId === '1997' && step > 65
          ? 0.85
          : 0.02;
    const qKanalMiejski = Math.min(420, qStaraOdraTotal * 0.22 * ppOpen);
    const qStaraOdra = qStaraOdraTotal - qKanalMiejski;
    const qSrodmiescie = qAfterSzczytniki;

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
      'olawa-river': 22 + Math.max(0, effectiveTrestno - 2000) * 0.12,
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
        this.state.polderRetentionActive() && inflow > 1800
          ? Math.min(260, (inflow - 1800) * 0.35)
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
        overtopped: loadRatio > 1.0
      };
    }
    return result;
  });

  readonly floodedZoneIds = computed<Set<string>>(() => {
    const view = this.state.currentView();
    if (view === 'floods') {
      return new Set(this.activeFloodKeyframe().floodedZones);
    }
    if (view === 'history' || view === 'silesia') {
      return new Set();
    }

    const branches = this.branchHydrology();
    const flooded = new Set<string>();
    for (const zone of DEPRESSED_ZONES) {
      if (zone.id === 'polder-blizanowice-trestno') {
        if (this.state.polderRetentionActive() && this.state.inflowM3s() > 1950) {
          flooded.add(zone.id);
        }
        continue;
      }
      for (const bId of zone.triggerBranches) {
        if (branches[bId]?.overtopped) {
          flooded.add(zone.id);
        }
      }
    }
    return flooded;
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
      nonPolderFlooded.length > 0 || maxLoad > 1.0
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
}
