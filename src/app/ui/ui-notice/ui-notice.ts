import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from '@angular/core';
import { UiText } from '../ui-text/ui-text';

export type NoticeTone = 'success' | 'info' | 'warning';

/** The strokes of each tone's icon: a check, an "i" and an exclamation mark, each in a circle. */
const ICONS: Readonly<Record<NoticeTone, readonly string[]>> = {
  success: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'M22 4 12 14l-3-3'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 16v-4', 'M12 8h.01'],
  warning: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8v4', 'M12 16h.01'],
};

/**
 * The state of a screen that the user must notice: an order confirmed or replayed, a quote expired, confirmed or
 * beyond the credit. Its title and detail are projected ui-text elements (`notice-title`, `notice-detail`); its one
 * action, when it has one, is a button of at least 44 x 44 px.
 */
@Component({
  selector: 'ui-notice',
  imports: [UiText],
  templateUrl: './ui-notice.html',
  styleUrl: './ui-notice.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiNotice {
  readonly tone = input.required<NoticeTone>();

  /** The label of the way out, already translated; none when the state needs no action. */
  readonly actionLabel = input<string | null>(null);

  /** Whether the action is unavailable, such as while the request it sends waits for its answer. */
  readonly actionDisabled = input(false);

  readonly action = output<void>();

  protected readonly icon = computed(() => ICONS[this.tone()]);

  /** An outcome is announced politely; a state that blocks the next step is an alert. */
  protected readonly role = computed(() => (this.tone() === 'warning' ? 'alert' : 'status'));
}
