import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { CountPipe, DateTimePipe, RatePipe, activeFormatLocale } from '../../core/format';
import { MoneyPipe } from '../../core/money.pipe';
import { ApiFailure, isRetryable, toApiFailure } from '../../core/problem';
import { Quote, QuoteApi, QuoteStatus } from '../../core/quote-api';
import { UiActionBar } from '../../ui/ui-action-bar/ui-action-bar';
import { UiProblemNotice } from '../../ui/ui-problem-notice/ui-problem-notice';
import { UiProductImage } from '../../ui/ui-product-image/ui-product-image';
import { UiText } from '../../ui/ui-text/ui-text';
import { enumKey, lineCountKey, originKind } from './order-summary-keys';

type QuoteResult = { readonly kind: 'quote'; readonly quote: Quote } | { readonly kind: 'failure'; readonly failure: ApiFailure };

const ZERO = /^0+(\.0+)?$/;

/**
 * The order summary (SPEC §10.1): E-02 read on every visit, shown as the API sends it. Lines, discounts with their
 * origin, gifts with their quantity, taxes and total; the credit position while the quote is open.
 */
@Component({
  selector: 'app-order-summary',
  imports: [UiText, UiActionBar, UiProductImage, UiProblemNotice, TranslatePipe, MoneyPipe, RatePipe, CountPipe, DateTimePipe],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderSummaryPage {
  /** The route parameter of /quotes/:quoteId. */
  readonly quoteId = input.required<string>();

  private readonly quoteApi = inject(QuoteApi);
  private readonly translate = inject(TranslateService);

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

  protected readonly failure = computed(() => {
    const settled = this.settled();
    return settled?.kind === 'failure' ? settled.failure : null;
  });

  protected readonly isRetryable = isRetryable;

  /** "Retry" repeats the same request (SPEC §10.5). */
  protected retry(): void {
    this.result.reload();
  }

  protected statusKey(status: QuoteStatus): string {
    return enumKey('status', status);
  }

  protected originKey(origin: string): string {
    return enumKey('origin', originKind(origin));
  }

  protected linesKey(count: number): string {
    return lineCountKey(count, activeFormatLocale(this.translate));
  }

  /** A combo allocation names its combo the way the order-level discount does, so the two can be matched. */
  protected comboOrigin(comboId: string): string {
    return `COMBO:${comboId}`;
  }

  /** The name of a gift in the totals, taken from its gift line. */
  protected giftName(quote: Quote, sku: string): string {
    return quote.lines.find((line) => line.isGift && line.sku === sku)?.description ?? sku;
  }

  /** Whether an amount string is zero, read from its digits, never computed. */
  protected isZero(amount: string): boolean {
    return ZERO.test(amount);
  }
}
