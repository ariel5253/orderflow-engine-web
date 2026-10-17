import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { lineCountKey, originKey } from '../core/dictionary-keys';
import { CountPipe, RatePipe, activeFormatLocale } from '../core/format';
import { MoneyPipe } from '../core/money.pipe';
import { Breakdown } from '../core/quote-api';
import { UiProductImage } from '../ui/ui-product-image/ui-product-image';
import { UiText } from '../ui/ui-text/ui-text';

const ZERO = /^0+(\.0+)?$/;

/**
 * The lines of a breakdown (SPEC §8), the same for a quote and an order: each line with its image, its quantity and
 * unit price, its gross, its discounts with their origin, its share of a combo, its taxable base and its tax; a gift
 * line with its quantity, its origin and its reference value. Amounts are shown as the API sends them.
 */
@Component({
  selector: 'app-breakdown-lines',
  imports: [UiText, UiProductImage, TranslatePipe, MoneyPipe, RatePipe, CountPipe],
  templateUrl: './breakdown-lines.html',
  styleUrl: './breakdown-lines.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakdownLines {
  readonly breakdown = input.required<Breakdown>();

  private readonly translate = inject(TranslateService);

  protected readonly originKey = originKey;

  protected linesKey(count: number): string {
    return lineCountKey(count, activeFormatLocale(this.translate));
  }

  /** A combo allocation names its combo the way the order-level discount does, so the two can be matched. */
  protected comboOrigin(comboId: string): string {
    return `COMBO:${comboId}`;
  }

  /** Whether an amount string is zero, read from its digits, never computed. */
  protected isZero(amount: string): boolean {
    return ZERO.test(amount);
  }
}
