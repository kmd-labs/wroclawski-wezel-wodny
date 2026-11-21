import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-glossary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './glossary.component.html',
  styleUrl: './glossary.component.scss'
})
export class GlossaryComponent {
  readonly i18n = inject(I18nService);
}
