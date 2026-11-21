import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Globe,
  SlidersHorizontal,
  Waves,
  History
} from 'lucide-angular';
import {
  AboutService,
  BrandComponent,
  BreakpointService,
  DropdownComponent,
  DropdownOption,
  PopupComponent,
  PopupService,
  SeoService,
  SplashComponent,
  SplashService,
  TooltipComponent
} from '@kmd/design-system';
import { I18nService } from './core/i18n/i18n.service';
import { Lang } from './core/i18n/i18n.types';
import { AppStateService } from './core/services/app-state.service';
import { ViewMode } from './core/models/www.model';
import { MapStageComponent } from './components/map-stage/map-stage.component';
import { MapDockComponent } from './components/map-dock/map-dock.component';
import { PinInspectorComponent } from './components/pin-inspector/pin-inspector.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    BrandComponent,
    DropdownComponent,
    PopupComponent,
    SplashComponent,
    TooltipComponent,
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

  readonly globeIcon = Globe;

  constructor() {
    this.seo.update({
      title: 'KMD · Wrocławski Węzeł Wodny',
      description: 'Interactive 3D hydrotechnical visualization of the Wrocław Water Node, historical floods (1997, 2010, 2024), and channel evolution.',
      image: 'assets/design-system/og-image.png'
    });
  }

  readonly langOptions = computed<DropdownOption<Lang>[]>(() =>
    this.i18n.langs.map(l => ({
      value: l,
      label: this.i18n.dicts[l].langName,
      shortLabel: l.toUpperCase(),
      badge: l.toUpperCase()
    }))
  );

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
}
