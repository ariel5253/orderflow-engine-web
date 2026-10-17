import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { BreakdownLines } from '../../breakdown/breakdown-lines';
import { BreakdownTotals } from '../../breakdown/breakdown-totals';
import { ConfirmationOutcome, ConfirmationOutcomes } from '../../core/confirmation-outcome';
import { NoticeAction, actionKey, orderStatusKey, paymentKey } from '../../core/dictionary-keys';
import { DateTimePipe } from '../../core/format';
import { MoneyCodePipe, MoneyPipe } from '../../core/money.pipe';
import { Order, OrderApi } from '../../core/order-api';
import { ApiFailure, isRetryable, toApiFailure } from '../../core/problem';
import { ShellHeader } from '../../shell/shell-header';
import { UiActionBar } from '../../ui/ui-action-bar/ui-action-bar';
import { UiNotice } from '../../ui/ui-notice/ui-notice';
import { UiProblemNotice } from '../../ui/ui-problem-notice/ui-problem-notice';
import { UiText } from '../../ui/ui-text/ui-text';

type OrderResult = { readonly kind: 'order'; readonly order: Order } | { readonly kind: 'failure'; readonly failure: ApiFailure };

/**
 * The way out of an E-04 problem on the order screen (SPEC §10.5): "Retry" for no answer, INTERNAL_ERROR and
 * IDEMPOTENCY_KEY_IN_PROGRESS; "View my orders" for any other, such as ORDER_NOT_FOUND.
 */
export function orderWayOut(failure: ApiFailure): NoticeAction {
  return isRetryable(failure) ? 'retry' : 'history';
}

/**
 * The order (SPEC §10.1, route /orders/:orderId): E-04 read on every visit, with its number, its confirmation time,
 * its payment method and the same breakdown components as the summary, then "View my orders" and "Keep shopping".
 * Right after E-03 it says whether the order was just confirmed or had already been recorded. The client keeps no
 * copy of an order.
 */
@Component({
  selector: 'app-order',
  imports: [
    ShellHeader,
    BreakdownLines,
    BreakdownTotals,
    RouterLink,
    UiText,
    UiActionBar,
    UiNotice,
    UiProblemNotice,
    TranslatePipe,
    MoneyPipe,
    MoneyCodePipe,
    DateTimePipe,
  ],
  templateUrl: './order.html',
  styleUrl: './order.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPage implements OnInit {
  /** The route parameter of /orders/:orderId. */
  readonly orderId = input.required<string>();

  private readonly orderApi = inject(OrderApi);
  private readonly outcomes = inject(ConfirmationOutcomes);
  private readonly router = inject(Router);

  private readonly result = rxResource<OrderResult, string>({
    params: () => this.orderId(),
    stream: ({ params }) =>
      this.orderApi.get(params).pipe(
        map((order): OrderResult => ({ kind: 'order', order })),
        catchError((error: unknown) => of<OrderResult>({ kind: 'failure', failure: toApiFailure(error) })),
      ),
  });

  private readonly settled = computed(() => (this.result.isLoading() ? undefined : this.result.value()));

  protected readonly order = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'order' ? settled.order : null;
  });

  protected readonly failure = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'failure' ? settled.failure : null;
  });

  /** How E-03 answered, when this screen opened right after it. */
  private readonly outcome = signal<ConfirmationOutcome | null>(null);

  /** "Order confirmed": E-03 answered 201 with a new order. */
  protected readonly created = computed(() => this.outcome() === 'created');

  /** "This order was already recorded": E-03 answered 201 with Idempotent-Replayed: true. */
  protected readonly replayed = computed(() => this.outcome() === 'replayed');

  protected readonly orderStatusKey = orderStatusKey;
  protected readonly paymentKey = paymentKey;
  protected readonly actionKey = actionKey;
  protected readonly orderWayOut = orderWayOut;

  ngOnInit(): void {
    this.outcome.set(this.outcomes.take(this.orderId()));
  }

  /** The way out of an E-04 problem: "Retry" reads the order again; "View my orders" opens My orders. */
  protected act(failure: ApiFailure): void {
    if (orderWayOut(failure) === 'retry') {
      this.result.reload();
    } else {
      void this.router.navigate(['/orders']);
    }
  }
}
