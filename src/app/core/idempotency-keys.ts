import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { BROWSER_STORAGE, readStored, writeStored } from './browser-storage';

/*
 * The client side of SPEC §7.3 and §10.4: one Idempotency-Key per quote, created at the first "Confirm order" and
 * kept in browser storage, so every retry of that quote, also after a reload, sends the same key. A new quote gets a
 * new key. When the confirmation is answered, the order it names is kept with the key, so a confirmed quote can
 * open its order. No amount is kept: the order screen reads E-04 on every visit.
 */

export interface KnownOrder {
  readonly orderId: string;
  readonly orderNumber: string;
}

interface ConfirmationRecord {
  readonly key: string;
  readonly order?: KnownOrder;
}

const CONFIRMATIONS = 'confirmations';

/** A random UUID: crypto.randomUUID where the page is a secure context, otherwise one built from getRandomValues. */
export function newIdempotencyKey(crypto: Crypto): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

@Injectable({ providedIn: 'root' })
export class IdempotencyKeys {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly crypto = inject(DOCUMENT).defaultView!.crypto;
  private readonly records = signal<Readonly<Record<string, ConfirmationRecord>>>(readStored(this.storage, CONFIRMATIONS) ?? {});

  /** The key of a quote's confirmation: created and stored on the first call, the same one on every later call. */
  keyFor(quoteId: string): string {
    const known = this.records()[quoteId];
    if (known) {
      return known.key;
    }
    const key = newIdempotencyKey(this.crypto);
    this.save(quoteId, { key });
    return key;
  }

  /** Keeps the order a quote became, from a 201 or from QUOTE_ALREADY_CONFIRMED. */
  recordOrder(quoteId: string, order: KnownOrder): void {
    this.save(quoteId, { key: this.keyFor(quoteId), order: { orderId: order.orderId, orderNumber: order.orderNumber } });
  }

  /** The order a quote became, when this client knows it. */
  orderOf(quoteId: string): KnownOrder | null {
    return this.records()[quoteId]?.order ?? null;
  }

  private save(quoteId: string, record: ConfirmationRecord): void {
    const next = { ...this.records(), [quoteId]: record };
    this.records.set(next);
    writeStored(this.storage, CONFIRMATIONS, next);
  }
}
