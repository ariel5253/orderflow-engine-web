import { ComponentFixture, TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import {
  PRODUCTS,
  QUOTE,
  STORES,
  backend,
  button,
  currentUrl,
  element,
  expectRequest,
  flushQuote,
  navigate,
  openApp,
  settle,
  storeNamed,
  texts,
} from '../../../testing/app-harness';

const PRODUCTS_PATH = '/api/v1/products';

/** The ec-alpha list of E-07: dollars at scale 2. */
const EC_PRODUCTS = {
  currency: 'USD',
  items: [
    { sku: 'BEV-COLA-1500', description: 'Gaseosa cola 1,5 l', listPrice: '1.45', taxRate: '0.150000' },
    { sku: 'BEV-COLA-350', description: 'Gaseosa cola 350 ml', listPrice: '0.60', taxRate: '0.150000' },
    { sku: 'BEV-WATER-600', description: 'Agua 600 ml', listPrice: '0.45', taxRate: '0.150000' },
    { sku: 'SNK-PLANTAIN-45', description: 'Chifles 45 g', listPrice: '0.55', taxRate: '0.150000' },
  ],
};

/** The gt-alpha list of E-07: quetzales at scale 2, all at 12% tax (data model §1). */
const GT_PRODUCTS = {
  currency: 'GTQ',
  items: [
    { sku: 'BEV-COLA-1500', description: 'Gaseosa cola 1,5 l', listPrice: '15.00', taxRate: '0.120000' },
    { sku: 'BEV-COLA-350', description: 'Gaseosa cola 350 ml', listPrice: '5.00', taxRate: '0.120000' },
    { sku: 'BEV-WATER-600', description: 'Agua 600 ml', listPrice: '4.00', taxRate: '0.120000' },
    { sku: 'SNK-CHIPS-45', description: 'Papas fritas 45 g', listPrice: '3.50', taxRate: '0.120000' },
  ],
};

/** The pe-alpha list of E-07: soles at scale 2, all at 18% tax (data model §1). */
const PE_PRODUCTS = {
  currency: 'PEN',
  items: [
    { sku: 'BEV-COLA-1500', description: 'Gaseosa cola 1,5 l', listPrice: '7.50', taxRate: '0.180000' },
    { sku: 'BEV-COLA-350', description: 'Gaseosa cola 350 ml', listPrice: '2.50', taxRate: '0.180000' },
    { sku: 'BEV-WATER-600', description: 'Agua 600 ml', listPrice: '2.00', taxRate: '0.180000' },
    { sku: 'SNK-CHIPS-45', description: 'Papas fritas 45 g', listPrice: '1.80', taxRate: '0.180000' },
  ],
};

/** The open picker's groups: each tenant with the names of its stores, in the order shown. */
function pickerGroups(fixture: ComponentFixture<unknown>): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const group of Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.store-picker__group'))) {
    const options = Array.from(group.querySelectorAll('.store-picker__option ui-text'));
    groups[group.getAttribute('aria-label') ?? ''] = options.map((option) => option.textContent?.trim() ?? '');
  }
  return groups;
}

