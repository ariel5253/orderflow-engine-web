import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { BreakdownLines } from '../../breakdown/breakdown-lines';
import { BreakdownTotals } from '../../breakdown/breakdown-totals';
import { CartStore } from '../../core/cart-store';
import { ConfirmationOutcomes } from '../../core/confirmation-outcome';
import { NoticeAction, actionKey, statusKey } from '../../core/dictionary-keys';
import { DateTimePipe } from '../../core/format';
import { IdempotencyKeys } from '../../core/idempotency-keys';
import { MoneyCodePipe, MoneyPipe } from '../../core/money.pipe';
import { OrderApi } from '../../core/order-api';
import { ApiFailure, isRetryable, toApiFailure } from '../../core/problem';
import { PaymentMethod, Quote, QuoteApi, paidLines } from '../../core/quote-api';
import { QuoteFlow } from '../../core/quote-flow';
import { StoreContext } from '../../core/store-context';
import { ShellHeader } from '../../shell/shell-header';
import { UiActionBar } from '../../ui/ui-action-bar/ui-action-bar';
import { UiNotice } from '../../ui/ui-notice/ui-notice';
import { UiProblemNotice } from '../../ui/ui-problem-notice/ui-problem-notice';
import { UiText } from '../../ui/ui-text/ui-text';

type QuoteResult = { readonly kind: 'quote'; readonly quote: Quote } | { readonly kind: 'failure'; readonly failure: ApiFailure };

/** The way out of an E-03 answer that is not a 201 (SPEC §10.5, the summary's rows). */
export function confirmationWayOut(failure: ApiFailure): NoticeAction {
  if (isRetryable(failure)) {
    return 'retry';
  }
  if (failure.kind !== 'problem') {
    return 'edit';
  }
  switch (failure.problem.code) {
    case 'QUOTE_EXPIRED':
      return 'requote';
    case 'CREDIT_LIMIT_EXCEEDED':
      return 'payCash';
    case 'QUOTE_ALREADY_CONFIRMED':
      return failure.problem.orderId && failure.problem.orderNumber ? 'viewOrder' : 'edit';
    default:
      return 'edit';
  }
}

/**
 * The order summary (SPEC §10.1): E-02 read on every visit, shown as the API sends it, then "Confirm order" (E-03)
 * with one Idempotency-Key per quote (§10.4). A quote that is expired, confirmed or beyond the credit says so and
 * offers its way out; every problem offers exactly the action of §10.5.
 */
