import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import stores from '../../public/config/stores.json';
import { App } from '../app/app';
import { routes } from '../app/app.routes';
import { apiHeadersInterceptor } from '../app/core/api-headers.interceptor';
import { Language } from '../app/core/language';
import { Order, OrderHistory } from '../app/core/order-api';
import { ProductList } from '../app/core/product-api';
import { Quote } from '../app/core/quote-api';
import { Store, StoreContext } from '../app/core/store-context';
import { VISUAL_VIEWPORT, VisualViewportPort } from '../app/ui/ui-action-bar/ui-action-bar';
import quoteBody from './order-summary.fixture.json';
import productsBody from './products.fixture.json';
import { provideTestTranslations } from './translations';

/*
 * The whole client, shell and routes, on a simulated backend: every spec that reaches the API answers through
 * HttpTestingController and asserts the exact request (method, path, headers and body). No spec opens a socket.
 */

export const STORES: readonly Store[] = stores;
export const PRODUCTS: ProductList = productsBody;
export const QUOTE: Quote = quoteBody as Quote;

/** The E-04 body of the order the fixture quote became: the quote's lines and totals (BD-04). */
export const ORDER: Order = {
  orderId: 'c0a80f2e-6b1d-4c3e-9f7a-2d5e8b1c4a90',
  orderNumber: 'CO-000042',
  status: 'CONFIRMED',
  quoteId: QUOTE.quoteId,
  confirmedAt: '2026-10-15T20:03:12Z',
  currency: QUOTE.currency,
  lines: QUOTE.lines,
  totals: QUOTE.totals,
  paymentMethod: 'CREDIT',
};

/** An E-05 body, newest first: the fixture order, then two older ones of the same customer. */
export const HISTORY: OrderHistory = {
  currency: 'COP',
  items: [
    { orderId: ORDER.orderId, orderNumber: ORDER.orderNumber, confirmedAt: ORDER.confirmedAt, total: ORDER.totals.total },
    { orderId: '9b2e7c4d-3f1a-4e8b-a6c5-1d0f2e3a4b5c', orderNumber: 'CO-000041', confirmedAt: '2026-10-14T15:03:12Z', total: '71103' },
    { orderId: '3a4b5c6d-7e8f-4a1b-9c2d-e3f4a5b6c7d8', orderNumber: 'CO-000040', confirmedAt: '2026-10-13T09:30:00Z', total: '11529' },
  ],
};

/** The E-05 path for a store: its own customer, the same one its X-Customer-Id names. */
export function historyUrl(store: Store = STORES[0]): string {
  return `/api/v1/orders?customerId=${store.customerId}`;
}

export interface AppOptions {
  readonly language?: Language;
  readonly stores?: readonly Store[];
  readonly visualViewport?: VisualViewportPort;
}

/** Configures the client, then opens it at a route. Browser storage is the spec's to clear. */
export async function openApp(url: string, options: AppOptions = {}): Promise<ComponentFixture<App>> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiHeadersInterceptor])),
      provideHttpClientTesting(),
      provideTestTranslations(options.language ?? 'es'),
      provideRouter(routes, withComponentInputBinding()),
      ...(options.visualViewport ? [{ provide: VISUAL_VIEWPORT, useValue: options.visualViewport }] : []),
    ],
  });
  TestBed.inject(StoreContext).load(options.stores ?? STORES);
  const fixture = TestBed.createComponent(App);
  await navigate(url);
  return fixture;
}

export async function navigate(url: string): Promise<void> {
  await TestBed.inject(Router).navigateByUrl(url);
  TestBed.tick();
}

export function currentUrl(): string {
  return TestBed.inject(Router).url;
}

export function backend(): HttpTestingController {
  return TestBed.inject(HttpTestingController);
}

export interface ExpectedRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly body?: unknown;
  /** The Idempotency-Key the request must carry, or 'any' for one not known in advance. */
  readonly idempotencyKey?: string;
  readonly store?: Store;
  readonly language?: Language;
}

