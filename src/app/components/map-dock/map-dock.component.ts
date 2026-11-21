import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Play,
  Pause,
  SlidersHorizontal,
  Database,
  Wand2,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Compass,
  Plus,
  Minus,
  RotateCcw,
  MapPin
} from 'lucide-angular';
import {
  BreakpointService,
  ButtonComponent,
  PopupService,
  SwitcherComponent,
  SwitcherOption,
  TimelineMarker,
  TimelineSliderComponent,
  TooltipDirective
} from '@kmd/design-system';
import { I18nService } from '../../core/i18n/i18n.service';
import { AppStateService } from '../../core/services/app-state.service';
import { HydrologyService } from '../../core/services/hydrology.service';
import { MapService } from '../../core/map/map.service';
import { DEPRESSED_ZONES, WEIR_NODES } from '../../core/data/www-hydrology.data';
import { HISTORY_ERAS } from '../../core/data/www-events.data';
import { FloodScenarioId, GateId } from '../../core/models/www.model';
import { LayersPopupComponent } from '../layers-popup/layers-popup.component';
import { SourcesPopupComponent } from '../sources-popup/sources-popup.component';

@Component({
  selector: 'app-map-dock',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ButtonComponent,
    SwitcherComponent,
    TimelineSliderComponent,
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
  readonly bp = inject(BreakpointService);
  private readonly popup = inject(PopupService);

  readonly playIcon = Play;
  readonly pauseIcon = Pause;
  readonly settingsIcon = SlidersHorizontal;
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
  readonly pinIcon = MapPin;

  readonly controllableWeirs = WEIR_NODES.filter(w => w.controllable && w.gateId);
  readonly historyEras = HISTORY_ERAS;

  readonly scenarioOptions = computed<SwitcherOption<FloodScenarioId>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: '1997', label: t.scenario1997 },
      { value: '2010', label: t.scenario2010 },
      { value: '2024', label: t.scenario2024 }
    ];
  });

  readonly sliderMin = computed(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') return 250;
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
    if (v === 'floods') return 0.5;
    if (v === 'history') return 1;
    return 0.5;
  });

  readonly sliderValue = computed(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') return this.state.inflowM3s();
    if (v === 'floods') return this.state.floodTimelineStep();
    return this.state.historyYear();
  });

  readonly sliderMarkers = computed<TimelineMarker[]>(() => {
    const v = this.state.currentView();
    if (v === 'equilibrium') {
      const unit = this.bp.mobile() ? '' : ' m³/s';
      return [
        { id: 'q-450', value: 450, label: `450${unit}`, color: '#0ea5e9' },
        { id: 'q-1500', value: 1500, label: `1500${unit}`, color: '#0ea5e9' },
        { id: 'q-2400', value: 2400, label: `2400${unit}`, color: '#d37400' },
        { id: 'q-3100', value: 3100, label: `3100${unit}`, color: '#10b981' },
        { id: 'q-3640', value: 3640, label: `3640${unit}`, color: '#ef4444' }
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
    return [];
  });

  readonly floodedBasins = computed(() => {
    const ids = this.hydro.floodedZoneIds();
    const lang = this.i18n.lang();
    return DEPRESSED_ZONES.filter(z => ids.has(z.id) && z.id !== 'polder-blizanowice-trestno').map(z => {
      const ring = z.polygon.length > 1 ? z.polygon.slice(0, -1) : z.polygon;
      const lng = ring.reduce((s, p) => s + p[0], 0) / (ring.length || 1);
      const lat = ring.reduce((s, p) => s + p[1], 0) / (ring.length || 1);
      return {
        id: z.id,
        name: lang === 'pl' ? z.namePl : z.nameEn,
        center: [lng, lat] as [number, number]
      };
    });
  });

  navigateToBasin(center: [number, number]): void {
    this.mapService.flyTo(center, 13.6);
  }

  readonly sliderTrackGradient = computed<string | undefined>(() => {
    if (this.state.currentView() !== 'floods') return undefined;
    return this.hydro.floodHydrographChart().trackGradient;
  });

  onSliderChange(val: number): void {
    const v = this.state.currentView();
    if (v === 'equilibrium') this.state.inflowM3s.set(val);
    else if (v === 'floods') this.state.floodTimelineStep.set(val);
    else this.state.historyYear.set(val);
  }

  onMarkerClick(m: TimelineMarker): void {
    this.onSliderChange(m.value);
  }

  onHydrographClick(event: MouseEvent): void {
    const el = event.currentTarget as SVGSVGElement;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    this.state.floodTimelineStep.set(Math.round(pct * 2) / 2);
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
      id: 'layers',
      title: computed(() => this.i18n.t().layersTitle),
      component: LayersPopupComponent,
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
}