function quantityInput(sku: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[data-sku="${sku}"]`)!;
}

function stepButtons(sku: string): { decrease: HTMLButtonElement; increase: HTMLButtonElement } {
  const [decrease, increase] = Array.from(quantityInput(sku).parentElement!.querySelectorAll('button'));
  return { decrease, increase };
}

async function typeQuantity(sku: string, value: string): Promise<void> {
  const input = quantityInput(sku);
  await userEvent.clear(input);
  await userEvent.type(input, value);
  input.blur();
  TestBed.tick();
}

describe('cart (/cart)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => backend().verify());

  it('lists the E-07 products as sent, in SKU order, with list prices and tax rates, and never a subtotal or a total', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);

    expect(texts(fixture, 'h1')).toEqual(['Comprar']);
    // COP and USD share the $ symbol: the cart names the currency by its code above the grid (SPEC §10.3).
    expect(texts(fixture, '.cart-currency')).toEqual(['Precios en COP']);
    expect(texts(fixture, '.product-card__name')).toEqual(['Gaseosa cola 1,5 l', 'Gaseosa cola 350 ml', 'Agua 600 ml', 'Papas fritas 45 g']);
    expect(texts(fixture, '.product-card__sku')).toEqual(['BEV-COLA-1500', 'BEV-COLA-350', 'BEV-WATER-600', 'SNK-CHIPS-45']);
    expect(texts(fixture, '.product-card__amount')).toEqual(['$5,200', '$2,500', '$1,500', '$1,800']);
    expect(texts(fixture, '.product-card__tax')).toEqual(['Impuesto 19%', 'Impuesto 19%', 'Impuesto 19%', 'Impuesto 5%']);
    expect(fixture.nativeElement.querySelectorAll('.product-card ui-product-image')).toHaveLength(4);

    // The only amounts on the cart are the list prices: the total comes with the quote.
    expect(texts(fixture, 'ui-text.amount')).toEqual(['$5,200', '$2,500', '$1,500', '$1,800']);
    expect(fixture.nativeElement.querySelectorAll('.totals, .action-bar__total-value, app-breakdown-totals')).toHaveLength(0);
    expect(texts(fixture, '.action-bar__summary')).toEqual(['Agrega productos para cotizar']);
    expect(button(fixture, 'Cotizar').disabled).toBe(true);
  });

  it('counts units as quantities change, and still shows no amount but the list prices', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);

    stepButtons('BEV-COLA-350').increase.click();
    TestBed.tick();
    expect(texts(fixture, '.action-bar__summary')).toEqual(['1 unidad']);
    expect(quantityInput('BEV-COLA-350').value).toBe('1');

    stepButtons('BEV-COLA-350').increase.click();
    stepButtons('BEV-COLA-350').increase.click();
    await typeQuantity('SNK-CHIPS-45', '12');
    expect(texts(fixture, '.action-bar__summary')).toEqual(['15 unidades']);
    expect(button(fixture, 'Cotizar').disabled).toBe(false);

    stepButtons('BEV-COLA-350').decrease.click();
    TestBed.tick();
    expect(texts(fixture, '.action-bar__summary')).toEqual(['14 unidades']);
    expect(texts(fixture, 'ui-text.amount')).toEqual(['$5,200', '$2,500', '$1,500', '$1,800']);

    // A quantity never goes below zero.
    for (let tap = 0; tap < 4; tap++) {
      stepButtons('BEV-COLA-350').decrease.click();
    }
    TestBed.tick();
    expect(quantityInput('BEV-COLA-350').value).toBe('0');
    expect(texts(fixture, '.action-bar__summary')).toEqual(['12 unidades']);
  });

  it('sends only the lines with a quantity above zero, then a 201 opens /quotes/:quoteId', async () => {
    await page.viewport(375, 812);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);

    await typeQuantity('BEV-COLA-350', '40');
    await typeQuantity('BEV-WATER-600', '3');
    await typeQuantity('SNK-CHIPS-45', '10');
    await typeQuantity('BEV-WATER-600', '0');
    element<HTMLInputElement>(fixture, 'input[type="radio"][value="CREDIT"]').click();
    TestBed.tick();

    button(fixture, 'Cotizar').click();
    TestBed.tick();
    const create = expectRequest({
      method: 'POST',
      url: '/api/v1/quotes',
      body: { paymentMethod: 'CREDIT', lines: [{ sku: 'BEV-COLA-350', qty: 40 }, { sku: 'SNK-CHIPS-45', qty: 10 }] },
    });
    TestBed.tick();
    expect(button(fixture, 'Cotizando…').disabled).toBe(true);

    flushQuote(create);
    await vi.waitFor(() => expect(currentUrl()).toBe(`/quotes/${QUOTE.quoteId}`));
    TestBed.tick();
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await settle(fixture);
    expect(texts(fixture, 'h1')).toEqual(['Resumen del pedido']);
  });

  it('reads E-07 on every visit, and / opens the cart', async () => {
    const fixture = await openApp('/');
    expect(currentUrl()).toBe('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);

    await navigate(`/quotes/${QUOTE.quoteId}`);
    expectRequest({ method: 'GET', url: `/api/v1/quotes/${QUOTE.quoteId}` }).flush(QUOTE);
    await navigate('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);
    expect(texts(fixture, '.product-card__name')).toHaveLength(4);
  });

  it('keeps one cart per store, in browser storage, and lists the products of the selected store', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);
    await typeQuantity('BEV-COLA-350', '25');

    // The seeded stores, named in the tenants' language.
    expect(texts(fixture, '.store-picker__value')).toEqual(['Tienda Norte']);
    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    expect(texts(fixture, '.store-picker__option')).toEqual([
      'Tienda Norte',
      'Tienda Sur',
      'Tienda Quito',
      'Tienda Guayaquil',
      'Tienda Ciudad de Guatemala',
      'Tienda Quetzaltenango',
      'Tienda Lima',
      'Tienda Arequipa',
    ]);
    button(fixture, STORES[2].name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: STORES[2] }).flush(EC_PRODUCTS);
    await settle(fixture);
    expect(texts(fixture, '.store-picker__value')).toEqual([STORES[2].name]);
    expect(texts(fixture, '.product-card__amount')).toEqual(['$1.45', '$0.60', '$0.45', '$0.55']);
    expect(texts(fixture, '.cart-currency')).toEqual(['Precios en USD']);
    expect(quantityInput('BEV-COLA-350').value).toBe('0');
    expect(texts(fixture, '.action-bar__summary')).toEqual(['Agrega productos para cotizar']);
    await typeQuantity('SNK-PLANTAIN-45', '2');

    // A reload keeps the selected store and each store's cart.
    TestBed.resetTestingModule();
    const reloaded = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: STORES[2] }).flush(EC_PRODUCTS);
    await settle(reloaded);
    expect(quantityInput('SNK-PLANTAIN-45').value).toBe('2');

    element(reloaded, '.store-picker summary').click();
    TestBed.tick();
    button(reloaded, STORES[0].name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(reloaded);
    expect(quantityInput('BEV-COLA-350').value).toBe('25');
    expect(texts(reloaded, '.action-bar__summary')).toEqual(['25 unidades']);
  });

  it('groups the stores by the four seeded tenants, and a Guatemala and a Peru store list their catalog in GTQ and PEN', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);

    // The four countries of the assignment (SPEC §5), each tenant with its own stores.
    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    expect(texts(fixture, '.store-picker__tenant')).toEqual(['co-alpha', 'ec-alpha', 'gt-alpha', 'pe-alpha']);
    expect(pickerGroups(fixture)).toEqual({
      'co-alpha': ['Tienda Norte', 'Tienda Sur'],
      'ec-alpha': ['Tienda Quito', 'Tienda Guayaquil'],
      'gt-alpha': ['Tienda Ciudad de Guatemala', 'Tienda Quetzaltenango'],
      'pe-alpha': ['Tienda Lima', 'Tienda Arequipa'],
    });

    // Guatemala: the request speaks for gt-alpha, and quetzales carry their code above the grid.
    const guatemala = storeNamed('Tienda Ciudad de Guatemala');
    expect(guatemala.tenantId).toBe('gt-alpha');
    button(fixture, guatemala.name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: guatemala }).flush(GT_PRODUCTS);
    await settle(fixture);
    expect(texts(fixture, '.store-picker__value')).toEqual(['Tienda Ciudad de Guatemala']);
    expect(texts(fixture, '.cart-currency')).toEqual(['Precios en GTQ']);
    expect(texts(fixture, '.product-card__amount')).toEqual(['Q\u00a015.00', 'Q\u00a05.00', 'Q\u00a04.00', 'Q\u00a03.50']);
    expect(texts(fixture, '.product-card__tax')).toEqual(['Impuesto 12%', 'Impuesto 12%', 'Impuesto 12%', 'Impuesto 12%']);

    // Peru: the request speaks for pe-alpha, and soles carry their code above the grid.
    const lima = storeNamed('Tienda Lima');
    expect(lima.tenantId).toBe('pe-alpha');
    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    button(fixture, lima.name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: lima }).flush(PE_PRODUCTS);
    await settle(fixture);
    expect(texts(fixture, '.store-picker__value')).toEqual(['Tienda Lima']);
    expect(texts(fixture, '.cart-currency')).toEqual(['Precios en PEN']);
    expect(texts(fixture, '.product-card__amount')).toEqual(['PEN\u00a07.50', 'PEN\u00a02.50', 'PEN\u00a02.00', 'PEN\u00a01.80']);
    expect(texts(fixture, '.product-card__tax')).toEqual(['Impuesto 18%', 'Impuesto 18%', 'Impuesto 18%', 'Impuesto 18%']);
  });

  it('shows a failed E-01 only on the cart of the store it was sent for', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);
    await typeQuantity('BEV-COLA-350', '4');
    button(fixture, 'Cotizar').click();
    TestBed.tick();
    expectRequest({ method: 'POST', url: '/api/v1/quotes', body: { paymentMethod: 'CASH', lines: [{ sku: 'BEV-COLA-350', qty: 4 }] } }).flush(
      { title: 'Producto desconocido', detail: 'El SKU no existe.', status: 422, code: 'UNKNOWN_SKU', correlationId: 'c0ffee00-0000-4000-8000-000000000000' },
      { status: 422, statusText: 'Unprocessable Content', headers: { 'Content-Type': 'application/problem+json' } },
    );
    await settle(fixture);
    expect(texts(fixture, 'ui-problem-notice .notice__title')).toEqual(['Producto desconocido']);

    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    button(fixture, STORES[1].name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: STORES[1] }).flush(PRODUCTS);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('ui-problem-notice')).toBeNull();
  });

  it('opens nothing when the E-01 answer comes after the store changed', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);
    await typeQuantity('BEV-COLA-350', '4');
    button(fixture, 'Cotizar').click();
    TestBed.tick();
    const request = expectRequest({
      method: 'POST',
      url: '/api/v1/quotes',
      body: { paymentMethod: 'CASH', lines: [{ sku: 'BEV-COLA-350', qty: 4 }] },
    });

    element(fixture, '.store-picker summary').click();
    TestBed.tick();
    button(fixture, STORES[1].name).click();
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: STORES[1] }).flush(PRODUCTS);
    await settle(fixture);

    flushQuote(request);
    await settle(fixture);
    expect(currentUrl()).toBe('/cart');
  });

  it('gives the focus back to the store picker when it closes, by Escape or by a choice', async () => {
    await page.viewport(768, 1024);
    const fixture = await openApp('/cart');
    expectRequest({ method: 'GET', url: PRODUCTS_PATH }).flush(PRODUCTS);
    await settle(fixture);
    const disclosure = element<HTMLDetailsElement>(fixture, 'details.store-picker');
    const summary = element(fixture, '.store-picker summary');

    await userEvent.click(summary);
    TestBed.tick();
    expect(disclosure.open).toBe(true);
    button(fixture, STORES[1].name).focus();
    await userEvent.keyboard('{Escape}');
    TestBed.tick();
    expect(disclosure.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    await userEvent.click(summary);
    TestBed.tick();
    button(fixture, STORES[1].name).focus();
    await userEvent.keyboard('{Enter}');
    TestBed.tick();
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, store: STORES[1] }).flush(PRODUCTS);
    await settle(fixture);
    expect(texts(fixture, '.store-picker__value')).toEqual([STORES[1].name]);
    expect(disclosure.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('renders in English', async () => {
    await page.viewport(375, 812);
    const fixture = await openApp('/cart', { language: 'en' });
    expectRequest({ method: 'GET', url: PRODUCTS_PATH, language: 'en' }).flush(PRODUCTS);
    await settle(fixture);

    expect(texts(fixture, 'h1')).toEqual(['Shop']);
    expect(texts(fixture, '.cart-currency')).toEqual(['Prices in COP']);
    expect(texts(fixture, '.product-card__tax')[0]).toBe('Tax 19%');
    expect(texts(fixture, '.action-bar__summary')).toEqual(['Add products to get a quote']);
    stepButtons('BEV-COLA-350').increase.click();
    TestBed.tick();
    expect(texts(fixture, '.action-bar__summary')).toEqual(['1 unit']);
    expect(button(fixture, 'Get quote').disabled).toBe(false);
  });
});
