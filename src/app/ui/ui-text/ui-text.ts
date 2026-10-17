import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * The only way a screen prints text (SPEC §10.2). It wraps anywhere, never truncates and grows vertically, so a long
 * product or store name can never be cut or push the layout sideways.
 */
@Component({
  selector: 'ui-text',
  templateUrl: './ui-text.html',
  styleUrl: './ui-text.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiText {}
