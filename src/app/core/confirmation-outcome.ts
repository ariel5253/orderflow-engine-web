import { Injectable } from '@angular/core';

/** How E-03 answered: a new order, or the replay of one already recorded under the same key (SPEC §10.4). */
export type ConfirmationOutcome = 'created' | 'replayed';

/**
 * Hands the outcome of a confirmation to the order screen that opens right after it. It is read once and lives in
 * memory only, so a reload or a later visit to the same order shows no notice.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmationOutcomes {
  private pending: { readonly orderId: string; readonly outcome: ConfirmationOutcome } | null = null;

  hand(orderId: string, outcome: ConfirmationOutcome): void {
    this.pending = { orderId, outcome };
  }

  /** The outcome of the confirmation that opened this order, once. */
  take(orderId: string): ConfirmationOutcome | null {
    const pending = this.pending;
    this.pending = null;
    return pending?.orderId === orderId ? pending.outcome : null;
  }
}
