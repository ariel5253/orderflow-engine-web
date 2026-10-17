import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { NoticeAction, actionKey } from '../../core/dictionary-keys';
import { DateTimePipe } from '../../core/format';
import { MoneyCodePipe, MoneyPipe } from '../../core/money.pipe';
import { OrderApi, OrderHistory } from '../../core/order-api';
import { ApiFailure, isRetryable, toApiFailure } from '../../core/problem';
import { Store, StoreContext } from '../../core/store-context';
import { ShellHeader } from '../../shell/shell-header';
import { UiActionBar } from '../../ui/ui-action-bar/ui-action-bar';
import { UiProblemNotice } from '../../ui/ui-problem-notice/ui-problem-notice';
import { UiText } from '../../ui/ui-text/ui-text';

type HistoryResult =
  | { readonly kind: 'history'; readonly history: OrderHistory }
  | { readonly kind: 'failure'; readonly failure: ApiFailure };

/**
 * The way out of an E-05 problem on My orders (SPEC §10.5): "Retry" for no answer, INTERNAL_ERROR and
 * IDEMPOTENCY_KEY_IN_PROGRESS; "Go shopping" for any other, such as CUSTOMER_NOT_FOUND for a store list that outlived
 * its customer.
 */
export function historyWayOut(failure: ApiFailure): NoticeAction {
  return isRetryable(failure) ? 'retry' : 'shop';
}

/**
 * My orders (SPEC §10.1, route /orders): E-05 read on every visit, for the customer of the selected store, and shown
 * as it arrives: newest first, each order with its number, its confirmation time and its total in the body's currency,
 * or an empty state. The client keeps no copy of an order, so an order confirmed a moment ago is listed as soon as the
 * API has it (read-your-writes, SPEC AC-52).
 */
@Component({
  selector: 'app-history',
  imports: [ShellHeader, RouterLink, UiText, UiActionBar, UiProblemNotice, TranslatePipe, MoneyPipe, MoneyCodePipe, DateTimePipe],
  templateUrl: './history.html',
  styleUrl: './history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  private readonly orderApi = inject(OrderApi);
  private readonly context = inject(StoreContext);
  private readonly router = inject(Router);

  /** E-05, read again for every store the picker selects. */
  private readonly result = rxResource<HistoryResult, Store>({
    params: () => this.context.current(),
    stream: ({ params }) =>
      this.orderApi.history(params.customerId).pipe(
        map((history): HistoryResult => ({ kind: 'history', history })),
        catchError((error: unknown) => of<HistoryResult>({ kind: 'failure', failure: toApiFailure(error) })),
      ),
  });

  private readonly settled = computed(() => (this.result.isLoading() ? undefined : this.result.value()));

  protected readonly history = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'history' ? settled.history : null;
  });

  protected readonly failure = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'failure' ? settled.failure : null;
  });

  protected readonly actionKey = actionKey;
  protected readonly historyWayOut = historyWayOut;

  /** Each order opens at its own route, where E-04 reads it. */
  protected orderLink(orderId: string): string[] {
    return ['/orders', orderId];
  }

  /** The way out of an E-05 problem: "Retry" reads the history again; "Go shopping" opens the cart. */
  protected act(failure: ApiFailure): void {
    if (historyWayOut(failure) === 'retry') {
      this.result.reload();
    } else {
      void this.router.navigate(['/cart']);
    }
  }
}
