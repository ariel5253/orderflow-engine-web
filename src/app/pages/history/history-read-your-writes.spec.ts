import { ComponentFixture, TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import {
  HISTORY,
  ORDER,
  PRODUCTS,
  QUOTE,
  STORES,
  backend,
  button,
  currentUrl,
  element,
  expectRequest,
  flushOrder,
  flushProblem,
  historyUrl,
  navigate,
  openApp,
  settle,
  texts,
} from '../../../testing/app-harness';
import { formatMoney } from '../../core/money.pipe';
import { OrderHistory } from '../../core/order-api';
import { Store } from '../../core/store-context';

/** The ec-alpha history: dollars at scale 2, trailing zeros kept. */
const EC_HISTORY: OrderHistory = {
  currency: 'USD',
  items: [
    { orderId: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e', orderNumber: 'EC-000007', confirmedAt: '2026-10-15T18:20:00Z', total: '77.11' },
    { orderId: '6e7f8091-a2b3-4c4d-9e5f-6a7b8c9d0e1f', orderNumber: 'EC-000006', confirmedAt: '2026-10-12T11:05:00Z', total: '0.60' },
  ],
};

/** A store list that outlived its customer: the API no longer knows it. */
const STALE_STORE: Store = { tenantId: 'co-alpha', customerId: '01a13cdb-cc00-7001-8001-0000000000ff', name: 'Tienda Cerrada' };

/** The confirmation time as the screen writes it: Intl in the dictionary's locale and the browser's time zone. */
function dateOf(instant: string): string {
  return new Intl.DateTimeFormat('es-419', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant));
}

function numbers(fixture: ComponentFixture<unknown>): string[] {
  return texts(fixture, '.order-item__number');
}

function totals(fixture: ComponentFixture<unknown>): string[] {
  return texts(fixture, '.order-item__total');
}

/** Opens My orders from the navigation, as a user does. */
async function openFromNavigation(fixture: ComponentFixture<unknown>): Promise<void> {
  button(fixture, 'Mis pedidos').click();
  await vi.waitFor(() => expect(currentUrl()).toBe('/orders'));
  TestBed.tick();
}

describe('My orders reads its writes (AC-52)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(768, 1024);
  });
  afterEach(() => backend().verify());

  it('reads E-05 on every visit, for the customer of the selected store', async () => {
    const fixture = await openApp('/orders');
    expectRequest({ method: 'GET', url: historyUrl() }).flush(HISTORY);
    await settle(fixture);
    expect(texts(fixture, 'h1')).toEqual(['Mis pedidos']);
    expect(numbers(fixture)).toEqual(['CO-000042', 'CO-000041', 'CO-000040']);

    // Away and back: the screen reads E-05 again and shows only what it answers, never a copy.
    button(fixture, 'Ir a comprar').click();
    await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
    TestBed.tick();
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
    await openFromNavigation(fixture);
    expectRequest({ method: 'GET', url: historyUrl() }).flush({ ...HISTORY, items: HISTORY.items.slice(1) });
    await settle(fixture);
    expect(numbers(fixture)).toEqual(['CO-000041', 'CO-000040']);

    // Another store: its customer, in the query and in both headers.
    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    button(fixture, STORES[2].name).click();
    await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
    TestBed.tick();
    expectRequest({ method: 'GET', url: '/api/v1/products', store: STORES[2] }).flush(PRODUCTS);
    await settle(fixture);
    await openFromNavigation(fixture);
    expectRequest({ method: 'GET', url: historyUrl(STORES[2]), store: STORES[2] }).flush(EC_HISTORY);
    await settle(fixture);
    expect(numbers(fixture)).toEqual(['EC-000007', 'EC-000006']);
  });

  it('lists the orders newest first, as sent, each with its number, its date and its total, and opens each one', async () => {
    const fixture = await openApp('/orders');
    expectRequest({ method: 'GET', url: historyUrl() }).flush(HISTORY);
    await settle(fixture);

    expect(texts(fixture, '.page-subtitle')).toEqual(['Del más reciente al más antiguo']);
    expect(numbers(fixture)).toEqual(['CO-000042', 'CO-000041', 'CO-000040']);
    expect(texts(fixture, '.order-item__date')).toEqual(HISTORY.items.map((item) => dateOf(item.confirmedAt)));
    expect(totals(fixture)).toEqual(['$115,647\u00a0COP', '$71,103\u00a0COP', '$11,529\u00a0COP']);
    const links = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a.order-item'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(HISTORY.items.map((item) => `/orders/${item.orderId}`));

    links[1].click();
    await vi.waitFor(() => expect(currentUrl()).toBe(`/orders/${HISTORY.items[1].orderId}`));
    TestBed.tick();
    expectRequest({ method: 'GET', url: `/api/v1/orders/${HISTORY.items[1].orderId}` }).flush({
      ...ORDER,
      orderId: HISTORY.items[1].orderId,
      orderNumber: HISTORY.items[1].orderNumber,
    });
    await settle(fixture);
    expect(texts(fixture, 'h1')).toEqual(['Pedido CO-000041']);
  });

  it('writes every total in the currency the body names once, at the scale of its string', async () => {
    const fixture = await openApp('/orders', { stores: [STORES[2]] });
    expectRequest({ method: 'GET', url: historyUrl(STORES[2]), store: STORES[2] }).flush(EC_HISTORY);
    await settle(fixture);
    expect(totals(fixture)).toEqual(['$77.11\u00a0USD', '$0.60\u00a0USD']);

    // A currency whose symbol is neither the peso's nor the dollar's: the client can take it only from the body.
    await navigate('/cart');
    expectRequest({ method: 'GET', url: '/api/v1/products', store: STORES[2] }).flush(PRODUCTS);
    await settle(fixture);
    await navigate('/orders');
    expectRequest({ method: 'GET', url: historyUrl(STORES[2]), store: STORES[2] }).flush({ ...EC_HISTORY, currency: 'EUR' });
    await settle(fixture);
    expect(totals(fixture)).toEqual(EC_HISTORY.items.map((item) => `${formatMoney(item.total, 'EUR', 'es-419')}\u00a0EUR`));
    expect(totals(fixture).every((total) => total.includes('€'))).toBe(true);
  });

  it('after a 201, shows the new order number first, with the confirmed total', async () => {
    const fixture = await openApp('/orders');
    expectRequest({ method: 'GET', url: historyUrl() }).flush({ ...HISTORY, items: HISTORY.items.slice(1) });
    await settle(fixture);
    expect(numbers(fixture)).toEqual(['CO-000041', 'CO-000040']);

    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await settle(fixture);
    button(fixture, 'Confirmar pedido').click();
    TestBed.tick();
    flushOrder(expectRequest({ method: 'POST', url: '/api/v1/orders', body: { quoteId: QUOTE.quoteId }, idempotencyKey: 'any' }));
    await vi.waitFor(() => expect(currentUrl()).toBe(`/orders/${ORDER.orderId}`));
    TestBed.tick();
    expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
    await settle(fixture);
    const confirmedTotal = texts(fixture, '.action-bar__total-value');
    expect(confirmedTotal).toEqual(['$115,647\u00a0COP']);

    button(fixture, 'Ver mis pedidos').click();
    await vi.waitFor(() => expect(currentUrl()).toBe('/orders'));
    TestBed.tick();
    expectRequest({ method: 'GET', url: historyUrl() }).flush(HISTORY);
    await settle(fixture);
    expect(numbers(fixture)).toEqual([ORDER.orderNumber, 'CO-000041', 'CO-000040']);
    expect(totals(fixture)[0]).toBe(confirmedTotal[0]);
  });

  it('shows the empty state, with "Go shopping"', async () => {
    const fixture = await openApp('/orders');
    expectRequest({ method: 'GET', url: historyUrl() }).flush({ currency: 'COP', items: [] });
    await settle(fixture);

    expect(texts(fixture, '.empty-state')).toEqual(['Aún no tienes pedidos Cuando confirmes un pedido, aparecerá aquí.']);
    expect(fixture.nativeElement.querySelectorAll('.order-item')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();

    button(fixture, 'Ir a comprar').click();
    await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
    TestBed.tick();
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
  });

  it('shows CUSTOMER_NOT_FOUND for a customer the API does not know (a stale store list), with "Go shopping"', async () => {
    const fixture = await openApp('/orders', { stores: [STALE_STORE, ...STORES] });
    flushProblem(expectRequest({ method: 'GET', url: historyUrl(STALE_STORE), store: STALE_STORE }), 'CUSTOMER_NOT_FOUND', 404);
    await settle(fixture);

    expect(texts(fixture, 'ui-problem-notice .notice__title')).toEqual(['Título de CUSTOMER_NOT_FOUND']);
    expect(texts(fixture, 'ui-problem-notice .notice__meta')).toEqual(['Código CUSTOMER_NOT_FOUND · Ref. 5b1e9c7a']);
    expect(texts(fixture, 'ui-problem-notice button')).toEqual(['Ir a comprar']);
    expect(fixture.nativeElement.querySelectorAll('.order-item, .empty-state')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('ui-action-bar')).toBeNull();

    button(fixture, 'Ir a comprar').click();
    await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
    TestBed.tick();
    flushProblem(expectRequest({ method: 'GET', url: '/api/v1/products', store: STALE_STORE }), 'CUSTOMER_NOT_FOUND', 404);
    await settle(fixture);
    expect(texts(fixture, 'ui-problem-notice button')).toEqual(['Revisar carrito']);
  });
});