@Component({
  selector: 'app-order-summary',
  imports: [
    ShellHeader,
    BreakdownLines,
    BreakdownTotals,
    UiText,
    UiActionBar,
    UiNotice,
    UiProblemNotice,
    TranslatePipe,
    MoneyPipe,
    MoneyCodePipe,
    DateTimePipe,
  ],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderSummaryPage {
  /** The route parameter of /quotes/:quoteId. */
  readonly quoteId = input.required<string>();

  private readonly quoteApi = inject(QuoteApi);
  private readonly orderApi = inject(OrderApi);
  private readonly keys = inject(IdempotencyKeys);
  private readonly cartStore = inject(CartStore);
  private readonly context = inject(StoreContext);
  private readonly quoteFlow = inject(QuoteFlow);
  private readonly outcomes = inject(ConfirmationOutcomes);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Whether this screen is still shown: an E-03 answer that comes after it was left opens nothing. */
  private shown = true;

  private readonly result = rxResource<QuoteResult, string>({
    params: () => this.quoteId(),
    stream: ({ params }) =>
      this.quoteApi.get(params).pipe(
        map((quote): QuoteResult => ({ kind: 'quote', quote })),
        catchError((error: unknown) => of<QuoteResult>({ kind: 'failure', failure: toApiFailure(error) })),
      ),
  });

  private readonly settled = computed(() => (this.result.isLoading() ? undefined : this.result.value()));

  protected readonly quote = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'quote' ? settled.quote : null;
  });

  /** The E-02 failure: it replaces the quote. */
  protected readonly failure = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'failure' ? settled.failure : null;
  });

  /** E-03 is waiting for its answer. Each quote starts with none. */
  protected readonly confirming = linkedSignal({ source: this.quoteId, computation: () => false });

  /** The E-03 answer that was not a 201: shown above the quote, with its way out. Each quote starts with none. */
  protected readonly confirmFailure = linkedSignal<string, ApiFailure | null>({ source: this.quoteId, computation: () => null });

  /** While a confirmation or a re-quote waits for its answer, no action sends another request. */
  protected readonly busy = computed(() => this.confirming() || this.quoteFlow.pending());

  /** An open quote on credit that the credit does not cover (SPEC §10.4). */
  protected readonly short = computed(() => {
    const quote = this.quote();
    return quote?.status === 'OPEN' && !!quote.credit && !quote.credit.fits;
  });

  protected readonly expired = computed(() => this.quote()?.status === 'EXPIRED');

  protected readonly confirmed = computed(() => this.quote()?.status === 'CONFIRMED');

  protected readonly canConfirm = computed(() => this.quote()?.status === 'OPEN' && !this.short() && !this.busy());

  /** The order a confirmed quote became, when this client knows it. */
  protected readonly knownOrder = computed(() => {
    const quote = this.quote();
    return quote ? this.keys.orderOf(quote.quoteId) : null;
  });

  private readonly confirmNotice = viewChild('confirmNotice', { read: ElementRef });

  protected readonly statusKey = statusKey;
  protected readonly actionKey = actionKey;
  protected readonly confirmationWayOut = confirmationWayOut;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.shown = false));
  }

  /** "Confirm order": the first tap creates the quote's key; every later tap or retry sends the same key and body. */
  protected confirm(quote: Quote): void {
    if (!this.canConfirm()) {
      return;
    }
    this.sendConfirmation(quote);
  }

  /** The way out of an E-03 problem (SPEC §10.5). */
  protected onConfirmFailure(quote: Quote, failure: ApiFailure): void {
    switch (confirmationWayOut(failure)) {
      case 'retry':
        this.sendConfirmation(quote);
        return;
      case 'requote':
        this.requote(quote, this.paymentMethodOf(quote));
        return;
      case 'payCash':
        this.payCash(quote);
        return;
      case 'viewOrder':
        if (failure.kind === 'problem' && failure.problem.orderId) {
          void this.router.navigate(['/orders', failure.problem.orderId]);
        }
        return;
      default:
        this.editCart(quote);
    }
  }

  /** The way out of an E-02 problem: "Retry" repeats the read; any other is "Edit cart". */
  protected loadWayOut(failure: ApiFailure): NoticeAction {
    return isRetryable(failure) ? 'retry' : 'edit';
  }

  /** Acts on the way out of an E-02 problem. */
  protected onLoadFailure(failure: ApiFailure): void {
    if (isRetryable(failure)) {
      this.result.reload();
    } else {
      this.editCart(null);
    }
  }

  /** "Pay cash": the same lines quoted with CASH, and the cart switched to cash. */
  protected payCash(quote: Quote): void {
    this.cartStore.setPaymentMethod(this.context.current(), 'CASH');
    this.requote(quote, 'CASH');
  }

  /** "Quote again": the same lines with the same payment method. */
  protected quoteAgain(quote: Quote): void {
    this.requote(quote, this.paymentMethodOf(quote));
  }

  /** "Edit cart": opens the cart with the lines of this quote, or with the cart as it was when there is no quote. */
  protected editCart(quote: Quote | null): void {
    if (quote) {
      this.cartStore.replace(this.context.current(), this.paymentMethodOf(quote), paidLines(quote));
    }
    void this.router.navigate(['/cart']);
  }

  protected viewOrder(orderId: string): void {
    void this.router.navigate(['/orders', orderId]);
  }

  /** "View my orders": a confirmed quote whose order this client does not know is found in My orders (SPEC §10.4). */
  protected viewHistory(): void {
    void this.router.navigate(['/orders']);
  }

  /** The parameters of a way out's label: "View order {number}" names the order. */
  protected actionParams(failure: ApiFailure): Record<string, string> {
    return failure.kind === 'problem' && failure.problem.orderNumber ? { number: failure.problem.orderNumber } : {};
  }

  private requote(quote: Quote, paymentMethod: PaymentMethod): void {
    if (this.busy()) {
      return;
    }
    this.quoteFlow.request({ paymentMethod, lines: paidLines(quote) });
  }

  /**
   * The payment method of a quote, which E-02 does not carry: the one this client sent, else credit when the body
   * has a credit position, else the cart's.
   */
  private paymentMethodOf(quote: Quote): PaymentMethod {
    return this.cartStore.paymentMethodOf(quote.quoteId) ?? (quote.credit ? 'CREDIT' : this.cartStore.cart().paymentMethod);
  }

  /**
   * Sends E-03, never while E-03 or a re-quote waits for its answer (SPEC §10.4), whichever control asked: "Confirm
   * order" or "Retry". The answer always records the order and empties the cart of the store that sent it; it opens
   * the order or shows its problem only while this screen is still shown, since once it is left the store may change.
   */
  private sendConfirmation(quote: Quote): void {
    if (this.busy()) {
      return;
    }
    const store = this.context.current();
    const key = this.keys.keyFor(quote.quoteId);
    this.confirming.set(true);
    this.confirmFailure.set(null);
    this.orderApi.confirm(quote.quoteId, key).subscribe({
      next: ({ order, replayed }) => {
        this.keys.recordOrder(quote.quoteId, order);
        this.cartStore.clear(store);
        if (!this.shown) {
          return;
        }
        this.outcomes.hand(order.orderId, replayed ? 'replayed' : 'created');
        void this.router.navigate(['/orders', order.orderId]);
      },
      error: (error: unknown) => {
        const failure = toApiFailure(error);
        if (failure.kind === 'problem' && failure.problem.orderId && failure.problem.orderNumber) {
          this.keys.recordOrder(quote.quoteId, { orderId: failure.problem.orderId, orderNumber: failure.problem.orderNumber });
        }
        if (!this.shown) {
          return;
        }
        this.confirming.set(false);
        this.confirmFailure.set(failure);
        afterNextRender({ write: () => this.confirmNotice()?.nativeElement.scrollIntoView({ block: 'nearest' }) }, { injector: this.injector });
      },
    });
  }
}
