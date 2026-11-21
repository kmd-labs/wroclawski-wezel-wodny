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
import { BranchHydrology, GateId } from '../models/www.model';
import { AppStateService } from './app-state.service';

@Injectable({ providedIn: 'root' })
export class HydrologyService {
  private readonly state = inject(AppStateService);

  /** Optimal RZGW Wrocław gate apertures for a given Trestno inflow. */
  computeOptimalGateOpenings(inflowM3s: number): Record<GateId, number> {
    if (inflowM3s <= 950) {
      return {
        bartoszowice: 35,
        opatowice: 65,
        szczytniki: 30,
        widawa: 0,
        'psie-pole': 100, // navigation open at low/normal flow
        redzin: 100
      };
    }
    if (inflowM3s <= 2150) {
      return {
        bartoszowice: 85,
        opatowice: 75,
        szczytniki: 75,
        widawa: 15,
        'psie-pole': 0, // Floodgate closed to protect Nadodrze
        redzin: 100
      };
    }
    return {
      bartoszowice: 100,
      opatowice: 90,
      szczytniki: 100,
      widawa: 100, // Full 300 m³/s into Widawa bypass
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
      bartoszowice: 45, // Throttled flood canal
      opatowice: 95,
      szczytniki: 25, // Too little diverted to Stara Odra
      widawa: 0, // Bypass left closed
      'psie-pole': 85, // Floodgate accidentally open!
      redzin: 65 // Outlet throttled -> Kozanów backwater
    });
  }

  /** Current Flood Scenario Metadata & Interpolated Keyframe. */
  readonly activeFloodScenario = computed(() => FLOOD_SCENARIOS[this.state.floodScenario()]);

  readonly activeFloodKeyframe = computed(() => {
    const scenario = this.activeFloodScenario();
    const step = this.state.floodTimelineStep();
    const frames = scenario.keyframes;
    let current = frames[0];
    for (const f of frames) {
      if (f.step <= step) current = f;
    }
    return current;
  });

  /** Current Historical Era for History View. */
  readonly activeHistoryEra = computed(() => {
    const yr = this.state.historyYear();
    let era = HISTORY_ERAS[0];
    for (const e of HISTORY_ERAS) {
      if (e.year <= yr) era = e;
    }
    return era;
  });

  /** Lower Silesia Retention Summary. */
  readonly silesiaSummary = computed(() => {
    const active = this.state.silesiaActiveIds();
    const step = this.state.silesiaWaveStep();
    const rawPeak = 3850; // Extreme 1997/2024 Upper Odra + Kłodzko combined peak
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

  /**
   * Real-time mass-balanced hydrology across every canal branch in Wrocław.
   * Adapts seamlessly depending on the active view.
   */
  readonly branchHydrology = computed<Record<string, BranchHydrology>>(() => {
    const view = this.state.currentView();
    const gates = this.state.gateOpenings();

    let inflow = this.state.inflowM3s();
    let polderShave = this.state.polderRetentionActive() && inflow > 1800 ? Math.min(260, (inflow - 1800) * 0.35) : 0;

    if (view === 'floods') {
      const kf = this.activeFloodKeyframe();
      inflow = kf.flowTrestnoM3s;
      polderShave = 0; // Keyframes already represent Trestno gauge flow
    } else if (view === 'silesia') {
      inflow = this.silesiaSummary().atWroclaw;
      polderShave = 0;
    } else if (view === 'history') {
      inflow = Math.min(2100, this.activeHistoryEra().capacityM3s * 0.85);
      polderShave = 0;
    }

    const effectiveTrestno = Math.max(250, inflow - polderShave);

    // 1. Przewał Widawski (Strachocin) bypass: up to 300 m³/s when gate is open & stage is high
    const widawaShare = view === 'equilibrium'
      ? Math.min(350, (gates.widawa / 100) * Math.max(0, effectiveTrestno - 1100) * 0.28)
      : view === 'floods' && this.state.floodScenario() === '1997'
        ? Math.min(210, Math.max(0, effectiveTrestno - 1400) * 0.14)
        : Math.min(300, Math.max(0, effectiveTrestno - 1300) * 0.25);

    const remainingCity = Math.max(200, effectiveTrestno - widawaShare);

    // 2. Bartoszowice vs Opatowice split
    const bOpen = view === 'equilibrium' ? Math.max(0.05, gates.bartoszowice / 100) : 0.9;
    const oOpen = view === 'equilibrium' ? Math.max(0.05, gates.opatowice / 100) : 0.85;
    const bWeight = bOpen * 1170;
    const oWeight = oOpen * 1630;
    const weightSum = bWeight + oWeight || 1;

    const qBartoszowiceTotal = remainingCity * (bWeight / weightSum);
    const qKanalPowodziowy = qBartoszowiceTotal * 0.93;
    const qKanalZeglugowy = qBartoszowiceTotal * 0.07;
    const qOdraMiejskaUpper = remainingCity - qBartoszowiceTotal;

    // 3. Szczytniki split (Górna Odra Miejska -> Przekop Szczytnicki vs Śródmieście)
    const szOpen = view === 'equilibrium' ? gates.szczytniki / 100 : 0.85;
    const qSzczytniki = qOdraMiejskaUpper * (0.44 * szOpen);
    const qAfterSzczytniki = qOdraMiejskaUpper - qSzczytniki;

    // 4. Psie Pole Floodgate (Stara Odra -> Kanał Miejski)
    const qStaraOdraTotal = qKanalPowodziowy + qKanalZeglugowy + qSzczytniki;
    const ppOpen = view === 'equilibrium' ? gates['psie-pole'] / 100 : (this.state.floodScenario() === '1997' && this.state.floodTimelineStep() > 75 ? 0.85 : 0.02);
    const qKanalMiejski = Math.min(420, qStaraOdraTotal * 0.22 * ppOpen);
    const qStaraOdra = qStaraOdraTotal - qKanalMiejski;
    const qSrodmiescie = qAfterSzczytniki;

    // 5. Rędzin Outlet & Backwater (Cofka)
    const redzinCap = view === 'equilibrium'
      ? Math.max(400, (gates.redzin / 100) * 3100)
      : view === 'floods' && this.state.floodScenario() !== '2024'
        ? 2350
        : 3100;
    const qRedzin = qStaraOdra + qSrodmiescie + qKanalMiejski;
    const backwaterFactor = qRedzin > redzinCap ? qRedzin / redzinCap : 1;

    const rawFlows: Record<string, number> = {
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
      'olawa-river': 22 + Math.max(0, effectiveTrestno - 2200) * 0.12,
      'sleza-river': (view === 'floods' && this.state.floodScenario() === '2012' && this.state.floodTimelineStep() >= 45 ? 165 : 18) + (backwaterFactor - 1) * 180,
      'bystrzyca-river': view === 'floods' && this.state.floodScenario() === '2024' && this.state.floodTimelineStep() >= 40 ? 195 : 26
    };

    const result: Record<string, BranchHydrology> = {};
    for (const seg of CANAL_SEGMENTS) {
      const flowM3s = Math.round(rawFlows[seg.id] ?? seg.normalFlowM3s);
      // Pre-modernization capacity in 1997 / 2012 scenarios was ~76% of modern POPDO capacity
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

  /** List of currently inundated depressed zone IDs. */
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

  /** Breached embankment IDs (for 1997 & 2010/2012 scenarios). */
  readonly breachedEmbankmentIds = computed<Set<string>>(() => {
    if (this.state.currentView() !== 'floods') return new Set();
    return new Set(this.activeFloodKeyframe().breachedEmbankments);
  });

  /** Overall equilibrium status summary for the bottom dock readout. */
  readonly equilibriumSummary = computed(() => {
    const branches = this.branchHydrology();
    const flooded = this.floodedZoneIds();
    const mainIds = ['kanal-powodziowy', 'stara-odra', 'srodmiescie', 'kanal-miejski', 'odra-redzin', 'przewal-widawski'];
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

    const totalEmbankments = EMBANKMENT_SEGMENTS.length;
    return {
      status,
      maxLoadPct: Math.round(maxLoad * 100),
      widawaFlow: branches['przewal-widawski']?.flowM3s ?? 0,
      downtownFlow: branches['srodmiescie']?.flowM3s ?? 0,
      staraOdraFlow: branches['stara-odra']?.flowM3s ?? 0,
      floodedCount: nonPolderFlooded.length,
      totalEmbankments
    };
  });
}
