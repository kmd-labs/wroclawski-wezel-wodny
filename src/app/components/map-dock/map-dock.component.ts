import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Play,
  Pause,
  SlidersHorizontal,
  BookOpen,
  Database,
  Wand2,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Compass,
  Plus,
  Minus,
  RotateCcw
} from 'lucide-angular';
import {
  ButtonComponent,
  PopupService,
  SwitcherComponent,
  SwitcherOption,
  TimelineMarker,
  TimelineSliderComponent,
  ToggleComponent,
  TooltipDirective
} from '@kmd/design-system';
import { I18nService } from '../../core/i18n/i18n.service';
import { AppStateService } from '../../core/services/app-state.service';
import { HydrologyService } from '../../core/services/hydrology.service';
import { MapService } from '../../core/map/map.service';
import { VectorDataService } from '../../core/services/vector-data.service';
import { DEPRESSED_ZONES, WEIR_NODES } from '../../core/data/www-hydrology.data';
import { HISTORY_ERAS, SILESIA_FACILITIES } from '../../core/data/www-events.data';
import { FloodScenarioId, GateId } from '../../core/models/www.model';
import { SettingsPopupComponent } from '../settings-popup/settings-popup.component';
import { SourcesPopupComponent } from '../sources-popup/sources-popup.component';
import { GlossaryComponent } from '../glossary/glossary.component';

@Component({
  selector: 'app-map-dock',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ButtonComponent,
    SwitcherComponent,
    TimelineSliderComponent,
    ToggleComponent,
    TooltipDirective
  ],
  templateUrl: './map-dock.component.html',
  styleUrl: './map-dock.component.scss'
})
export class MapDockComponent {
  readonly i18n = inject(I18nService);
  readonly state = inject(AppStateService);
  readonly hydro = inject(HydrologyService);
  readonly mapService = inject(MapService);
  readonly vectors = inject(VectorDataService);
  private readonly popup = inject(PopupService);

  readonly playIcon = Play;
  readonly pauseIcon = Pause;
  readonly settingsIcon = SlidersHorizontal;
  readonly bookIcon = BookOpen;
  readonly sourcesIcon = Database;
  readonly autoIcon = Wand2;
  readonly warnIcon = AlertTriangle;
  readonly safeIcon = ShieldCheck;
  readonly chevDown = ChevronDown;
  readonly chevUp = ChevronUp;
  readonly compassIcon = Compass;
  readonly plusIcon = Plus;
  readonly minusIcon = Minus;
  readonly resetIcon = RotateCcw;

  readonly controllableWeirs = WEIR_NODES.filter(w => w.controllable && w.gateId);
  readonly silesiaFacilities = SILESIA_FACILITIES;

  readonly scenarioOptions = computed<SwitcherOption<FloodScenarioId>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: '1997', label: t.scenario1997 },
      { value: '2012', label: t.scenario2012 },
      { value: '2024', label: t.scenario2024 }
    ];
  });

  readonly sliderMin = computed(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') return 400;
    if (v === 'history') return 1241;
    return 0;
  });

  readonly sliderMax = computed(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') return 3850;
    if (v === 'history') return 2024;
    return 100;
  });

  readonly sliderStep = computed(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') return 25;
    if (v === 'history') return 1;
    return 1;
  });

  readonly sliderValue = computed(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') return this.state.inflowM3s();
    if (v === 'floods') return this.state.floodTimelineStep();
    if (v === 'history') return this.state.historyYear();
    return this.state.silesiaWaveStep();
  });

  readonly sliderMarkers = computed<TimelineMarker[]>(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') {
      return [
        { id: 'eq-450', value: 450, label: '450', color: '#0ea5e9' },
        { id: 'eq-2010', value: 2160, label: '2010', color: '#d37400' },
        { id: 'eq-1917', value: 2400, label: '1917', color: '#d37400' },
        { id: 'eq-3100', value: 3100, label: '3100', color: '#10b981' },
        { id: 'eq-1997', value: 3640, label: '1997', color: '#ef4444' }
      ];
    }
    if (v === 'floods') {
      return this.hydro.activeFloodScenario().pins.map(p => ({
        id: p.id,
        value: p.step,
        label: p.dateLabel.slice(0, 5),
        color: p.category === 'breach' ? '#ef4444' : '#d37400'
      }));
    }
    if (v === 'history') {
      return HISTORY_ERAS.map(e => ({
        id: `era-${e.year}`,
        value: e.year,
        label: String(e.year),
        color: e.year === 1997 ? '#ef4444' : '#d37400'
      }));
    }
    return [
      { id: 'sil-raciborz', value: 15, label: 'Racibórz' },
      { id: 'sil-nysa', value: 35, label: 'Nysa' },
      { id: 'sil-olawa', value: 66, label: 'Oława' },
      { id: 'sil-widawa', value: 86, label: 'Widawa' }
    ];
  });

  readonly floodedZoneNames = computed(() => {
    const ids = this.hydro.floodedZoneIds();
    const lang = this.i18n.lang();
    return DEPRESSED_ZONES.filter(z => ids.has(z.id) && z.id !== 'polder-blizanowice-trestno')
      .map(z => (lang === 'pl' ? z.namePl : z.nameEn));
  });

  onSliderChange(val: number): void {
    const v = this.state.currentView();
    if (v === 'equilibrium') this.state.inflowM3s.set(val);
    else if (v === 'floods') this.state.floodTimelineStep.set(val);
    else if (v === 'history') this.state.historyYear.set(val);
    else this.state.silesiaWaveStep.set(val);
  }

  onMarkerClick(m: TimelineMarker): void {
    this.onSliderChange(m.value);
  }

  onGateInput(gate: GateId, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) this.state.setGateOpening(gate, val);
  }

  onHeadingRange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) this.mapService.setBearing(val);
  }

  onZoomRange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) this.mapService.setZoom(val);
  }

  onTiltRange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) this.mapService.setPitch(val);
  }

  openSettings(): void {
    this.popup.open({
      id: 'settings',
      title: computed(() => this.i18n.t().settingsTitle),
      component: SettingsPopupComponent,
      size: 'sm',
      actions: [{ label: computed(() => this.i18n.t().close), variant: 'default' }]
    });
  }

  openSources(): void {
    this.popup.open({
      id: 'sources',
      title: computed(() => this.i18n.t().sourcesTitle),
      component: SourcesPopupComponent,
      size: 'lg',
      actions: [{ label: computed(() => this.i18n.t().close), variant: 'default' }]
    });
  }

  openGlossary(): void {
    this.popup.open({
      id: 'glossary',
      title: computed(() => this.i18n.t().glossary),
      description: computed(() => this.i18n.t().glossaryDesc),
      component: GlossaryComponent,
      size: 'md',
      actions: [{ label: computed(() => this.i18n.t().close), variant: 'default' }]
    });
  }
}
