import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Settings,
  SlidersHorizontal,
  Waves,
  History
} from 'lucide-angular';
import {
  AboutService,
  BrandComponent,
  BreakpointService,
  ButtonComponent,
  DropdownComponent,
  DropdownOption,
  PopupComponent,
  PopupService,
  SeoService,
  SplashComponent,
  SplashService,
  TooltipComponent,
  TooltipDirective
} from '@kmd/design-system';
import { I18nService } from './core/i18n/i18n.service';
import { AppStateService } from './core/services/app-state.service';
import { ViewMode } from './core/models/www.model';
import { MapStageComponent } from './components/map-stage/map-stage.component';
import { MapDockComponent } from './components/map-dock/map-dock.component';
import { PinInspectorComponent } from './components/pin-inspector/pin-inspector.component';
import { SettingsPopupComponent } from './components/settings-popup/settings-popup.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    BrandComponent,
    ButtonComponent,
    DropdownComponent,
    PopupComponent,
    SplashComponent,
    TooltipComponent,
    TooltipDirective,
    MapStageComponent,
    MapDockComponent,
    PinInspectorComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly i18n = inject(I18nService);
  readonly bp = inject(BreakpointService);
  readonly popup = inject(PopupService);
  readonly about = inject(AboutService);
  readonly splash = inject(SplashService);
  readonly seo = inject(SeoService);
  readonly state = inject(AppStateService);

  readonly settingsIcon = Settings;

  constructor() {
    this.seo.update({
      title: 'KMD · Wrocławski Węzeł Wodny',
      description: 'Interactive 3D hydrotechnical visualization of the Wrocław Water Node, historical floods (1997, 2010, 2024), and channel evolution.',
      image: 'assets/design-system/og-image.png'
    });
  }

  readonly viewOptions = computed<DropdownOption<ViewMode>[]>(() => {
    const t = this.i18n.t();
    return [
      { value: 'equilibrium', label: t.viewEquilibrium, icon: SlidersHorizontal },
      { value: 'floods', label: t.viewFloods, icon: Waves },
      { value: 'history', label: t.viewHistory, icon: History }
    ];
  });

  readonly currentViewIcon = computed(
    () => this.viewOptions().find(o => o.value === this.state.currentView())?.icon ?? SlidersHorizontal
  );

  readonly isPopupOpen = computed(() => this.popup.config() !== null);

  openSettings(): void {
    this.popup.open({
      id: 'settings',
      title: computed(() => this.i18n.t().settingsTitle),
      component: SettingsPopupComponent,
      size: 'sm',
      actions: [{ label: computed(() => this.i18n.t().close), variant: 'default' }]
    });
  }
}
