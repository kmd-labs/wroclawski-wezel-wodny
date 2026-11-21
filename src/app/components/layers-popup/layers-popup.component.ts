import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToggleComponent } from '@kmd/design-system';
import { I18nService } from '../../core/i18n/i18n.service';
import { AppStateService } from '../../core/services/app-state.service';

@Component({
  selector: 'app-layers-popup',
  standalone: true,
  imports: [CommonModule, ToggleComponent],
  templateUrl: './layers-popup.component.html',
  styleUrl: './layers-popup.component.scss'
})
export class LayersPopupComponent {
  readonly i18n = inject(I18nService);
  readonly state = inject(AppStateService);
}
