import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  SwitcherComponent,
  SwitcherOption,
  ThemeMode,
  ThemeService,
  ToggleComponent
} from '@kmd/design-system';
import { I18nService } from '../../core/i18n/i18n.service';
import { AppStateService } from '../../core/services/app-state.service';
import { LodMode, VectorDataService } from '../../core/services/vector-data.service';

@Component({
  selector: 'app-settings-popup',
  standalone: true,
  imports: [CommonModule, SwitcherComponent, ToggleComponent],
  templateUrl: './settings-popup.component.html',
  styleUrl: './settings-popup.component.scss'
})
export class SettingsPopupComponent {
  readonly i18n = inject(I18nService);
  readonly state = inject(AppStateService);
  readonly vectors = inject(VectorDataService);
  readonly theme = inject(ThemeService);

  readonly lodOptions = computed<SwitcherOption<LodMode>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'auto', label: t.lodAuto },
      { value: 0, label: t.lodLow },
      { value: 1, label: t.lodMedium },
      { value: 2, label: t.lodHigh }
    ];
  });

  readonly themeOptions = computed<SwitcherOption<ThemeMode>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'light', label: t.themeLight },
      { value: 'dark', label: t.themeDark }
    ];
  });

  onLodChange(mode: LodMode | undefined): void {
    this.vectors.setLodMode(mode ?? 'auto', this.state.cameraZoom());
  }
}
