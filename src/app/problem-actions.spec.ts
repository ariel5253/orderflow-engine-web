import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestRequest } from '@angular/common/http/testing';
import { page, userEvent } from 'vitest/browser';
import {
  CORRELATION_ID,
  HISTORY,
  ORDER,
  PRODUCTS,
  QUOTE,
  backend,
  button,
  currentUrl,
  expectRequest,
  flushNoAnswer,
  flushProblem,
  flushQuote,
  historyUrl,
  openApp,
  settle,
  texts,
} from '../testing/app-harness';
import { textOutsideUiText } from '../testing/screen-checks';
import { CartStore } from './core/cart-store';
import { Quote, QuoteRequest } from './core/quote-api';

/** Every code of SPEC §8 with a status the API sends it with. REQUEST_NOT_SUPPORTED also comes as 405, 406 or 415. */
const CODES: readonly (readonly [code: string, status: number])[] = [
  ['VALIDATION_FAILED', 400],
  ['INVALID_QUANTITY', 400],
  ['CART_EMPTY', 400],
  ['TENANT_NOT_FOUND', 400],
  ['IDEMPOTENCY_KEY_MISSING', 400],
  ['IDEMPOTENCY_KEY_INVALID', 400],
  ['QUOTE_NOT_FOUND', 404],
  ['ORDER_NOT_FOUND', 404],
  ['CUSTOMER_NOT_FOUND', 404],
  ['REQUEST_NOT_SUPPORTED', 404],
  ['QUOTE_EXPIRED', 409],
  ['QUOTE_ALREADY_CONFIRMED', 409],
  ['CREDIT_LIMIT_EXCEEDED', 409],
  ['IDEMPOTENCY_KEY_IN_PROGRESS', 409],
  ['UNKNOWN_SKU', 422],
  ['CREDIT_NOT_ENABLED', 422],
  ['IDEMPOTENCY_KEY_REUSED', 422],
  ['INTERNAL_ERROR', 500],
];

const NO_ANSWER = 'no answer';
const CASES: readonly (readonly [code: string, status: number])[] = [...CODES, [NO_ANSWER, 0]];
const RETRYABLE = new Set(['IDEMPOTENCY_KEY_IN_PROGRESS', 'INTERNAL_ERROR', NO_ANSWER]);

const NEW_QUOTE: Quote = { ...QUOTE, quoteId: '4f3e2d1c-0b9a-4876-9543-210fedcba987' };
const QUOTE_LINES = [
  { sku: 'BEV-COLA-350', qty: 40 },
  { sku: 'SNK-CHIPS-45', qty: 10 },
];

function answer(request: TestRequest, code: string, status: number): void {
  if (code === NO_ANSWER) {
    flushNoAnswer(request);
  } else if (code === 'QUOTE_ALREADY_CONFIRMED') {
    flushProblem(request, code, status, { orderNumber: ORDER.orderNumber, orderId: ORDER.orderId });
  } else {
    flushProblem(request, code, status);
  }
}

/** The notice shows the API's text, the code and the reference, then exactly one way out. */
function expectNotice(fixture: ComponentFixture<unknown>, code: string, action: string): void {
  const expected =
    code === NO_ANSWER
      ? ['No pudimos comunicarnos con el servidor', 'Revisa tu conexión e inténtalo de nuevo.']
      : [`Título de ${code}`, `Detalle de ${code}`, `Código ${code} · Ref. ${CORRELATION_ID.slice(0, 8)}`];
  expect(texts(fixture, 'ui-problem-notice .notice__body > :not(button) ui-text')).toEqual(expected);
  expect(texts(fixture, 'ui-problem-notice button')).toEqual([action]);
  expect(textOutsideUiText(fixture.nativeElement)).toEqual([]);
}

/** Takes the notice's way out. */
function takeWayOut(fixture: ComponentFixture<unknown>): void {
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('ui-problem-notice button')!.click();
  TestBed.tick();
}

async function opensQuote(fixture: ComponentFixture<unknown>, request: QuoteRequest): Promise<void> {
  flushQuote(expectRequest({ method: 'POST', url: '/api/v1/quotes', body: request }), NEW_QUOTE);
  await vi.waitFor(() => expect(currentUrl()).toBe(`/quotes/${NEW_QUOTE.quoteId}`));
  TestBed.tick();
  expectRequest({ method: 'GET', url: `/api/v1/quotes/${NEW_QUOTE.quoteId}` }).flush(NEW_QUOTE);
  await settle(fixture);
}

