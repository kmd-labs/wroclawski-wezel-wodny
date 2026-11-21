import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  AlertTriangle,
  Waves,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Gauge
} from 'lucide-angular';
import { TooltipDirective } from '@kmd/design-system';
import { MapService, ProjectedWeirBadge } from '../../core/map/map.service';
import { AppStateService } from '../../core/services/app-state.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { GateId, MapPinViewModel } from '../../core/models/www.model';

@Component({
  selector: 'app-map-stage',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TooltipDirective],
  templateUrl: './map-stage.component.html',
  styleUrl: './map-stage.component.scss'
})
export class MapStageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  readonly mapService = inject(MapService);
  readonly state = inject(AppStateService);
  readonly i18n = inject(I18nService);

  readonly breachIcon = AlertTriangle;
  readonly waterIcon = Waves;
  readonly milestoneIcon = Landmark;
  readonly defenseIcon = ShieldCheck;
  readonly weirIcon = SlidersHorizontal;
  readonly closeIcon = X;
  readonly gaugeIcon = Gauge;

  readonly activeGate = computed<ProjectedWeirBadge | null>(() => {
    const gateId = this.state.selectedWeirId();
    if (!gateId || this.state.currentView() !== 'equilibrium') return null;
    return this.mapService.projectedWeirs().find(b => b.weir.gateId === gateId) ?? null;
  });

  ngAfterViewInit(): void {
    this.mapService.init(this.mapContainer.nativeElement);
  }

  ngOnDestroy(): void {
    this.mapService.destroy();
  }

  selectPin(pin: MapPinViewModel): void {
    this.state.selectedPinId.set(this.state.selectedPinId() === pin.id ? null : pin.id);
    this.mapService.flyTo(pin.lngLat, 13.5);
  }

  selectWeir(badge: ProjectedWeirBadge, event: MouseEvent): void {
    event.stopPropagation();
    if (!badge.weir.gateId) return;
    this.state.selectedPinId.set(null);
    this.state.selectedWeirId.set(badge.weir.gateId);
  }

  onGateRange(gateId: GateId, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.state.setGateOpening(gateId, val);
    }
  }

  setGatePreset(gateId: GateId, pct: number, event: MouseEvent): void {
    event.stopPropagation();
    this.state.setGateOpening(gateId, pct);
  }

  closeGatePopup(event: MouseEvent): void {
    event.stopPropagation();
    this.state.selectedWeirId.set(null);
  }

  pinIcon(category: MapPinViewModel['category']) {
    if (category === 'breach') return this.breachIcon;
    if (category === 'milestone') return this.milestoneIcon;
    if (category === 'defense') return this.defenseIcon;
    return this.waterIcon;
  }
}
