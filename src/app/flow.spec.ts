import { ComponentFixture, TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import {
  HISTORY,
  ORDER,
  PRODUCTS,
  QUOTE,
  STORES,
  backend,
  button,
  currentUrl,
  expectRequest,
  flushOrder,
  flushQuote,
  historyUrl,
  idempotencyKeyOf,
  openApp,
  settle,
  texts,
} from '../testing/app-harness';
import { DICTIONARIES } from '../testing/translations';
import { CartStore, EMPTY_CART } from './core/cart-store';
import { IdempotencyKeys } from './core/idempotency-keys';
import { FORMAT_LOCALE_KEY, Language, SUPPORTED_LANGUAGES } from './core/language';
import { storeKey } from './core/store-context';

/** The lines of the fixture quote, as the cart sends them: SKU order, quantities above zero only. */
const QUOTE_LINES = [
  { sku: 'BEV-COLA-350', qty: 40 },
  { sku: 'SNK-CHIPS-45', qty: 10 },
];

/** The text a dictionary holds for a key, with its parameters filled in. */
function label(language: Language, key: string, params: Record<string, string> = {}): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], DICTIONARIES[language]);
  if (typeof value !== 'string') {
    throw new Error(`${language} has no text for ${key}`);
  }
  return Object.entries(params).reduce((text, [name, param]) => text.replaceAll(`{{${name}}}`, param), value);
}

function quantityInput(sku: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[data-sku="${sku}"]`)!;
}

async function arrive(fixture: ComponentFixture<unknown>, url: string): Promise<void> {
  await vi.waitFor(() => expect(currentUrl()).toBe(url));
  TestBed.tick();
}

describe('the whole flow, by clicks, on the simulated backend (AC-52)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(375, 812);
  });
  afterEach(() => backend().verify());

  for (const language of SUPPORTED_LANGUAGES) {
    it(`goes from the cart to a quote, a confirmed order and My orders, and empties the cart, in ${language}`, async () => {
      const text = (key: string, params?: Record<string, string>): string => label(language, key, params);
      const store = STORES[0];

      // Cart: E-07, then two products on credit.
      const fixture = await openApp('/', { language });
      await arrive(fixture, '/cart');
      expectRequest({ method: 'GET', url: '/api/v1/products', language }).flush(PRODUCTS);
      await settle(fixture);
      for (const line of QUOTE_LINES) {
        await userEvent.fill(quantityInput(line.sku), String(line.qty));
      }
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[value="CREDIT"]')!.click();
      TestBed.tick();
      expect(texts(fixture, '.action-bar__summary')).toEqual([text('cart.units.other', { count: '50' })]);

      // Quote: E-01 with the lines above zero, then E-02 at its route.
      button(fixture, text('cart.actions.quote')).click();
      TestBed.tick();
      flushQuote(
        expectRequest({ method: 'POST', url: '/api/v1/quotes', body: { paymentMethod: 'CREDIT', lines: QUOTE_LINES }, language }),
      );
      await arrive(fixture, `/quotes/${QUOTE.quoteId}`);
      expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}`, language }).flush(QUOTE);
      await settle(fixture);
      expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647']);

      // Confirm: E-03 with the quote id and a new key, then E-04 at the order's route.
      button(fixture, text('orderSummary.actions.confirm')).click();
      TestBed.tick();
      const confirmation = expectRequest({
        method: 'POST',
        url: '/api/v1/orders',
        body: { quoteId: QUOTE.quoteId },
        idempotencyKey: 'any',
        language,
      });
      expect(idempotencyKeyOf(confirmation)).toBe(TestBed.inject(IdempotencyKeys).keyFor(QUOTE.quoteId));
      flushOrder(confirmation);
      await arrive(fixture, `/orders/${ORDER.orderId}`);
      expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}`, language }).flush(ORDER);
      await settle(fixture);
      expect(texts(fixture, 'h1')).toEqual([text('order.title', { number: ORDER.orderNumber })]);
      expect(texts(fixture, 'ui-notice .notice__title')).toEqual([text('order.created.title')]);
      expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647']);

      // The 201 emptied the store's cart, in memory and in browser storage.
      expect(TestBed.inject(CartStore).cart()).toEqual(EMPTY_CART);
      expect(Object.keys(JSON.parse(localStorage.getItem('orderflow.carts') ?? '{}'))).not.toContain(storeKey(store));

      // My orders: E-05 for the store's customer, the new order first with the confirmed total.
      button(fixture, text('order.actions.history')).click();
      await arrive(fixture, '/orders');
      expectRequest({ method: 'GET', url: historyUrl(store), language }).flush(HISTORY);
      await settle(fixture);
      expect(texts(fixture, 'h1')).toEqual([text('history.title')]);
      expect(texts(fixture, '.order-item__number')[0]).toBe(ORDER.orderNumber);
      expect(texts(fixture, '.order-item__total')[0]).toBe('$115,647');
      // Its date in the locale the active dictionary names, so a screen that ignores the language fails in one of them.
      const dateFormat = new Intl.DateTimeFormat(text(FORMAT_LOCALE_KEY), { dateStyle: 'medium', timeStyle: 'short' });
      expect(texts(fixture, '.order-item__date')[0]).toBe(dateFormat.format(new Date(HISTORY.items[0].confirmedAt)));

      // Back to the cart: E-07 again, and nothing in it.
      button(fixture, text('history.actions.shop')).click();
      await arrive(fixture, '/cart');
      expectRequest({ method: 'GET', url: '/api/v1/products', language }).flush(PRODUCTS);
      await settle(fixture);
      expect(PRODUCTS.items.map((product) => quantityInput(product.sku).value)).toEqual(['0', '0', '0', '0']);
      expect(texts(fixture, '.action-bar__summary')).toEqual([text('cart.empty')]);
      expect(button(fixture, text('cart.actions.quote')).disabled).toBe(true);
    });
  }
});
