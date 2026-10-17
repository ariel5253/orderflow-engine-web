import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { CartStore, cartLines, cartUnits } from '../../core/cart-store';
import { NoticeAction, actionKey, paymentKey, unitCountKey } from '../../core/dictionary-keys';
import { CountPipe, RatePipe, activeFormatLocale } from '../../core/format';
import { MoneyPipe } from '../../core/money.pipe';
import { ApiFailure, isRetryable, toApiFailure } from '../../core/problem';
import { ProductApi, ProductList } from '../../core/product-api';
import { PAYMENT_METHODS, PaymentMethod } from '../../core/quote-api';
import { FailedQuoteRequest, QuoteFlow } from '../../core/quote-flow';
import { StoreContext, storeKey } from '../../core/store-context';
import { ShellHeader } from '../../shell/shell-header';
import { UiActionBar } from '../../ui/ui-action-bar/ui-action-bar';
import { UiProblemNotice } from '../../ui/ui-problem-notice/ui-problem-notice';
import { UiProductImage } from '../../ui/ui-product-image/ui-product-image';
import { UiText } from '../../ui/ui-text/ui-text';

type ProductsResult =
  | { readonly kind: 'products'; readonly products: ProductList }
  | { readonly kind: 'failure'; readonly failure: ApiFailure };

/** A notice of the cart: a failed E-07 read, or a failed E-01 from this screen or from a re-quote of the summary. */
interface CartNotice {
  readonly failure: ApiFailure;
  readonly action: NoticeAction;
  readonly quoteRequest: FailedQuoteRequest | null;
}

/** The way out of an E-01 answer that is not a 201, on the cart (SPEC §10.5). */
export function quoteRequestWayOut(failure: ApiFailure): NoticeAction {
  if (isRetryable(failure)) {
    return 'retry';
  }
  return failure.kind === 'problem' && failure.problem.code === 'CREDIT_NOT_ENABLED' ? 'payCash' : 'review';
}

/** The largest quantity a cart line takes: anything longer than ten digits is not a count the API accepts. */
const QUANTITY = /^\d{1,10}$/;

/**
 * The cart (SPEC §10.1, routes /cart and /): the products of E-07, read on every visit, each with its image, list price
 * and tax rate and a quantity stepper; cash or credit; and the unit count with "Get quote" (E-01). It shows list prices
 * and units only, never a subtotal or a total: the total comes with the quote. One cart per store, in the browser.
 */
@Component({
  selector: 'app-cart',
  imports: [ShellHeader, UiText, UiActionBar, UiProductImage, UiProblemNotice, TranslatePipe, MoneyPipe, RatePipe, CountPipe],
  templateUrl: './cart.html',
  styleUrl: './cart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage {
  private readonly productApi = inject(ProductApi);
  private readonly cartStore = inject(CartStore);
  private readonly context = inject(StoreContext);
  private readonly quoteFlow = inject(QuoteFlow);
  private readonly translate = inject(TranslateService);

  /** E-07, read again for every store the picker selects. */
  private readonly result = rxResource<ProductsResult, string>({
    params: () => storeKey(this.context.current()),
    stream: () =>
      this.productApi.list().pipe(
        map((products): ProductsResult => ({ kind: 'products', products })),
        catchError((error: unknown) => of<ProductsResult>({ kind: 'failure', failure: toApiFailure(error) })),
      ),
  });

  private readonly settled = computed(() => (this.result.isLoading() ? undefined : this.result.value()));

  protected readonly products = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'products' ? settled.products : null;
  });

  /** E-07 answered with a problem: there is nothing to list, and nothing is loading. */
  protected readonly settledWithoutProducts = computed(() => this.settled()?.kind === 'failure');

  /** A failed E-07 that "Review cart" closed. */
  private readonly dismissedRead = signal<ApiFailure | null>(null);

  protected readonly cart = this.cartStore.cart;

  protected readonly units = computed(() => cartUnits(this.cart(), this.products()?.items ?? []));

  protected readonly quoting = this.quoteFlow.pending;

  protected readonly notice = computed<CartNotice | null>(() => {
    // A failed E-01 belongs to the store it was sent for: another store's cart does not show it.
    const failed = this.quoteFlow.failed();
    if (failed && failed.store === storeKey(this.context.current())) {
      return { failure: failed.failure, action: quoteRequestWayOut(failed.failure), quoteRequest: failed };
    }
    const settled = this.settled();
    if (settled?.kind === 'failure' && settled.failure !== this.dismissedRead()) {
      return { failure: settled.failure, action: isRetryable(settled.failure) ? 'retry' : 'review', quoteRequest: null };
    }
    return null;
  });

  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly paymentKey = paymentKey;
  protected readonly actionKey = actionKey;

  constructor() {
    // A failed request is shown where it happened: leaving the cart drops it.
    inject(DestroyRef).onDestroy(() => this.quoteFlow.dismiss());
  }

  protected unitsKey(count: number): string {
    return unitCountKey(count, activeFormatLocale(this.translate));
  }

  protected quantity(sku: string): number {
    return this.cart().quantities[sku] ?? 0;
  }

  protected step(sku: string, change: 1 | -1): void {
    this.cartStore.setQuantity(this.context.current(), sku, Math.max(0, this.quantity(sku) + change));
  }

  /** Each keystroke that leaves a whole number updates the count; anything else waits for the field to be left. */
  protected typed(sku: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (QUANTITY.test(value)) {
      this.cartStore.setQuantity(this.context.current(), sku, Number(value));
    }
  }

  /** Leaving the field settles it: a whole number is kept, anything else counts as zero. */
  protected committed(sku: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    const qty = QUANTITY.test(value) ? Number(value) : 0;
    this.cartStore.setQuantity(this.context.current(), sku, qty);
    input.value = String(qty);
  }

  protected choosePayment(method: PaymentMethod): void {
    this.cartStore.setPaymentMethod(this.context.current(), method);
  }

  /** "Get quote": E-01 with the lines above zero, in the order of the list, and the chosen payment method. */
  protected getQuote(): void {
    const lines = cartLines(this.cart(), this.products()?.items ?? []);
    if (!lines.length) {
      return;
    }
    this.quoteFlow.request({ paymentMethod: this.cart().paymentMethod, lines });
  }

  /** The way out of the notice (SPEC §10.5). */
  protected act(notice: CartNotice): void {
    const failed = notice.quoteRequest;
    switch (notice.action) {
      case 'retry':
        if (failed) {
          this.quoteFlow.request(failed.request);
        } else {
          this.result.reload();
        }
        return;
      case 'payCash':
        if (failed) {
          this.cartStore.setPaymentMethod(this.context.current(), 'CASH');
          this.quoteFlow.request({ ...failed.request, paymentMethod: 'CASH' });
        }
        return;
      default:
        // "Review cart": the notice closes and the cart stays as it was.
        if (failed) {
          this.quoteFlow.dismiss();
        } else {
          this.dismissedRead.set(notice.failure);
        }
    }
  }
}
