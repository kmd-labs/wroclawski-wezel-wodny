import { Injectable, inject, signal } from '@angular/core';
import { ThemeMode, ThemeService } from '@kmd/design-system';
import { DEFAULT_GATE_OPENINGS } from '../data/www-hydrology.data';
import { SILESIA_FACILITIES } from '../data/www-events.data';
import { FloodScenarioId, GateId, ViewMode } from '../models/www.model';

const THEME_STORAGE_KEY = 'wroclawski-wezel-wodny.theme';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private readonly theme = inject(ThemeService);

  // Navigation & Selection
  readonly currentView = signal<ViewMode>('equilibrium');
  readonly selectedPinId = signal<string | null>(null);
  readonly selectedWeirId = signal<GateId | null>(null);
  readonly selectedSegment = signal<{
    segKey: string;
    branchId: string;
    lngLat: [number, number];
  } | null>(null);

  // 1. Equilibrium View State
  readonly inflowM3s = signal<number>(2400);
  readonly gateOpenings = signal<Record<GateId, number>>({ ...DEFAULT_GATE_OPENINGS });
  readonly polderRetentionActive = signal<boolean>(true);
  readonly weirPanelOpen = signal<boolean>(true);

  // 2. Floods View State
  readonly floodScenario = signal<FloodScenarioId>('1997');
  readonly floodTimelineStep = signal<number>(62);

  // 3. History View State (1241..2024)
  readonly historyYear = signal<number>(1917);

  // 4. Lower Silesia View State
  readonly silesiaWaveStep = signal<number>(80);
  readonly silesiaActiveIds = signal<Set<string>>(
    new Set(SILESIA_FACILITIES.map(f => f.id))
  );

  // Playback State
  readonly isPlaying = signal<boolean>(false);
  private playTimer: ReturnType<typeof setInterval> | null = null;

  // Map Camera State (controlled via compact button above bottom timeline)
  readonly cameraZoom = signal<number>(12.1);
  readonly cameraPitch = signal<number>(52);
  readonly cameraBearing = signal<number>(-14);
  readonly cameraControlsOpen = signal<boolean>(false);

  // 3D Layer Toggles
  readonly show3dBuildings = signal<boolean>(true);
  readonly show3dEmbankments = signal<boolean>(true);
  readonly showDepressionZones = signal<boolean>(true);

  constructor() {
    this.restoreTheme();
  }

  setView(view: ViewMode): void {
    this.stopPlaying();
    this.selectedPinId.set(null);
    this.selectedSegment.set(null);
    this.currentView.set(view);
  }

  setGateOpening(gate: GateId, pct: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    this.gateOpenings.update(prev => ({ ...prev, [gate]: clamped }));
  }

  setTheme(mode: ThemeMode): void {
    this.theme.setMode(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }

  toggleSilesiaFacility(id: string): void {
    this.silesiaActiveIds.update(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  enableAllSilesiaFacilities(): void {
    this.silesiaActiveIds.set(new Set(SILESIA_FACILITIES.map(f => f.id)));
  }

  togglePlaying(): void {
    if (this.isPlaying()) {
      this.stopPlaying();
    } else {
      this.startPlaying();
    }
  }

  stopPlaying(): void {
    if (this.playTimer !== null) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    this.isPlaying.set(false);
  }

  private startPlaying(): void {
    this.stopPlaying();
    this.isPlaying.set(true);
    this.playTimer = setInterval(() => {
      const view = this.currentView();
      if (view === 'floods') {
        const next = Math.round((this.floodTimelineStep() + 0.5) * 10) / 10;
        if (next > 100) this.floodTimelineStep.set(0);
        else this.floodTimelineStep.set(next);
      } else if (view === 'silesia') {
        const next = Math.round((this.silesiaWaveStep() + 0.8) * 10) / 10;
        if (next > 100) this.silesiaWaveStep.set(0);
        else this.silesiaWaveStep.set(next);
      } else if (view === 'history') {
        const years = [1241, 1897, 1903, 1917, 1939, 1997, 2024];
        const cur = this.historyYear();
        const idx = years.findIndex(y => y >= cur);
        const nextIdx = idx < 0 || idx >= years.length - 1 ? 0 : idx + 1;
        this.historyYear.set(years[nextIdx]);
      } else {
        const next = this.inflowM3s() + 60;
        if (next > 3850) this.inflowM3s.set(450);
        else this.inflowM3s.set(next);
      }
    }, 160);
  }

  private restoreTheme(): void {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        this.theme.setMode(saved);
      }
    } catch {
      // ignore
    }
  }
}
