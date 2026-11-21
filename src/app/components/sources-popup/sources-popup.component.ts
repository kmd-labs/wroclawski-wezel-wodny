import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ExternalLink, Copy, Check } from 'lucide-angular';
import { SwitcherComponent, SwitcherOption } from '@kmd/design-system';
import { I18nService } from '../../core/i18n/i18n.service';
import { LiteratureSourceItem } from '../../core/i18n/i18n.types';
import { FLOOD_SCENARIOS } from '../../core/data/www-events.data';

export type CitationStyle = 'oxford' | 'apa' | 'harvard' | 'chicago' | 'bibtex';

const APP_URL = 'https://kmd-labs.github.io/wroclawski-wezel-wodny/';

@Component({
  selector: 'app-sources-popup',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, SwitcherComponent],
  templateUrl: './sources-popup.component.html',
  styleUrl: './sources-popup.component.scss'
})
export class SourcesPopupComponent {
  readonly i18n = inject(I18nService);
  readonly externalLinkIcon = ExternalLink;
  readonly copyIcon = Copy;
  readonly checkIcon = Check;

  readonly citationStyle = signal<CitationStyle>('oxford');
  readonly copiedKey = signal<string | null>(null);

  readonly styleOptions: SwitcherOption<CitationStyle>[] = [
    { value: 'oxford', label: 'Oxford' },
    { value: 'apa', label: 'APA' },
    { value: 'harvard', label: 'Harvard' },
    { value: 'chicago', label: 'Chicago' },
    { value: 'bibtex', label: 'BibTeX' }
  ];

  private readonly accessDate = new Date().toISOString().slice(0, 10);

  readonly appCitation = computed(() => {
    const t = this.i18n.t();
    const style = this.citationStyle();
    const title = t.citeAppTitle;
    const acc = t.citeAccessedLabel;

    switch (style) {
      case 'oxford':
        return `KMD Labs, '${title}' (KMD Labs, 2026) <${APP_URL}> [${acc} ${this.accessDate}].`;
      case 'apa':
        return `KMD Labs. (2026). ${title} [Interactive 3D hydrological visualization]. ${APP_URL}`;
      case 'harvard':
        return `KMD Labs (2026) '${title}'. Available at: ${APP_URL} (${acc} ${this.accessDate}).`;
      case 'chicago':
        return `KMD Labs. 2026. "${title}." Interactive 3D Hydrological Visualization. ${APP_URL}.`;
      case 'bibtex':
        return `@misc{kmdlabs2026www,\n  author = {{KMD Labs}},\n  title = {{${title}}},\n  year = {2026},\n  url = {${APP_URL}},\n  note = {${acc} ${this.accessDate}}\n}`;
    }
  });

  formatSourceCitation(s: LiteratureSourceItem): string {
    const style = this.citationStyle();
    const acc = this.i18n.t().citeAccessedLabel;
    switch (style) {
      case 'oxford':
        return `${s.authors}, '${s.name}' (${s.year}) <${s.url}> [${acc} ${this.accessDate}].`;
      case 'apa':
        return `${s.authors} (${s.year}). ${s.name}. ${s.url}`;
      case 'harvard':
        return `${s.authors} (${s.year}) '${s.name}'. Available at: ${s.url} (${acc} ${this.accessDate}).`;
      case 'chicago':
        return `${s.authors}. ${s.year}. "${s.name}." ${s.url}.`;
      case 'bibtex': {
        const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) + s.year.slice(0, 4);
        return `@misc{${key},\n  author = {${s.authors}},\n  title = {{${s.name}}},\n  year = {${s.year}},\n  url = {${s.url}}\n}`;
      }
    }
  }

  async copyText(key: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedKey.set(key);
      setTimeout(() => {
        if (this.copiedKey() === key) this.copiedKey.set(null);
      }, 1800);
    } catch {
      // clipboard unavailable
    }
  }

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
