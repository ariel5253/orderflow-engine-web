import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import {
  QUOTE,
  backend,
  button,
  currentUrl,
  expectRequest,
  flushQuote,
  openApp,
  settle,
  texts,
} from '../../../testing/app-harness';
import { CartStore } from '../../core/cart-store';
import { Quote } from '../../core/quote-api';

const SHORT: Quote = { ...QUOTE, credit: { fits: false, available: '100000', shortfall: '15647' } };

/** The cash quote of the same lines: a new id and no credit position. */
const { credit: _credit, ...withoutCredit } = QUOTE;
const CASH_QUOTE: Quote = { ...withoutCredit, quoteId: '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a' };

async function openShortQuote(language: 'es' | 'en' = 'es') {
  const fixture = await openApp(`/quotes/${SHORT.quoteId}`, { language });
  expectRequest({ method: 'GET', url: `/api/v1/quotes/${SHORT.quoteId}`, language }).flush(SHORT);
  await settle(fixture);
  return fixture;
}

describe('credit shortfall (AC-50)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(768, 1024);
  });
  afterEach(() => backend().verify());

  it('disables "Confirm order" on an open credit quote that does not fit, shows the shortfall and offers "Pay cash"', async () => {
    const fixture = await openShortQuote();

    const confirm = button(fixture, 'Confirmar pedido');
    expect(confirm.disabled).toBe(true);
    confirm.click();
    TestBed.tick();
    backend().expectNone({ method: 'POST', url: '/api/v1/orders' });

    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['El pedido no cabe en tu cupo']);
    expect(texts(fixture, 'ui-notice .notice__detail')).toEqual(['Supera tu cupo disponible en $15,647. Puedes pagarlo de contado.']);
    expect(texts(fixture, 'ui-notice button')).toEqual(['Pagar de contado']);
    expect(texts(fixture, '.credit dd')).toEqual(['$100,000', '$15,647']);
    expect(texts(fixture, '.credit-status')).toEqual(['Te faltan $15,647 de cupo']);
  });

  it('"Pay cash" quotes the same lines with CASH, switches the cart to cash and opens the new quote', async () => {
    const fixture = await openShortQuote();

    button(fixture, 'Pagar de contado').click();
    TestBed.tick();
    // The paid lines of the quote, never its gift line: the engine adds the gift again.
    const requote = expectRequest({
      method: 'POST',
      url: '/api/v1/quotes',
      body: { paymentMethod: 'CASH', lines: [{ sku: 'BEV-COLA-350', qty: 40 }, { sku: 'SNK-CHIPS-45', qty: 10 }] },
    });
    expect(button(fixture, 'Pagar de contado').disabled).toBe(true);
    expect(TestBed.inject(CartStore).cart().paymentMethod).toBe('CASH');

    flushQuote(requote, CASH_QUOTE);
    await vi.waitFor(() => expect(currentUrl()).toBe(`/quotes/${CASH_QUOTE.quoteId}`));
    TestBed.tick();
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${CASH_QUOTE.quoteId}` }).flush(CASH_QUOTE);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('ui-notice')).toBeNull();
    expect(fixture.nativeElement.querySelector('.credit')).toBeNull();
    expect(button(fixture, 'Confirmar pedido').disabled).toBe(false);
    expect(TestBed.inject(CartStore).paymentMethodOf(CASH_QUOTE.quoteId)).toBe('CASH');
  });

  it('keeps "Confirm order" enabled when the credit covers the quote, and when the quote is cash', async () => {
    const fits = await openApp(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await settle(fits);
    expect(button(fits, 'Confirmar pedido').disabled).toBe(false);
    expect(fits.nativeElement.querySelector('ui-notice')).toBeNull();
    backend().verify();
    TestBed.resetTestingModule();

    const cash = await openApp(`/quotes/${CASH_QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${CASH_QUOTE.quoteId}` }).flush(CASH_QUOTE);
    await settle(cash);
    expect(button(cash, 'Confirmar pedido').disabled).toBe(false);
    expect(cash.nativeElement.querySelector('ui-notice')).toBeNull();
  });

  it('says it in English too', async () => {
    const fixture = await openShortQuote('en');
    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['The order does not fit your credit']);
    expect(texts(fixture, 'ui-notice button')).toEqual(['Pay cash']);
    expect(button(fixture, 'Confirm order').disabled).toBe(true);
  });
});
