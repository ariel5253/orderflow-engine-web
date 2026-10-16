import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestRequest } from '@angular/common/http/testing';
import { page } from 'vitest/browser';
import {
  ORDER,
  PRODUCTS,
  QUOTE,
  STORES,
  backend,
  button,
  currentUrl,
  element,
  expectRequest,
  flushNoAnswer,
  flushOrder,
  flushProblem,
  idempotencyKeyOf,
  navigate,
  openApp,
  settle,
  texts,
} from '../../../testing/app-harness';
import { CartStore } from '../../core/cart-store';
import { Quote } from '../../core/quote-api';
import { StoreContext } from '../../core/store-context';

const OTHER_QUOTE: Quote = { ...QUOTE, quoteId: '2c9d4e1f-7a3b-4c5d-8e6f-0a1b2c3d4e5f' };

async function openQuote(quote: Quote = QUOTE): Promise<ComponentFixture<unknown>> {
  const fixture = await openApp(`/quotes/${quote.quoteId}`);
  expectRequest({ method: 'GET', url: `/api/v1/quotes/${quote.quoteId}` }).flush(quote);
  await settle(fixture);
  return fixture;
}

/** The one pending E-03: its body is the quote id only, and it carries an Idempotency-Key. */
function expectConfirmation(quoteId: string, idempotencyKey = 'any'): TestRequest {
  return expectRequest({ method: 'POST', url: '/api/v1/orders', body: { quoteId }, idempotencyKey });
}

function tapConfirm(fixture: ComponentFixture<unknown>): void {
  button(fixture, 'Confirmar pedido').click();
  TestBed.tick();
}

async function openOrder(fixture: ComponentFixture<unknown>): Promise<void> {
  await vi.waitFor(() => expect(currentUrl()).toBe(`/orders/${ORDER.orderId}`));
  TestBed.tick();
  expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
  await settle(fixture);
}

