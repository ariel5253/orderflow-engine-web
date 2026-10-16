import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ApiFailure } from '../../core/problem';
import { UiText } from '../ui-text/ui-text';

/**
 * Renders a failed API call (SPEC §10.2): the API's title and detail, already in the active language, then the code
 * and a reference made of the first 8 characters of correlationId, then the one action the screen gives it. A failure
 * without a problem body (no answer, or an answer the API never sends) shows the web text problem.network instead.
 */
@Component({
  selector: 'ui-problem-notice',
  imports: [UiText, TranslatePipe],
  templateUrl: './ui-problem-notice.html',
  styleUrl: './ui-problem-notice.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiProblemNotice {
  readonly failure = input.required<ApiFailure>();

  /** The label of the way out, already translated; none when the screen offers no action. */
  readonly actionLabel = input<string | null>(null);

  /** Whether the action is unavailable, such as while the request it sends waits for its answer. */
  readonly actionDisabled = input(false);

  readonly action = output<void>();

  protected readonly problem = computed(() => {
    const failure = this.failure();
    return failure.kind === 'problem' ? failure.problem : null;
  });

  protected readonly reference = computed(() => this.problem()?.correlationId.slice(0, 8) ?? '');
}
