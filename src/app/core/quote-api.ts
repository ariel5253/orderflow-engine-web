import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/*
 * The quote body of the API contract (E-01, E-02). Every amount is a decimal string at the currency's scale and
 * stays a string: the client formats it, never computes with it.
 */

export type QuoteStatus = 'OPEN' | 'CONFIRMED' | 'EXPIRED';

export interface Discount {
  readonly origin: string;
  readonly amount: string;
}

export interface ComboAllocation {
  readonly comboId: string;
  readonly amount: string;
}

export interface QuoteLine {
  readonly sku: string;
  readonly description: string;
  readonly qty: number;
  readonly isGift: boolean;
  readonly origin?: string;
  readonly unitPrice: string;
  readonly gross: string;
  readonly discounts: readonly Discount[];
  readonly comboAllocations: readonly ComboAllocation[];
  readonly net: string;
  readonly referenceValue?: string;
  readonly taxableBase: string;
  readonly taxRate: string;
  readonly tax: string;
}

export interface GiftTotal {
  readonly sku: string;
  readonly qty: number;
  readonly origin: string;
}

export interface Totals {
  readonly grossSubtotal: string;
  readonly discounts: readonly Discount[];
  readonly gifts: readonly GiftTotal[];
  readonly taxableBase: string;
  readonly taxes: string;
  readonly total: string;
}

export interface Credit {
  readonly fits: boolean;
  readonly available: string;
  readonly shortfall: string;
}

export interface Quote {
  readonly quoteId: string;
  readonly status: QuoteStatus;
  readonly expiresAt: string;
  readonly currency: string;
  readonly lines: readonly QuoteLine[];
  readonly totals: Totals;
  readonly credit?: Credit;
}

@Injectable({ providedIn: 'root' })
export class QuoteApi {
  private readonly http = inject(HttpClient);

  /** E-02: reads a quote. The API derives its status, and its credit while it is open, on every read. */
  get(quoteId: string): Observable<Quote> {
    return this.http.get<Quote>(`/api/v1/quotes/${encodeURIComponent(quoteId)}`);
  }
}
