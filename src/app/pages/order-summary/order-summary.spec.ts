import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { page } from 'vitest/browser';
import stores from '../../../../public/config/stores.json';
import longNames from '../../../testing/long-names.json';
import fixtureBody from '../../../testing/order-summary.fixture.json';
import {
  actionBarGap,
  actionBarObstructions,
  clippedUiText,
  horizontalOverflow,
  productImageBoxes,
  splitAmounts,
  textOutsideUiText,
  truncatingElements,
} from '../../../testing/screen-checks';
import { provideTestTranslations } from '../../../testing/translations';
import { routes } from '../../app.routes';
import { apiHeadersInterceptor } from '../../core/api-headers.interceptor';
import { Language } from '../../core/language';
import { Quote } from '../../core/quote-api';
import { StoreContext } from '../../core/store-context';
import { OrderSummaryPage } from './order-summary';

const QUOTE: Quote = fixtureBody as Quote;
const QUOTE_PATH = `/api/v1/quotes/${QUOTE.quoteId}`;
const LONG_NAMES: Readonly<Record<string, string>> = longNames;

/** The E-02 fixture with every product description replaced by a very long one (AC-42). */
function withLongNames(quote: Quote): Quote {
  return { ...quote, lines: quote.lines.map((line) => ({ ...line, description: LONG_NAMES[line.sku] ?? line.description })) };
}

async function open(language: Language = 'es'): Promise<ComponentFixture<OrderSummaryPage>> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiHeadersInterceptor])),
      provideHttpClientTesting(),
      provideTestTranslations(language),
      provideRouter(routes, withComponentInputBinding()),
    ],
  });
  TestBed.inject(StoreContext).load(stores);
  const fixture = TestBed.createComponent(OrderSummaryPage);
  fixture.componentRef.setInput('quoteId', QUOTE.quoteId);
  // Not whenStable: the pending request keeps the screen unstable until the simulated backend answers.
  TestBed.tick();
  return fixture;
}

/** The exact E-02 request: method, path, headers and body. */
function expectQuoteRequest(language: Language = 'es'): TestRequest {
  const request = TestBed.inject(HttpTestingController).expectOne(QUOTE_PATH);
  expect(request.request.method).toBe('GET');
  expect(request.request.body).toBeNull();
  expect(request.request.headers.get('X-Tenant-Id')).toBe('co-alpha');
  expect(request.request.headers.get('X-Customer-Id')).toBe('01a13cdb-cc00-7001-8001-000000000001');
  expect(request.request.headers.get('Accept-Language')).toBe(language);
  return request;
}

async function settle(fixture: ComponentFixture<OrderSummaryPage>): Promise<void> {
  await fixture.whenStable();
  await vi.waitFor(() => {
    for (const img of Array.from<HTMLImageElement>(fixture.nativeElement.querySelectorAll('img'))) {
      expect(img.complete && img.naturalWidth > 0, img.src).toBe(true);
    }
  });
  window.scrollTo(0, 0);
}

/** The text of each match: its ui-text parts joined by one space. */
function texts(fixture: ComponentFixture<OrderSummaryPage>, selector: string): string[] {
  return Array.from<Element>(fixture.nativeElement.querySelectorAll(selector)).map((node) => {
    const parts = node.matches('ui-text') ? [node] : Array.from(node.querySelectorAll('ui-text'));
    return parts.map((part) => part.textContent?.trim() ?? '').join(' ');
  });
}

const VIEWPORTS: readonly [width: number, height: number][] = [
  [768, 1024],
  [375, 812],
];

