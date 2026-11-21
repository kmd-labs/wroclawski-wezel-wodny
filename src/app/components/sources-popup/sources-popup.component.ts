import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ExternalLink } from 'lucide-angular';
import { I18nService } from '../../core/i18n/i18n.service';
import { FLOOD_SCENARIOS } from '../../core/data/www-events.data';

@Component({
  selector: 'app-sources-popup',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './sources-popup.component.html',
  styleUrl: './sources-popup.component.scss'
})
export class SourcesPopupComponent {
  readonly i18n = inject(I18nService);
  readonly externalLinkIcon = ExternalLink;

  readonly articleLinks = computed(() => {
    const lang = this.i18n.lang();
    const allPins = [
      ...FLOOD_SCENARIOS['1997'].pins,
      ...FLOOD_SCENARIOS['2012'].pins,
      ...FLOOD_SCENARIOS['2024'].pins
    ];
    const seen = new Set<string>();
    return allPins
      .filter(p => {
        if (seen.has(p.sourceUrl)) return false;
        seen.add(p.sourceUrl);
        return true;
      })
      .map(p => ({
        title: lang === 'pl' ? p.sourceTitlePl : p.sourceTitleEn,
        outlet: p.sourceOutlet,
        date: p.dateLabel,
        url: p.sourceUrl
      }));
  });
}
