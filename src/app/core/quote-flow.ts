import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CartStore } from './cart-store';
import { ApiFailure, toApiFailure } from './problem';
import { QuoteApi, QuoteRequest } from './quote-api';
import { StoreContext, storeKey } from './store-context';

/** An E-01 request that failed, kept with its failure and its store so its way out can repeat or change it. */
export interface FailedQuoteRequest {
  readonly failure: ApiFailure;
  readonly request: QuoteRequest;
  /** The store the request spoke for (storeKey). */
  readonly store: string;
}

/**
 * Every E-01 the client sends: "Get quote" on the cart, and the re-quotes of the summary ("Pay cash", "Quote again").
 * A 201 opens the new quote, unless the store changed meanwhile. A failure is shown on the cart of the store that sent
 * it, whichever screen sent it (SPEC §10.5).
 */
@Injectable({ providedIn: 'root' })
export class QuoteFlow {
  private readonly quoteApi = inject(QuoteApi);
  private readonly cartStore = inject(CartStore);
  private readonly context = inject(StoreContext);
  private readonly router = inject(Router);

  private readonly inFlight = signal(false);
  private readonly lastFailure = signal<FailedQuoteRequest | null>(null);

  /** Whether an E-01 is waiting for its answer. */
  readonly pending = this.inFlight.asReadonly();

  /** The failed E-01 the cart shows, until it is dismissed or the cart is left. */
  readonly failed = this.lastFailure.asReadonly();

  request(request: QuoteRequest): void {
    if (this.inFlight()) {
      return;
    }
    const store = storeKey(this.context.current());
    this.inFlight.set(true);
    this.lastFailure.set(null);
    this.quoteApi.create(request).subscribe({
      next: (quote) => {
        this.inFlight.set(false);
        this.cartStore.rememberQuote(quote.quoteId, request.paymentMethod);
        // A quote belongs to the store that asked for it: once the picker has chosen another, it opens nothing.
        if (storeKey(this.context.current()) === store) {
          void this.router.navigate(['/quotes', quote.quoteId]);
        }
      },
      error: (error: unknown) => {
        this.inFlight.set(false);
        this.lastFailure.set({ failure: toApiFailure(error), request, store });
        void this.router.navigate(['/cart']);
      },
    });
  }

  dismiss(): void {
    this.lastFailure.set(null);
  }
}
