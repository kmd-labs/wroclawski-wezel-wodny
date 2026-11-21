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
  readonly theme = inject(ThemeService);

  readonly themeOptions = computed<SwitcherOption<ThemeMode>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'light', label: t.themeLight },
      { value: 'dark', label: t.themeDark }
    ];
  });
}
