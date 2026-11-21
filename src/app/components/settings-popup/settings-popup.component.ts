import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Sun, Moon } from 'lucide-angular';
import { ThemeMode, ThemeService } from '@kmd/design-system';
import { I18nService } from '../../core/i18n/i18n.service';
import { Lang } from '../../core/i18n/i18n.types';
import { AppStateService } from '../../core/services/app-state.service';

@Component({
  selector: 'app-settings-popup',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './settings-popup.component.html',
  styleUrl: './settings-popup.component.scss'
})
export class SettingsPopupComponent {
  readonly i18n = inject(I18nService);
  readonly state = inject(AppStateService);
  readonly theme = inject(ThemeService);

  readonly themes = computed<{ id: ThemeMode; icon: typeof Sun; label: string }[]>(() => {
    const t = this.i18n.t();
    return [
      { id: 'light', icon: Sun, label: t.themeLight },
      { id: 'dark', icon: Moon, label: t.themeDark }
    ];
  });

  readonly languages = computed<{ id: Lang; label: string }[]>(() =>
    this.i18n.langs.map(id => ({ id, label: this.i18n.dicts[id].langName }))
  );
}