describe('order summary (/quotes/:quoteId)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  for (const [width, height] of VIEWPORTS) {
    it(`keeps every long name whole and every control reachable at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await open();
      expectQuoteRequest().flush(withLongNames(QUOTE));
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(window.innerWidth).toBe(width);
      expect(texts(fixture, '.line__name')).toEqual(QUOTE.lines.map((line) => LONG_NAMES[line.sku]));
      expect(horizontalOverflow()).toBeLessThanOrEqual(0);
      expect(clippedUiText(root)).toEqual([]);
      expect(truncatingElements(root)).toEqual([]);
      expect(textOutsideUiText(root)).toEqual([]);
      expect(splitAmounts(root)).toEqual([]);
      expect(root.querySelectorAll('ui-text.amount').length).toBeGreaterThan(20);
      expect(actionBarGap(root)).toBeLessThanOrEqual(0.5);
      expect(actionBarObstructions(root)).toEqual([]);

      const images = productImageBoxes(root);
      expect(images).toHaveLength(QUOTE.lines.length);
      for (const image of images) {
        expect(image.width).toBeGreaterThan(0);
        expect(image).toEqual(images[0]);
        expect(image.height).toBe(image.width);
      }
    });
  }

  it('shows the breakdown of E-02: lines, discounts with their origin, gifts with their quantity, taxes and total', async () => {
    await page.viewport(768, 1024);
    const fixture = await open();
    expectQuoteRequest().flush(QUOTE);
    await settle(fixture);

    expect(texts(fixture, 'h1')).toEqual(['Resumen del pedido']);
    expect(texts(fixture, '.chip--status')).toEqual(['Abierta']);
    expect(texts(fixture, '.card__subtitle')).toEqual(['3 líneas', 'Valores en COP']);
    expect(texts(fixture, '.line__name')).toEqual(['Cola 350 ml', 'Chips 45 g', 'Water 600 ml']);
    expect(texts(fixture, '.line__qty')).toEqual(['40 × $2,500', '10 × $1,800']);
    expect(texts(fixture, '.line__headline-value')).toEqual(['$85,265', '$13,235', 'Sin costo']);
    expect(texts(fixture, '.chip--gift')).toEqual(['Obsequio × 1']);

    // Order-level discounts in the order the API sends them, each with its kind and its raw origin.
    expect(texts(fixture, '.totals__discounts dt')).toEqual([
      'Combo COMBO:01a13cdb-cc00-7001-8004-000000000001',
      'Descuento por volumen TIER:01a13cdb-cc00-7001-8003-000000000001',
    ]);
    expect(texts(fixture, '.totals__discounts dd')).toEqual(['-$18,000', '-$1,500']);
    expect(texts(fixture, '.totals__gifts dt')).toEqual(['Water 600 ml × 1 GIFT:01a13cdb-cc00-7001-8005-000000000001']);
    expect(texts(fixture, '.totals__summary dd')).toEqual(['$118,000', '$100,000', '$17,147']);
    expect(texts(fixture, '.totals__grand dd')).toEqual(['$115,647']);
    expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647']);

    // A combo allocation only explains a line's base; it is never shown as a discount (A-07).
    expect(texts(fixture, 'dd.is-share')).toEqual(['-$13,235', '-$4,765']);
    expect(texts(fixture, 'dt.is-tax')).toEqual(['Impuesto (19%)', 'Impuesto (5%)', 'Impuesto (19%)']);
    expect(texts(fixture, '.line__note')).toEqual(['El impuesto del obsequio lo paga el cliente']);
    expect(texts(fixture, '.credit dd')).toEqual(['$500,000']);
    expect(texts(fixture, '.credit-status')).toEqual(['El pedido cabe en tu cupo']);
  });

  it('shows a credit shortfall, and no credit card once the quote is no longer open', async () => {
    await page.viewport(768, 1024);
    const short = await open();
    expectQuoteRequest().flush({ ...QUOTE, credit: { fits: false, available: '100000', shortfall: '15647' } });
    await settle(short);
    expect(texts(short, '.credit dd')).toEqual(['$100,000', '$15,647']);
    expect(texts(short, '.credit-status')).toEqual(['Te faltan $15,647 de cupo']);
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();

    const expired = await open();
    const { credit, ...withoutCredit } = QUOTE;
    expect(credit).toBeDefined();
    expectQuoteRequest().flush({ ...withoutCredit, status: 'EXPIRED' });
    await settle(expired);
    expect(texts(expired, '.chip--status')).toEqual(['Vencida']);
    expect(expired.nativeElement.querySelector('.credit')).toBeNull();
  });

  it('renders in English with the same rules', async () => {
    await page.viewport(375, 812);
    const fixture = await open('en');
    expectQuoteRequest('en').flush(withLongNames({ ...QUOTE, currency: 'USD', totals: { ...QUOTE.totals, total: '77.11' } }));
    await settle(fixture);
    const root: HTMLElement = fixture.nativeElement;

    expect(texts(fixture, 'h1')).toEqual(['Order summary']);
    expect(texts(fixture, '.action-bar__total-value')).toEqual(['$77.11']);
    expect(textOutsideUiText(root)).toEqual([]);
    expect(clippedUiText(root)).toEqual([]);
    expect(horizontalOverflow()).toBeLessThanOrEqual(0);
  });

  it('shows the problem the API sends, with "Edit cart" as its way out', async () => {
    await page.viewport(375, 812);
    const fixture = await open();
    expectQuoteRequest().flush(
      {
        type: 'https://orderflow-engine.example/problems/quote-not-found',
        title: 'Cotización no encontrada',
        detail: 'No existe una cotización con ese identificador para este cliente.',
        status: 404,
        instance: QUOTE_PATH,
        code: 'QUOTE_NOT_FOUND',
        correlationId: '0f3a9d2e-55aa-4b6c-8d7e-9f0a1b2c3d4e',
      },
      { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'application/problem+json' } },
    );
    await fixture.whenStable();

    expect(texts(fixture, 'ui-problem-notice ui-text')).toEqual([
      'Cotización no encontrada',
      'No existe una cotización con ese identificador para este cliente.',
      'Código QUOTE_NOT_FOUND · Ref. 0f3a9d2e',
      'Modificar carrito',
    ]);
    expect(fixture.nativeElement.querySelector('ui-action-bar')).toBeNull();
    expect(textOutsideUiText(fixture.nativeElement)).toEqual([]);

    fixture.nativeElement.querySelector('ui-problem-notice button').click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/cart'));
  });

  it('retries the same request after no answer, then renders the quote', async () => {
    await page.viewport(375, 812);
    const fixture = await open();
    expectQuoteRequest().error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();

    expect(texts(fixture, 'ui-problem-notice ui-text')).toEqual([
      'No pudimos comunicarnos con el servidor',
      'Revisa tu conexión e inténtalo de nuevo.',
      'Reintentar',
    ]);
    const retry: HTMLButtonElement = fixture.nativeElement.querySelector('ui-problem-notice button');
    const target = retry.getBoundingClientRect();
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    retry.click();
    TestBed.tick();

    expectQuoteRequest().flush(QUOTE);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
    expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647']);
  });

  it('offers Retry for INTERNAL_ERROR, and treats a 502 without a problem body as no answer', async () => {
    await page.viewport(375, 812);
    const fixture = await open();
    expectQuoteRequest().flush(
      {
        title: 'Error interno',
        detail: 'Ocurrió un error inesperado.',
        status: 500,
        code: 'INTERNAL_ERROR',
        correlationId: 'a1b2c3d4-0000-4000-8000-000000000000',
      },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await fixture.whenStable();
    expect(texts(fixture, 'ui-problem-notice button')).toEqual(['Reintentar']);

    fixture.nativeElement.querySelector('ui-problem-notice button').click();
    TestBed.tick();
    expectQuoteRequest().flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(texts(fixture, 'ui-problem-notice .notice__title')).toEqual(['No pudimos comunicarnos con el servidor']);
    expect(texts(fixture, 'ui-problem-notice button')).toEqual(['Reintentar']);
  });

  it('offers no Retry for a 4xx answer without a problem body, such as a misrouted proxy page, but "Edit cart"', async () => {
    await page.viewport(375, 812);
    const fixture = await open();
    expectQuoteRequest().flush('<html>Not Found</html>', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(texts(fixture, 'ui-problem-notice .notice__title')).toEqual(['No pudimos comunicarnos con el servidor']);
    expect(texts(fixture, 'ui-problem-notice button')).toEqual(['Modificar carrito']);
  });

  it('counts one line in the singular and several in the plural, in both languages', async () => {
    await page.viewport(768, 1024);
    const [onlyLine] = QUOTE.lines;
    const single = await open();
    expectQuoteRequest().flush({ ...QUOTE, lines: [onlyLine] });
    await settle(single);
    expect(texts(single, '.card__subtitle')[0]).toBe('1 línea');
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();

    const several = await open('en');
    expectQuoteRequest('en').flush(QUOTE);
    await settle(several);
    expect(texts(several, '.card__subtitle')[0]).toBe('3 lines');
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();

    const singleEnglish = await open('en');
    expectQuoteRequest('en').flush({ ...QUOTE, lines: [onlyLine] });
    await settle(singleEnglish);
    expect(texts(singleEnglish, '.card__subtitle')[0]).toBe('1 line');
  });
});