/** The one pending request to this method and path, with exactly the headers and body expected. */
export function expectRequest(expected: ExpectedRequest): TestRequest {
  const request = backend().expectOne({ method: expected.method, url: expected.url }, `${expected.method} ${expected.url}`);
  const store = expected.store ?? STORES[0];
  const headers = ['Accept-Language', 'X-Customer-Id', 'X-Tenant-Id'];
  if (expected.idempotencyKey !== undefined) {
    headers.push('Idempotency-Key');
  }
  expect(request.request.urlWithParams).toBe(expected.url);
  expect(request.request.headers.keys().sort()).toEqual(headers.sort());
  expect(request.request.headers.get('X-Tenant-Id')).toBe(store.tenantId);
  expect(request.request.headers.get('X-Customer-Id')).toBe(store.customerId);
  expect(request.request.headers.get('Accept-Language')).toBe(expected.language ?? 'es');
  if (expected.idempotencyKey !== undefined && expected.idempotencyKey !== 'any') {
    expect(request.request.headers.get('Idempotency-Key')).toBe(expected.idempotencyKey);
  }
  expect(request.request.body).toEqual(expected.body ?? null);
  return request;
}

/** The Idempotency-Key a request carries. */
export function idempotencyKeyOf(request: TestRequest): string {
  const key = request.request.headers.get('Idempotency-Key');
  expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  return key!;
}

export const CORRELATION_ID = '5b1e9c7a-1f2e-4d3c-9a8b-7c6d5e4f3a2b';

/** Answers with a problem+json body, as the API does: its title and detail stand for the localized API text. */
export function flushProblem(request: TestRequest, code: string, status: number, extra: Record<string, unknown> = {}): void {
  request.flush(
    {
      type: `https://orderflow-engine.example/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title: `Título de ${code}`,
      detail: `Detalle de ${code}`,
      status,
      instance: request.request.url,
      code,
      correlationId: CORRELATION_ID,
      ...extra,
    },
    { status, statusText: 'Problem', headers: { 'Content-Type': 'application/problem+json' } },
  );
}

/** A request with no answer: the network failed before any response. */
export function flushNoAnswer(request: TestRequest): void {
  request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
}

/** Answers E-01 with 201 and the quote. */
export function flushQuote(request: TestRequest, quote: Quote = QUOTE): void {
  request.flush(quote, { status: 201, statusText: 'Created', headers: { Location: `/api/v1/quotes/${quote.quoteId}` } });
}

/** Answers E-03 with 201, marked as a replay when asked. */
export function flushOrder(request: TestRequest, order: Order = ORDER, replayed = false): void {
  const headers: Record<string, string> = { Location: `/api/v1/orders/${order.orderId}` };
  if (replayed) {
    headers['Idempotent-Replayed'] = 'true';
  }
  request.flush(order, { status: 201, statusText: 'Created', headers });
}

/**
 * Lets the screen render what it received, waits for its images, and scrolls to the top. The image wait allows a slow,
 * shared host several seconds: a correct screen must not fail because Chromium decoded an image late.
 */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await vi.waitFor(
    () => {
      for (const img of Array.from<HTMLImageElement>(fixture.nativeElement.querySelectorAll('img'))) {
        expect(img.complete && img.naturalWidth > 0, img.src).toBe(true);
      }
    },
    { timeout: 5000, interval: 50 },
  );
  window.scrollTo(0, 0);
}

/** The text of each match: its ui-text parts joined by one space. */
export function texts(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return Array.from<Element>(fixture.nativeElement.querySelectorAll(selector)).map((node) => {
    const parts = node.matches('ui-text') ? [node] : Array.from(node.querySelectorAll('ui-text'));
    return parts.map((part) => part.textContent?.trim() ?? '').join(' ');
  });
}

export function element<T extends Element = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T {
  const found = fixture.nativeElement.querySelector(selector);
  if (!found) {
    throw new Error(`Nothing matches ${selector}`);
  }
  return found as T;
}

/** The button whose text is exactly this label. */
export function button(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  const buttons = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button, a'));
  const found = buttons.filter((candidate) => candidate.textContent?.trim() === label);
  expect(found.map((candidate) => candidate.textContent?.trim()), `buttons labelled ${label}`).toEqual([label]);
  return found[0];
}

/** Stands in for window.visualViewport: a desktop browser cannot raise an on-screen keyboard. */
export class SimulatedVisualViewport extends EventTarget implements VisualViewportPort {
  height = window.innerHeight;
  offsetTop = 0;

  showKeyboard(keyboardHeight: number): void {
    this.height = window.innerHeight - keyboardHeight;
    this.dispatchEvent(new Event('resize'));
  }

  hideKeyboard(): void {
    this.height = window.innerHeight;
    this.dispatchEvent(new Event('resize'));
  }
}
