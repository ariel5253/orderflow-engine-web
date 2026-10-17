import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { page, userEvent } from 'vitest/browser';
import {
  HISTORY,
  ORDER,
  PRODUCTS,
  QUOTE,
  STORES,
  SimulatedVisualViewport,
  backend,
  button,
  element,
  expectRequest,
  historyUrl,
  navigate,
  openApp,
  settle,
  storeNamed,
  texts,
} from '../testing/app-harness';
import longNames from '../testing/long-names.json';
import longStoreNames from '../testing/long-store-names.json';
import {
  actionBarGap,
  actionBarObstructions,
  clippedUiText,
  horizontalOverflow,
  productImageBoxes,
  splitAmounts,
  textOutsideUiText,
  truncatingElements,
} from '../testing/screen-checks';
import { BreakdownLines } from './breakdown/breakdown-lines';
import { BreakdownTotals } from './breakdown/breakdown-totals';
import { Order, OrderHistory } from './core/order-api';
import { ProductList } from './core/product-api';
import { Breakdown, Quote } from './core/quote-api';
import { Store } from './core/store-context';

const LONG_NAMES: Readonly<Record<string, string>> = longNames;
const LONG_STORES: readonly Store[] = longStoreNames;

const LONG_PRODUCTS: ProductList = {
  ...PRODUCTS,
  items: PRODUCTS.items.map((product) => ({ ...product, description: LONG_NAMES[product.sku] ?? product.description })),
};

function withLongNames<T extends Breakdown>(body: T): T {
  return { ...body, lines: body.lines.map((line) => ({ ...line, description: LONG_NAMES[line.sku] ?? line.description })) };
}

const LONG_ORDER: Order = withLongNames(ORDER);

/** E-05 with a total of 17 digits first: it must sit whole beside its number and date. */
const LONG_HISTORY: OrderHistory = {
  ...HISTORY,
  items: [{ ...HISTORY.items[0], total: '12345678901234567' }, ...HISTORY.items.slice(1)],
};
const LONG_SHORT_QUOTE: Quote = withLongNames({ ...QUOTE, credit: { fits: false, available: '100000', shortfall: '15647' } });

/** The same cart, order and history in dollars: COP and USD share the $ symbol, so only the code tells them apart. */
const USD_LIST_PRICES = ['1.45', '0.60', '0.45', '0.55'];
const LONG_USD_PRODUCTS: ProductList = {
  currency: 'USD',
  items: LONG_PRODUCTS.items.map((product, index) => ({ ...product, listPrice: USD_LIST_PRICES[index] })),
};
const LONG_USD_ORDER: Order = { ...LONG_ORDER, currency: 'USD', totals: { ...LONG_ORDER.totals, total: '77.11' } };
const LONG_USD_HISTORY: OrderHistory = {
  currency: 'USD',
  items: [
    { ...HISTORY.items[0], total: '123456789012345.67' },
    { ...HISTORY.items[1], total: '77.11' },
    { ...HISTORY.items[2], total: '0.60' },
  ],
};

/**
 * The same cart in quetzales and in soles, for a seeded Guatemala and Peru store (data model §1): Intl gives each
 * its own symbol, and the code above the grid names the currency in any case.
 */
interface ForeignCart {
  readonly currency: string;
  readonly storeName: string;
  readonly tenantId: string;
  readonly listPrices: readonly string[];
  readonly taxRate: string;
  readonly amounts: readonly string[];
}

const FOREIGN_CARTS: readonly ForeignCart[] = [
  {
    currency: 'GTQ',
    storeName: 'Tienda Ciudad de Guatemala',
    tenantId: 'gt-alpha',
    listPrices: ['15.00', '5.00', '4.00', '3.50'],
    taxRate: '0.120000',
    amounts: ['Q\u00a015.00', 'Q\u00a05.00', 'Q\u00a04.00', 'Q\u00a03.50'],
  },
  {
    currency: 'PEN',
    storeName: 'Tienda Lima',
    tenantId: 'pe-alpha',
    listPrices: ['7.50', '2.50', '2.00', '1.80'],
    taxRate: '0.180000',
    amounts: ['PEN\u00a07.50', 'PEN\u00a02.50', 'PEN\u00a02.00', 'PEN\u00a01.80'],
  },
];