describe('confirmation and client idempotency (AC-49)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(768, 1024);
  });
  afterEach(() => backend().verify());

  it('sends one request for two taps, and keeps "Confirm order" disabled while it is in flight', async () => {
    const fixture = await openQuote();
    const confirm = button(fixture, 'Confirmar pedido');

    confirm.click();
    confirm.click();
    TestBed.tick();
    const request = expectConfirmation(QUOTE.quoteId);
    const inFlight = button(fixture, 'Confirmando…');
    expect(inFlight.disabled).toBe(true);
    expect(button(fixture, 'Modificar carrito').disabled).toBe(true);
    inFlight.click();
    TestBed.tick();
    backend().expectNone({ method: 'POST', url: '/api/v1/orders' });

    flushOrder(request);
    await openOrder(fixture);
  });

  it('sends the same key and body on every retry: no answer, a 5xx, a proxy 502 and IDEMPOTENCY_KEY_IN_PROGRESS', async () => {
    const fixture = await openQuote();
    tapConfirm(fixture);
    const first = expectConfirmation(QUOTE.quoteId);
    const key = idempotencyKeyOf(first);
    flushNoAnswer(first);
    await fixture.whenStable();
    expect(texts(fixture, 'ui-problem-notice button')).toEqual(['Reintentar']);

    button(fixture, 'Reintentar').click();
    TestBed.tick();
    flushProblem(expectConfirmation(QUOTE.quoteId, key), 'INTERNAL_ERROR', 500);
    await fixture.whenStable();

    button(fixture, 'Reintentar').click();
    TestBed.tick();
    expectConfirmation(QUOTE.quoteId, key).flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    button(fixture, 'Reintentar').click();
    TestBed.tick();
    flushProblem(expectConfirmation(QUOTE.quoteId, key), 'IDEMPOTENCY_KEY_IN_PROGRESS', 409);
    await fixture.whenStable();

    // "Confirm order" is enabled again after an answer, and it sends the same key too.
    tapConfirm(fixture);
    flushOrder(expectConfirmation(QUOTE.quoteId, key));
    await openOrder(fixture);
  });

  it('sends one request for two taps on "Retry", with the stored key', async () => {
    const fixture = await openQuote();
    tapConfirm(fixture);
    const first = expectConfirmation(QUOTE.quoteId);
    const key = idempotencyKeyOf(first);
    flushNoAnswer(first);
    await fixture.whenStable();

    const retry = button(fixture, 'Reintentar');
    retry.click();
    retry.click();
    TestBed.tick();
    const request = expectConfirmation(QUOTE.quoteId, key);
    expect(button(fixture, 'Confirmando…').disabled).toBe(true);

    flushOrder(request);
    await openOrder(fixture);
    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['Pedido confirmado']);
  });

  it('records the order and empties the cart of its store when the 201 comes after the store changed, and opens nothing', async () => {
    const fixture = await openQuote();
    const cartStore = TestBed.inject(CartStore);
    cartStore.replace(STORES[0], 'CREDIT', [{ sku: 'BEV-COLA-350', qty: 40 }]);
    cartStore.replace(STORES[2], 'CASH', [{ sku: 'BEV-WATER-600', qty: 6 }]);
    tapConfirm(fixture);
    const request = expectConfirmation(QUOTE.quoteId);

    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    button(fixture, STORES[2].name).click();
    TestBed.tick();
    await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
    TestBed.tick();
    expectRequest({ method: 'GET', url: '/api/v1/products', store: STORES[2] }).flush(PRODUCTS);
    await settle(fixture);

    flushOrder(request);
    await settle(fixture);
    expect(currentUrl()).toBe('/cart');
    expect(cartStore.cart().quantities).toEqual({ 'BEV-WATER-600': 6 });
    const stored = JSON.parse(localStorage.getItem('orderflow.carts') ?? '{}');
    expect(Object.keys(stored)).toEqual([`${STORES[2].tenantId}/${STORES[2].customerId}`]);

    // Back in the first store, the confirmed quote names the order it became.
    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    button(fixture, STORES[0].name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
    const { credit, ...withoutCredit } = QUOTE;
    expect(credit).toBeDefined();
    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush({ ...withoutCredit, status: 'CONFIRMED' });
    await settle(fixture);
    expect(texts(fixture, 'ui-notice button')).toEqual(['Ver pedido CO-000042']);
  });

  it('shows nothing, and throws nothing, when E-03 fails after the summary was left', async () => {
    const fixture = await openQuote();
    tapConfirm(fixture);
    const request = expectConfirmation(QUOTE.quoteId);

    await navigate('/cart');
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
    const errors: unknown[] = [];
    const record = (event: ErrorEvent): void => {
      errors.push(event.error);
    };
    window.addEventListener('error', record);
    try {
      flushNoAnswer(request);
      // An error thrown while the answer is handled reaches the window on a later task.
      await new Promise((resolve) => setTimeout(resolve));
    } finally {
      window.removeEventListener('error', record);
    }
    expect(errors).toEqual([]);
    await settle(fixture);
    expect(currentUrl()).toBe('/cart');
    expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
  });

  it('keeps the key across a reload, and gives a new quote its own key', async () => {
    const fixture = await openQuote();
    tapConfirm(fixture);
    const first = expectConfirmation(QUOTE.quoteId);
    const key = idempotencyKeyOf(first);
    flushNoAnswer(first);
    await fixture.whenStable();
    backend().verify();

    // A reload: the screen and every service start again; only browser storage remains.
    TestBed.resetTestingModule();
    const reloaded = await openQuote();
    tapConfirm(reloaded);
    const afterReload = expectConfirmation(QUOTE.quoteId, key);
    flushNoAnswer(afterReload);
    await reloaded.whenStable();

    await navigate(`/quotes/${OTHER_QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${OTHER_QUOTE.quoteId}` }).flush(OTHER_QUOTE);
    await settle(reloaded);
    expect(texts(reloaded, 'ui-problem-notice')).toEqual([]);
    tapConfirm(reloaded);
    const other = expectConfirmation(OTHER_QUOTE.quoteId);
    expect(idempotencyKeyOf(other)).not.toBe(key);
    flushNoAnswer(other);
    await reloaded.whenStable();

    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await settle(reloaded);
    tapConfirm(reloaded);
    flushNoAnswer(expectConfirmation(QUOTE.quoteId, key));
    await reloaded.whenStable();
  });

  it('opens the order with "Order confirmed" after a 201, and empties the cart of that store only', async () => {
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
    const cartStore = TestBed.inject(CartStore);
    cartStore.replace(STORES[0], 'CREDIT', [
      { sku: 'BEV-COLA-350', qty: 40 },
      { sku: 'SNK-CHIPS-45', qty: 10 },
    ]);
    cartStore.replace(STORES[1], 'CASH', [{ sku: 'BEV-WATER-600', qty: 6 }]);

    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await settle(fixture);
    tapConfirm(fixture);
    flushOrder(expectConfirmation(QUOTE.quoteId));
    await openOrder(fixture);

    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['Pedido confirmado']);
    expect(texts(fixture, 'ui-notice .notice__detail')).toEqual(['Tu número de pedido es CO-000042.']);
    expect(texts(fixture, 'h1')).toEqual(['Pedido CO-000042']);
    expect(cartStore.cart().quantities).toEqual({});
    const stored = JSON.parse(localStorage.getItem('orderflow.carts') ?? '{}');
    expect(Object.keys(stored)).toEqual([`${STORES[1].tenantId}/${STORES[1].customerId}`]);

    // The notice belongs to the answer: a later visit to the same order shows none.
    await navigate('/cart');
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
    expect(texts(fixture, '.action-bar__summary')).toEqual(['Agrega productos para cotizar']);
    await navigate(`/orders/${ORDER.orderId}`);
    expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('ui-notice')).toBeNull();
  });

  it('opens the order with "This order was already recorded" when the 201 is a replay', async () => {
    const fixture = await openQuote();
    TestBed.inject(CartStore).replace(TestBed.inject(StoreContext).current(), 'CREDIT', [{ sku: 'BEV-COLA-350', qty: 40 }]);
    tapConfirm(fixture);
    flushOrder(expectConfirmation(QUOTE.quoteId), ORDER, true);
    await openOrder(fixture);

    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['Este pedido ya estaba registrado']);
    expect(fixture.nativeElement.querySelector('ui-notice .notice').getAttribute('role')).toBe('status');
    expect(TestBed.inject(CartStore).cart().quantities).toEqual({});
  });

  it('sends a new key when browser storage was lost, and QUOTE_ALREADY_CONFIRMED opens the order it names', async () => {
    const fixture = await openQuote();
    tapConfirm(fixture);
    const first = expectConfirmation(QUOTE.quoteId);
    const lostKey = idempotencyKeyOf(first);
    flushNoAnswer(first);
    await fixture.whenStable();

    localStorage.clear();
    TestBed.resetTestingModule();
    const fresh = await openQuote();
    tapConfirm(fresh);
    const second = expectConfirmation(QUOTE.quoteId);
    expect(idempotencyKeyOf(second)).not.toBe(lostKey);
    flushProblem(second, 'QUOTE_ALREADY_CONFIRMED', 409, { orderNumber: ORDER.orderNumber, orderId: ORDER.orderId });
    await fresh.whenStable();

    expect(texts(fresh, 'ui-problem-notice button')).toEqual(['Ver pedido CO-000042']);
    button(fresh, 'Ver pedido CO-000042').click();
    await openOrder(fresh);
    expect(fresh.nativeElement.querySelector('ui-notice')).toBeNull();
  });

  it('shows a confirmed quote with its order when this client knows it, and with no action otherwise', async () => {
    const { credit, ...withoutCredit } = QUOTE;
    expect(credit).toBeDefined();
    const confirmed: Quote = { ...withoutCredit, status: 'CONFIRMED' };

    const fixture = await openQuote();
    tapConfirm(fixture);
    flushOrder(expectConfirmation(QUOTE.quoteId));
    await openOrder(fixture);

    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(confirmed);
    await settle(fixture);
    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['Esta cotización ya es un pedido']);
    expect(button(fixture, 'Confirmar pedido').disabled).toBe(true);
    button(fixture, 'Ver pedido CO-000042').click();
    await openOrder(fixture);

    localStorage.clear();
    TestBed.resetTestingModule();
    const unknown = await openApp(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(confirmed);
    await settle(unknown);
    expect(texts(unknown, 'ui-notice .notice__title')).toEqual(['Esta cotización ya es un pedido']);
    expect(unknown.nativeElement.querySelector('ui-notice button')).toBeNull();
    expect(button(unknown, 'Confirmar pedido').disabled).toBe(true);
  });

  it('offers "Quote again" on an expired quote, with the same lines and the payment method the client sent', async () => {
    const { credit, ...withoutCredit } = QUOTE;
    expect(credit).toBeDefined();
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
    await settle(fixture);
    TestBed.inject(CartStore).rememberQuote(QUOTE.quoteId, 'CREDIT');

    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush({ ...withoutCredit, status: 'EXPIRED' });
    await settle(fixture);
    expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['La cotización venció']);
    expect(button(fixture, 'Confirmar pedido').disabled).toBe(true);

    button(fixture, 'Volver a cotizar').click();
    TestBed.tick();
    const requote = expectRequest({
      method: 'POST',
      url: '/api/v1/quotes',
      body: { paymentMethod: 'CREDIT', lines: [{ sku: 'BEV-COLA-350', qty: 40 }, { sku: 'SNK-CHIPS-45', qty: 10 }] },
    });
    requote.flush(OTHER_QUOTE, { status: 201, statusText: 'Created' });
    await vi.waitFor(() => expect(currentUrl()).toBe(`/quotes/${OTHER_QUOTE.quoteId}`));
    TestBed.tick();
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${OTHER_QUOTE.quoteId}` }).flush(OTHER_QUOTE);
    await settle(fixture);
    expect(button(fixture, 'Confirmar pedido').disabled).toBe(false);
  });
});
