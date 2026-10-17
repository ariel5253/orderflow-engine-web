import { Injectable, computed, inject, signal } from '@angular/core';
import { BROWSER_STORAGE, readStored, writeStored } from './browser-storage';
import { PaymentMethod, QuoteLineRequest } from './quote-api';
import { Store, StoreContext, storeKey } from './store-context';

/*
 * The cart lives in the browser only, one per store, and the server keeps none (SPEC §1, §10.1). It holds unit counts
 * and a payment method, never an amount: prices come from E-07 and totals from a quote.
 */

export interface Cart {
  readonly paymentMethod: PaymentMethod;
  /** Units per SKU. A SKU with no units is left out. */
  readonly quantities: Readonly<Record<string, number>>;
}

export const EMPTY_CART: Cart = { paymentMethod: 'CASH', quantities: {} };

const CARTS = 'carts';
const QUOTE_PAYMENT_METHODS = 'quotePaymentMethods';

/** The E-01 lines of a cart: the listed products with a quantity above zero, in the order of the list. */
export function cartLines(cart: Cart, listed: readonly { readonly sku: string }[]): QuoteLineRequest[] {
  return listed.filter((product) => (cart.quantities[product.sku] ?? 0) > 0).map((product) => ({ sku: product.sku, qty: cart.quantities[product.sku] }));
}

/** The units of a cart among the listed products: a count of items, never money. */
export function cartUnits(cart: Cart, listed: readonly { readonly sku: string }[]): number {
  return cartLines(cart, listed).reduce((units, line) => units + line.qty, 0);
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly context = inject(StoreContext);
  private readonly carts = signal<Readonly<Record<string, Cart>>>(readStored(this.storage, CARTS) ?? {});
  private readonly quotePaymentMethods = signal<Readonly<Record<string, PaymentMethod>>>(
    readStored(this.storage, QUOTE_PAYMENT_METHODS) ?? {},
  );

  /** The cart of the selected store. */
  readonly cart = computed(() => this.carts()[storeKey(this.context.current())] ?? EMPTY_CART);

  setQuantity(store: Store, sku: string, qty: number): void {
    this.update(store, (cart) => {
      const { [sku]: _previous, ...others } = cart.quantities;
      return { ...cart, quantities: qty > 0 ? { ...others, [sku]: qty } : others };
    });
  }

  setPaymentMethod(store: Store, paymentMethod: PaymentMethod): void {
    this.update(store, (cart) => ({ ...cart, paymentMethod }));
  }

  /** Puts these lines and this payment method in the store's cart, in place of what it held. */
  replace(store: Store, paymentMethod: PaymentMethod, lines: readonly QuoteLineRequest[]): void {
    this.update(store, () => ({ paymentMethod, quantities: Object.fromEntries(lines.map((line) => [line.sku, line.qty])) }));
  }

  /** Empties the store's cart, after a 201 of E-03 (SPEC §10.4). */
  clear(store: Store): void {
    const { [storeKey(store)]: _emptied, ...others } = this.carts();
    this.carts.set(others);
    writeStored(this.storage, CARTS, others);
  }

  /** Remembers the payment method of a quote this client created: E-02 does not carry it. */
  rememberQuote(quoteId: string, paymentMethod: PaymentMethod): void {
    const next = { ...this.quotePaymentMethods(), [quoteId]: paymentMethod };
    this.quotePaymentMethods.set(next);
    writeStored(this.storage, QUOTE_PAYMENT_METHODS, next);
  }

  /** The payment method this client sent for a quote, if it created it. */
  paymentMethodOf(quoteId: string): PaymentMethod | null {
    return this.quotePaymentMethods()[quoteId] ?? null;
  }

  private update(store: Store, change: (cart: Cart) => Cart): void {
    const key = storeKey(store);
    const next = { ...this.carts(), [key]: change(this.carts()[key] ?? EMPTY_CART) };
    this.carts.set(next);
    writeStored(this.storage, CARTS, next);
  }
}
