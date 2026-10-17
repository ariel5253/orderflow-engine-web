import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { originKey } from '../core/dictionary-keys';
import { CountPipe } from '../core/format';
import { MoneyPipe } from '../core/money.pipe';
import { Breakdown } from '../core/quote-api';
import { UiText } from '../ui/ui-text/ui-text';

/**
 * The totals of a breakdown (SPEC §8), the same for a quote and an order: the gross subtotal, the order-level
 * discounts with their origin, the gifts with their quantity, the taxable base, the taxes and the total.
 */
@Component({
  selector: 'app-breakdown-totals',
  imports: [UiText, TranslatePipe, MoneyPipe, CountPipe],
  templateUrl: './breakdown-totals.html',
  styleUrl: './breakdown-totals.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakdownTotals {
  readonly breakdown = input.required<Breakdown>();

  protected readonly originKey = originKey;

  /** The name of a gift in the totals, taken from its gift line. */
  protected giftName(breakdown: Breakdown, sku: string): string {
    return breakdown.lines.find((line) => line.isGift && line.sku === sku)?.description ?? sku;
  }
}
