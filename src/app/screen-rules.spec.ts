import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { page, userEvent } from 'vitest/browser';
import {
  ORDER,
  PRODUCTS,
  QUOTE,
  SimulatedVisualViewport,
  backend,
  element,
  expectRequest,
  navigate,
  openApp,
  settle,
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
import { Order } from './core/order-api';
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
const LONG_SHORT_QUOTE: Quote = withLongNames({ ...QUOTE, credit: { fits: false, available: '100000', shortfall: '15647' } });

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
      expect(texts(fixture, '.action-bar__summary')).toEqual(['1,234,567 unidades']);
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
      expect(texts(fixture, '.action-bar__total-value')).toEqual(['$115,647']);
      expect(root.querySelectorAll('ui-text.amount').length).toBeGreaterThan(20);
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
      expectScreenRules(root, width, QUOTE.lines.length);
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