function quantityInput(sku: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[data-sku="${sku}"]`)!;
}

describe('problem -> action (AC-51)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(375, 812);
  });
  afterEach(() => backend().verify());

  describe('cart: an E-01 problem', () => {
    const CREDIT_REQUEST: QuoteRequest = { paymentMethod: 'CREDIT', lines: QUOTE_LINES };

    async function failQuote(code: string, status: number): Promise<ComponentFixture<unknown>> {
      const fixture = await openApp('/cart');
      expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
      await settle(fixture);
      for (const line of QUOTE_LINES) {
        await userEvent.fill(quantityInput(line.sku), String(line.qty));
      }
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[value="CREDIT"]')!.click();
      TestBed.tick();
      button(fixture, 'Cotizar').click();
      TestBed.tick();
      answer(expectRequest({ method: 'POST', url: '/api/v1/quotes', body: CREDIT_REQUEST }), code, status);
      await settle(fixture);
      return fixture;
    }

    for (const [code, status] of CASES) {
      const action = RETRYABLE.has(code) ? 'Reintentar' : code === 'CREDIT_NOT_ENABLED' ? 'Pagar de contado' : 'Revisar carrito';

      it(`${code}: "${action}"`, async () => {
        const fixture = await failQuote(code, status);
        expect(currentUrl()).toBe('/cart');
        expectNotice(fixture, code, action);

        takeWayOut(fixture);
        if (action === 'Reintentar') {
          // The same request again.
          await opensQuote(fixture, CREDIT_REQUEST);
        } else if (action === 'Pagar de contado') {
          // The same lines with CASH, and the new quote opens.
          await opensQuote(fixture, { paymentMethod: 'CASH', lines: QUOTE_LINES });
          expect(TestBed.inject(CartStore).cart().paymentMethod).toBe('CASH');
        } else {
          // The notice closes and the cart stays as it was; nothing is sent.
          await settle(fixture);
          expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
          expect(quantityInput('BEV-COLA-350').value).toBe('40');
          expect(quantityInput('SNK-CHIPS-45').value).toBe('10');
          expect(TestBed.inject(CartStore).cart().paymentMethod).toBe('CREDIT');
        }
      });
    }

    it('E-07 with no answer: "Retry" reads the products again', async () => {
      const fixture = await openApp('/cart');
      flushNoAnswer(expectRequest({ method: 'GET', url: '/api/v1/products' }));
      await settle(fixture);
      expectNotice(fixture, NO_ANSWER, 'Reintentar');

      takeWayOut(fixture);
      expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
      expect(texts(fixture, '.product-card__name')).toHaveLength(4);
    });

    it('E-07 with CUSTOMER_NOT_FOUND (a stale store list): "Review cart" closes the notice', async () => {
      const fixture = await openApp('/cart');
      flushProblem(expectRequest({ method: 'GET', url: '/api/v1/products' }), 'CUSTOMER_NOT_FOUND', 404);
      await settle(fixture);
      expectNotice(fixture, 'CUSTOMER_NOT_FOUND', 'Revisar carrito');

      takeWayOut(fixture);
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
      expect(texts(fixture, '.page-loading')).toEqual([]);
    });
  });

  describe('summary: an E-03 problem', () => {
    async function failConfirmation(code: string, status: number): Promise<ComponentFixture<unknown>> {
      const fixture = await openApp(`/quotes/${QUOTE.quoteId}`);
      expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
      await settle(fixture);
      button(fixture, 'Confirmar pedido').click();
      TestBed.tick();
      answer(expectRequest({ method: 'POST', url: '/api/v1/orders', body: { quoteId: QUOTE.quoteId }, idempotencyKey: 'any' }), code, status);
      await settle(fixture);
      return fixture;
    }

    function wayOut(code: string): string {
      if (RETRYABLE.has(code)) {
        return 'Reintentar';
      }
      switch (code) {
        case 'QUOTE_EXPIRED':
          return 'Volver a cotizar';
        case 'CREDIT_LIMIT_EXCEEDED':
          return 'Pagar de contado';
        case 'QUOTE_ALREADY_CONFIRMED':
          return 'Ver pedido CO-000042';
        default:
          return 'Modificar carrito';
      }
    }

    for (const [code, status] of CASES) {
      const action = wayOut(code);

      it(`${code}: "${action}"`, async () => {
        const fixture = await failConfirmation(code, status);
        expectNotice(fixture, code, action);
        // The quote stays on screen under the notice.
        expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647\u00a0COP']);

        takeWayOut(fixture);
        switch (action) {
          case 'Reintentar': {
            const retry = expectRequest({ method: 'POST', url: '/api/v1/orders', body: { quoteId: QUOTE.quoteId }, idempotencyKey: 'any' });
            retry.flush(ORDER, { status: 201, statusText: 'Created' });
            await vi.waitFor(() => expect(currentUrl()).toBe(`/orders/${ORDER.orderId}`));
            TestBed.tick();
            expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
            break;
          }
          case 'Volver a cotizar':
            // The same lines with the same payment method: the quote has a credit position, so CREDIT.
            await opensQuote(fixture, { paymentMethod: 'CREDIT', lines: QUOTE_LINES });
            break;
          case 'Pagar de contado':
            await opensQuote(fixture, { paymentMethod: 'CASH', lines: QUOTE_LINES });
            break;
          case 'Ver pedido CO-000042':
            await vi.waitFor(() => expect(currentUrl()).toBe(`/orders/${ORDER.orderId}`));
            TestBed.tick();
            expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
            break;
          default:
            // The cart opens with the same lines.
            await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
            TestBed.tick();
            expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
            await settle(fixture);
            expect(quantityInput('BEV-COLA-350').value).toBe('40');
            expect(quantityInput('SNK-CHIPS-45').value).toBe('10');
            expect(quantityInput('BEV-WATER-600').value).toBe('0');
        }
        await settle(fixture);
      });
    }

    it('shows the problem of a failed re-quote on the cart, with the cart\'s way out', async () => {
      const fixture = await failConfirmation('QUOTE_EXPIRED', 409);
      takeWayOut(fixture);
      flushProblem(
        expectRequest({ method: 'POST', url: '/api/v1/quotes', body: { paymentMethod: 'CREDIT', lines: QUOTE_LINES } }),
        'CREDIT_NOT_ENABLED',
        422,
      );
      await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
      TestBed.tick();
      expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
      await settle(fixture);
      expectNotice(fixture, 'CREDIT_NOT_ENABLED', 'Pagar de contado');

      takeWayOut(fixture);
      await opensQuote(fixture, { paymentMethod: 'CASH', lines: QUOTE_LINES });
    });

    it('E-02 with no answer: "Retry" reads the quote again', async () => {
      const fixture = await openApp(`/quotes/${QUOTE.quoteId}`);
      flushNoAnswer(expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }));
      await settle(fixture);
      expectNotice(fixture, NO_ANSWER, 'Reintentar');
      takeWayOut(fixture);
      expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
    });
  });

  describe('order: an E-04 problem', () => {
    for (const [code, status] of CASES) {
      const action = RETRYABLE.has(code) ? 'Reintentar' : 'Ver mis pedidos';

      it(`${code}: "${action}"`, async () => {
        const fixture = await openApp(`/orders/${ORDER.orderId}`);
        answer(expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }), code, status);
        await settle(fixture);
        expectNotice(fixture, code, action);
        expect(fixture.nativeElement.querySelector('ui-action-bar')).toBeNull();

        takeWayOut(fixture);
        if (action === 'Reintentar') {
          // The same read again.
          expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
          await settle(fixture);
          expect(texts(fixture, 'h1')).toEqual(['Pedido CO-000042']);
        } else {
          // My orders opens, and reads E-05.
          await vi.waitFor(() => expect(currentUrl()).toBe('/orders'));
          TestBed.tick();
          expectRequest({ method: 'GET', url: historyUrl() }).flush(HISTORY);
          await settle(fixture);
          expect(texts(fixture, 'h1')).toEqual(['Mis pedidos']);
        }
      });
    }
  });

  describe('My orders: an E-05 problem', () => {
    for (const [code, status] of CASES) {
      const action = RETRYABLE.has(code) ? 'Reintentar' : 'Ir a comprar';

      it(`${code}: "${action}"`, async () => {
        const fixture = await openApp('/orders');
        answer(expectRequest({ method: 'GET', url: historyUrl() }), code, status);
        await settle(fixture);
        expectNotice(fixture, code, action);
        expect(fixture.nativeElement.querySelector('ui-action-bar')).toBeNull();

        takeWayOut(fixture);
        if (action === 'Reintentar') {
          // The same read again.
          expectRequest({ method: 'GET', url: historyUrl() }).flush(HISTORY);
          await settle(fixture);
          expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
          expect(texts(fixture, '.order-item__number')).toEqual(['CO-000042', 'CO-000041', 'CO-000040']);
        } else {
          // The cart opens.
          await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
          TestBed.tick();
          expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
          await settle(fixture);
          expect(texts(fixture, 'h1')).toEqual(['Comprar']);
        }
      });
    }

    it('a 4xx without a problem body (a misrouted proxy): the no-answer text with "Go shopping", never "Retry"', async () => {
      const fixture = await openApp('/orders');
      expectRequest({ method: 'GET', url: historyUrl() }).flush('<html>Not Found</html>', { status: 404, statusText: 'Not Found' });
      await settle(fixture);
      expectNotice(fixture, NO_ANSWER, 'Ir a comprar');

      takeWayOut(fixture);
      await vi.waitFor(() => expect(currentUrl()).toBe('/cart'));
      TestBed.tick();
      expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
      await settle(fixture);
    });
  });
});
