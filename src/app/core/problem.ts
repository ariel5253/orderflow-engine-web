import { HttpErrorResponse } from '@angular/common/http';

/** An RFC 9457 problem as the API sends it. Its title and detail are already in the request's language. */
export interface Problem {
  readonly type?: string;
  readonly title: string;
  readonly detail: string;
  readonly status: number;
  readonly code: string;
  readonly correlationId: string;
  readonly instance?: string;
}

/**
 * A failed API call (SPEC §10.5):
 * - problem: the API's problem body, shown as sent;
 * - noAnswer: no response, or a 5xx without a problem body, such as a proxy 502, 503 or 504. "Retry" repeats it;
 * - unexpectedAnswer: any other status without a problem body, such as a misrouted proxy's 404 page. The API never
 *   answers that way, so repeating the request would only repeat the answer: it is not retried, and its way out is the
 *   screen's default action of SPEC §10.5. Both kinds without a problem body show the web text problem.network, the
 *   only failure text the web dictionaries hold (SPEC §9).
 */
export type ApiFailure =
  | { readonly kind: 'problem'; readonly problem: Problem }
  | { readonly kind: 'noAnswer' }
  | { readonly kind: 'unexpectedAnswer' };

const RETRYABLE_CODES: ReadonlySet<string> = new Set(['IDEMPOTENCY_KEY_IN_PROGRESS', 'INTERNAL_ERROR']);

export function toApiFailure(error: unknown): ApiFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'noAnswer' };
  }
  if (isProblem(error.error)) {
    return { kind: 'problem', problem: error.error };
  }
  return error.status === 0 || error.status >= 500 ? { kind: 'noAnswer' } : { kind: 'unexpectedAnswer' };
}

/** The failures whose way out is "Retry": the same request again (SPEC §10.5). */
export function isRetryable(failure: ApiFailure): boolean {
  switch (failure.kind) {
    case 'noAnswer':
      return true;
    case 'unexpectedAnswer':
      return false;
    case 'problem':
      return RETRYABLE_CODES.has(failure.problem.code);
  }
}

function isProblem(body: unknown): body is Problem {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return ['title', 'detail', 'code', 'correlationId'].every((field) => typeof candidate[field] === 'string');
}
