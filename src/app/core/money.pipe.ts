import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { activeFormatLocale } from './format';

export type Sign = 'positive' | 'negative';

const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Formats an API amount as it arrives: a decimal string at the currency's scale. The string goes to Intl as is, with
 * as many fraction digits as it carries, so no amount ever becomes a binary float and the client computes nothing.
 * A negative sign is written, not calculated.
 */
export function formatMoney(amount: string, currency: string, locale: string, sign: Sign = 'positive'): string {
  if (!DECIMAL.test(amount)) {
    throw new Error(`Not a decimal amount: "${amount}"`);
  }
  const scale = amount.split('.')[1]?.length ?? 0;
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  const value = sign === 'negative' ? `-${amount}` : amount;
  return format.format(value as Intl.StringNumericLiteral);
}

/** `{{ line.net | money: quote.currency }}`, in the locale of the active dictionary (app.formatLocale). */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(amount: string, currency: string, sign: Sign = 'positive'): string {
    return formatMoney(amount, currency, activeFormatLocale(this.translate), sign);
  }
}
