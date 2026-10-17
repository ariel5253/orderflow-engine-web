import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../testing/translations';
import { Language } from './language';
import { MoneyPipe, formatMoney, formatMoneyWithCode } from './money.pipe';

describe('money pipe', () => {
  const cases: readonly [locale: string, currency: string, amount: string, expected: string][] = [
    ['es-419', 'COP', '115647', '$115,647'],
    ['es-419', 'COP', '1500', '$1,500'],
    ['en', 'COP', '115647', '$115,647'],
    ['en', 'COP', '1500', '$1,500'],
    ['es-419', 'USD', '77.11', '$77.11'],
    ['es-419', 'USD', '0.60', '$0.60'],
    ['en', 'USD', '77.11', '$77.11'],
    ['en', 'USD', '0.60', '$0.60'],
    // Quetzales and soles at scale 2: the code is the only input, so no currency is named in the client (P-07).
    ['es-419', 'GTQ', '1234.50', 'Q\u00a01,234.50'],
    ['es-419', 'GTQ', '3.50', 'Q\u00a03.50'],
    ['en', 'GTQ', '1234.50', 'Q\u00a01,234.50'],
    ['es-419', 'PEN', '1234.50', 'PEN\u00a01,234.50'],
    ['es-419', 'PEN', '1.80', 'PEN\u00a01.80'],
    ['en', 'PEN', '1234.50', 'PEN\u00a01,234.50'],
  ];

  for (const [locale, currency, amount, expected] of cases) {
    it(`formats ${currency} "${amount}" in ${locale} at the scale of the string`, () => {
      expect(formatMoney(amount, currency, locale)).toBe(expected);
    });
  }

  it('formats "12345678901234567.89" exactly, which a double cannot hold', () => {
    const amount = '12345678901234567.89';
    expect(formatMoney(amount, 'USD', 'en')).toBe('$12,345,678,901,234,567.89');
    expect(formatMoney(amount, 'USD', 'es-419')).toBe('$12,345,678,901,234,567.89');
    // The same amount through a binary float loses its cents, which is why the pipe never converts.
    expect(String(Number(amount))).not.toBe(amount);
  });

  it('prints a discount as a negative amount without computing it', () => {
    expect(formatMoney('1500', 'COP', 'en', 'negative')).toBe('-$1,500');
    expect(formatMoney('0.34', 'USD', 'es-419', 'negative')).toBe('-$0.34');
  });

  it('rejects anything that is not a decimal string', () => {
    for (const amount of ['', '1e3', '12,50', ' 12', '12.', 'NaN']) {
      expect(() => formatMoney(amount, 'USD', 'en')).toThrowError(/decimal/);
    }
  });

  @Component({
    imports: [MoneyPipe],
    template: '<p>{{ amount | money: currency }}</p><p>{{ amount | money: currency : "negative" }}</p>',
  })
  class MoneyHost {
    amount = '115647';
    currency = 'COP';
  }

  async function render(language: Language, amount: string, currency: string): Promise<string[]> {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(language)] });
    const fixture = TestBed.createComponent(MoneyHost);
    fixture.componentInstance.amount = amount;
    fixture.componentInstance.currency = currency;
    await fixture.whenStable();
    return [...fixture.nativeElement.querySelectorAll('p')].map((p: HTMLElement) => p.textContent ?? '');
  }

  it('takes the formatting locale from the active dictionary (app.formatLocale), not from the language code', async () => {
    expect(await render('es', '1500', 'COP')).toEqual(['$1,500', '-$1,500']);
    // The bare language code would put the symbol after an ungrouped amount (SPEC §9).
    expect(formatMoney('1500', 'COP', 'es')).not.toBe('$1,500');
  });

  it('formats USD at scale 2 in Spanish', async () => {
    expect(await render('es', '77.11', 'USD')).toEqual(['$77.11', '-$77.11']);
  });

  it('formats COP at scale 0 in English too', async () => {
    expect(await render('en', '115647', 'COP')).toEqual(['$115,647', '-$115,647']);
  });
});

describe('money with its currency code (SPEC §10.3)', () => {
  const cases: readonly [locale: string, currency: string, amount: string, expected: string][] = [
    ['es-419', 'COP', '87534', '$87,534\u00a0COP'],
    ['en', 'USD', '77.11', '$77.11\u00a0USD'],
    ['es-419', 'GTQ', '25.00', 'Q\u00a025.00\u00a0GTQ'],
    // Intl writes PEN with its code, so the code is not repeated.
    ['es-419', 'PEN', '25.37', 'PEN\u00a025.37'],
    ['en', 'PEN', '25.37', 'PEN\u00a025.37'],
  ];

  for (const [locale, currency, amount, expected] of cases) {
    it(`names ${currency} once for "${amount}" in ${locale}`, () => {
      const text = formatMoneyWithCode(amount, currency, locale);
      expect(text).toBe(expected);
      expect(text.split(currency).length - 1).toBe(1);
    });
  }
});