function foreignProducts(cart: ForeignCart): ProductList {
  return {
    currency: cart.currency,
    items: LONG_PRODUCTS.items.map((product, index) => ({ ...product, listPrice: cart.listPrices[index], taxRate: cart.taxRate })),
  };
}

const VIEWPORTS: readonly (readonly [width: number, height: number])[] = [
  [768, 1024],
  [375, 812],
];

/** The checks of order-summary.spec on any screen (AC-42 ... AC-44). */
function expectScreenRules(root: HTMLElement, width: number, images: number): void {
  expect(window.innerWidth).toBe(width);
  expect(horizontalOverflow()).toBeLessThanOrEqual(0);
  expect(clippedUiText(root)).toEqual([]);
  expect(truncatingElements(root)).toEqual([]);
  expect(textOutsideUiText(root)).toEqual([]);
  expect(splitAmounts(root)).toEqual([]);
  expect(actionBarGap(root)).toBeLessThanOrEqual(0.5);
  expect(actionBarObstructions(root)).toEqual([]);

  const boxes = productImageBoxes(root);
  expect(boxes).toHaveLength(images);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThan(0);
    expect(box).toEqual(boxes[0]);
    expect(box.height).toBe(box.width);
  }
}

/** Every control of the screen is a touch target of at least 44 x 44 px. */
function expectTouchTargets(root: HTMLElement): void {
  for (const control of Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, summary'))) {
    if (!control.checkVisibility() || control.matches('input[type="radio"]')) {
      continue;
    }
    const box = control.getBoundingClientRect();
    expect(box.width, control.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(44);
    expect(box.height, control.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(44);
  }
}

async function openCart(width: number, height: number, visualViewport?: SimulatedVisualViewport): Promise<ComponentFixture<unknown>> {
  await page.viewport(width, height);
  const fixture = await openApp('/cart', { stores: LONG_STORES, visualViewport });
  expectRequest({ method: 'GET', url: '/api/v1/products', store: LONG_STORES[0] }).flush(LONG_PRODUCTS);
  await settle(fixture);
  return fixture;
}

describe('screen rules on every screen (AC-42 ... AC-44)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => backend().verify());

  for (const [width, height] of VIEWPORTS) {
    it(`cart: long product and store names stay whole, and every control is reachable, at ${width} x ${height}`, async () => {
      const fixture = await openCart(width, height);
      await userEvent.fill(document.querySelector<HTMLInputElement>('input[data-sku="BEV-COLA-350"]')!, '1234567');
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.product-card__name')).toEqual(PRODUCTS.items.map((product) => LONG_NAMES[product.sku]));
      expect(texts(fixture, '.store-picker__value')).toEqual([LONG_STORES[0].name]);
      expect(texts(fixture, '.cart-currency')).toEqual(['Precios en COP']);
      expect(texts(fixture, '.action-bar__summary')).toEqual(['1,234,567 unidades']);
      expectScreenRules(root, width, PRODUCTS.items.length);
      expectTouchTargets(root);
    });

    it(`cart in USD: the currency line names the body's currency, at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp('/cart', { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: '/api/v1/products', store: LONG_STORES[0] }).flush(LONG_USD_PRODUCTS);
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.cart-currency')).toEqual(['Precios en USD']);
      expect(texts(fixture, '.product-card__amount')).toEqual(['$1.45', '$0.60', '$0.45', '$0.55']);
      expectScreenRules(root, width, PRODUCTS.items.length);
      expectTouchTargets(root);
    });

    for (const cart of FOREIGN_CARTS) {
      it(`cart in ${cart.currency}: a ${cart.tenantId} store names its currency above the grid, at ${width} x ${height}`, async () => {
        await page.viewport(width, height);
        const fixture = await openApp('/cart');
        expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(PRODUCTS);
        await settle(fixture);
        element(fixture, '.store-picker summary').click();
        TestBed.tick();
        button(fixture, cart.storeName).click();
        TestBed.tick();
        const store = storeNamed(cart.storeName);
        expectRequest({ method: 'GET', url: '/api/v1/products', store }).flush(foreignProducts(cart));
        await settle(fixture);
        expect(store.tenantId).toBe(cart.tenantId);
        const root: HTMLElement = fixture.nativeElement;

        expect(texts(fixture, '.store-picker__value')).toEqual([cart.storeName]);
        expect(texts(fixture, '.cart-currency')).toEqual([`Precios en ${cart.currency}`]);
        expect(texts(fixture, '.product-card__amount')).toEqual(cart.amounts);
        expectScreenRules(root, width, PRODUCTS.items.length);
        expectTouchTargets(root);
      });
    }

    it(`store picker: open, the four seeded tenants and their stores are whole and selectable, at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp('/cart');
      expectRequest({ method: 'GET', url: '/api/v1/products' }).flush(LONG_PRODUCTS);
      await settle(fixture);
      element(fixture, '.store-picker summary').click();
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.store-picker__tenant')).toEqual(['co-alpha', 'ec-alpha', 'gt-alpha', 'pe-alpha']);
      expect(texts(fixture, '.store-picker__option')).toEqual(STORES.map((store) => store.name));
      const panel = element(fixture, '.store-picker__panel').getBoundingClientRect();
      expect(panel.left).toBeGreaterThanOrEqual(0);
      expect(panel.right).toBeLessThanOrEqual(width);
      expectScreenRules(root, width, PRODUCTS.items.length);
      expectTouchTargets(root);
    });

    it(`store picker: open, every long store name is whole and selectable, at ${width} x ${height}`, async () => {
      const fixture = await openCart(width, height);
      element(fixture, '.store-picker summary').click();
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(element<HTMLDetailsElement>(fixture, 'details.store-picker').open).toBe(true);
      expect(texts(fixture, '.store-picker__option')).toEqual(LONG_STORES.map((store) => store.name));
      expect(texts(fixture, '.store-picker__tenant')).toEqual(['co-alpha', 'ec-alpha']);
      // A disclosure, never a native select: a closed select cuts a long name.
      expect(root.querySelector('select')).toBeNull();
      const panel = element(fixture, '.store-picker__panel').getBoundingClientRect();
      expect(panel.left).toBeGreaterThanOrEqual(0);
      expect(panel.right).toBeLessThanOrEqual(width);
      expectScreenRules(root, width, PRODUCTS.items.length);
      expectTouchTargets(root);
    });

    it(`order: long names stay whole, and the action bar is reachable, at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp(`/orders/${ORDER.orderId}`, { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}`, store: LONG_STORES[0] }).flush(LONG_ORDER);
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.line__name')).toEqual(ORDER.lines.map((line) => LONG_NAMES[line.sku]));
      expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647\u00a0COP']);
      expect(root.querySelectorAll('ui-text.amount').length).toBeGreaterThan(20);
      expectScreenRules(root, width, ORDER.lines.length);
      expectTouchTargets(root);
    });

    it(`order in USD: the code follows the total, which stays whole, at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp(`/orders/${ORDER.orderId}`, { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}`, store: LONG_STORES[0] }).flush(LONG_USD_ORDER);
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.action-bar__total-value')).toEqual(['$77.11\u00a0USD']);
      expectScreenRules(root, width, ORDER.lines.length);
      expectTouchTargets(root);
    });

    it(`summary with a notice: long names stay whole at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp(`/quotes/${QUOTE.quoteId}`, { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}`, store: LONG_STORES[0] }).flush(LONG_SHORT_QUOTE);
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, 'ui-notice .notice__title')).toEqual(['El pedido no cabe en tu cupo']);
      expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647\u00a0COP']);
      expectScreenRules(root, width, QUOTE.lines.length);
      expectTouchTargets(root);
    });

    it(`My orders: long store names and long totals stay whole, and every order is reachable, at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp('/orders', { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: historyUrl(LONG_STORES[0]), store: LONG_STORES[0] }).flush(LONG_HISTORY);
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.store-picker__value')).toEqual([LONG_STORES[0].name]);
      expect(texts(fixture, '.order-item__number')).toEqual(LONG_HISTORY.items.map((item) => item.orderNumber));
      expect(texts(fixture, '.order-item__total')).toEqual(['$12,345,678,901,234,567\u00a0COP', '$71,103\u00a0COP', '$11,529\u00a0COP']);
      expectScreenRules(root, width, 0);
      expectTouchTargets(root);
    });

    it(`My orders in USD: the code follows every total, which stays whole, at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp('/orders', { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: historyUrl(LONG_STORES[0]), store: LONG_STORES[0] }).flush(LONG_USD_HISTORY);
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.order-item__total')).toEqual([
        '$123,456,789,012,345.67\u00a0USD',
        '$77.11\u00a0USD',
        '$0.60\u00a0USD',
      ]);
      expectScreenRules(root, width, 0);
      expectTouchTargets(root);
    });

    it(`My orders, empty: long store names stay whole at ${width} x ${height}`, async () => {
      await page.viewport(width, height);
      const fixture = await openApp('/orders', { stores: LONG_STORES });
      expectRequest({ method: 'GET', url: historyUrl(LONG_STORES[0]), store: LONG_STORES[0] }).flush({ currency: 'COP', items: [] });
      await settle(fixture);
      const root: HTMLElement = fixture.nativeElement;

      expect(texts(fixture, '.empty-state .card__title')).toEqual(['Aún no tienes pedidos']);
      expectScreenRules(root, width, 0);
      expectTouchTargets(root);
    });
  }

  it('keeps the action bar above the on-screen keyboard while a quantity is typed', async () => {
    const keyboard = new SimulatedVisualViewport();
    const fixture = await openCart(375, 812, keyboard);
    const input = document.querySelector<HTMLInputElement>('input[data-sku="SNK-CHIPS-45"]')!;
    const bar = (): DOMRect => element(fixture, 'ui-action-bar').getBoundingClientRect();
    expect(bar().bottom).toBeCloseTo(window.innerHeight, 0);

    await userEvent.click(input);
    keyboard.showKeyboard(300);
    await userEvent.type(input, '24');
    await fixture.whenStable();

    const keyboardTop = window.innerHeight - 300;
    expect(bar().bottom).toBeLessThanOrEqual(keyboardTop + 0.5);
    expect(bar().bottom).toBeGreaterThanOrEqual(keyboardTop - 0.5);
    expect(actionBarObstructions(fixture.nativeElement)).toEqual([]);
    expect(texts(fixture, '.action-bar__summary')).toEqual(['24 unidades']);

    keyboard.hideKeyboard();
    await fixture.whenStable();
    expect(bar().bottom).toBeCloseTo(window.innerHeight, 0);
  });

  it('renders the order (E-04) through the same breakdown components as the summary (E-02)', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await settle(fixture);
    const summaryLines = fixture.debugElement.query(By.directive(BreakdownLines));
    const summaryTotals = fixture.debugElement.query(By.directive(BreakdownTotals));
    expect(summaryLines.componentInstance.breakdown()).toEqual(QUOTE);
    expect(summaryTotals.componentInstance.breakdown()).toEqual(QUOTE);
    const summaryText = [texts(fixture, '.line__name'), texts(fixture, 'app-breakdown-totals dd')];

    await navigate(`/orders/${ORDER.orderId}`);
    expectRequest({ method: 'GET', url: `/api/v1/orders/${ORDER.orderId}` }).flush(ORDER);
    await settle(fixture);
    const orderLines = fixture.debugElement.queryAll(By.directive(BreakdownLines));
    const orderTotals = fixture.debugElement.queryAll(By.directive(BreakdownTotals));
    expect(orderLines).toHaveLength(1);
    expect(orderTotals).toHaveLength(1);
    expect(orderLines[0].componentInstance.breakdown()).toEqual(ORDER);
    expect(orderTotals[0].componentInstance.breakdown()).toEqual(ORDER);
    expect([texts(fixture, '.line__name'), texts(fixture, 'app-breakdown-totals dd')]).toEqual(summaryText);
    expect(texts(fixture, '.page-meta')).toEqual([
      expect.stringMatching(/^Confirmado Confirmado el .+ Pago: Crédito$/),
    ]);
    TestBed.tick();
  });
});
