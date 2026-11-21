import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ExternalLink, X, AlertTriangle, Waves } from 'lucide-angular';
import { MapService } from '../../core/map/map.service';
import { AppStateService } from '../../core/services/app-state.service';
import { I18nService } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-pin-inspector',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './pin-inspector.component.html',
  styleUrl: './pin-inspector.component.scss'
})
export class PinInspectorComponent {
  readonly mapService = inject(MapService);
  readonly state = inject(AppStateService);
  readonly i18n = inject(I18nService);

  readonly closeIcon = X;
  readonly externalIcon = ExternalLink;
  readonly breachIcon = AlertTriangle;
  readonly waterIcon = Waves;

  readonly selectedPin = computed(() => {
    const id = this.state.selectedPinId();
    if (!id) return null;
    return this.mapService.projectedPins().find(p => p.id === id) ?? null;
  });

  close(): void {
    this.state.selectedPinId.set(null);
  }
}
