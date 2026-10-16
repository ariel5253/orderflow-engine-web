import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Breakdown, PaymentMethod, QuoteStatus } from './quote-api';

/*
 * The order body of the API contract (E-03, E-04). Its lines and totals are rendered from the quote it confirms, so
 * they have the quote's shape. Amounts stay decimal strings.
 */

export interface Order extends Breakdown {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: QuoteStatus;
  readonly quoteId: string;
  readonly confirmedAt: string;
  readonly paymentMethod: PaymentMethod;
}

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Marks a 201 that replays the stored answer of an earlier request with the same key (SPEC §7.3). */
export const REPLAYED_HEADER = 'Idempotent-Replayed';

/** A 201 of E-03: the order, and whether the API replayed it. */
export interface Confirmation {
  readonly order: Order;
  readonly replayed: boolean;
}

@Injectable({ providedIn: 'root' })
export class OrderApi {
  private readonly http = inject(HttpClient);

  /** E-03: confirms a quote under the given key. The body is the quote id only, so a retry resends the same body. */
  confirm(quoteId: string, idempotencyKey: string): Observable<Confirmation> {
    return this.http
      .post<Order>('/api/v1/orders', { quoteId }, { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }, observe: 'response' })
      .pipe(map((response: HttpResponse<Order>) => ({ order: response.body!, replayed: response.headers.get(REPLAYED_HEADER) === 'true' })));
  }

  /** E-04: reads an order, on every visit. */
  get(orderId: string): Observable<Order> {
    return this.http.get<Order>(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  }
}
