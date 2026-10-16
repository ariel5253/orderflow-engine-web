import { Language, SUPPORTED_LANGUAGES } from './language';
import { PAYMENT_METHODS, PaymentMethod, QuoteStatus } from './quote-api';

/*
 * Some dictionary keys are built at run time from a value the API sends, from a count, or from the way out a screen
 * offers. They are built here only, so the templates and i18n-keys.spec share one definition and every value the
 * contract allows has its text.
 */

export const QUOTE_STATUSES: readonly QuoteStatus[] = ['OPEN', 'CONFIRMED', 'EXPIRED'];

/** An order is a confirmed quote: E-04 always answers CONFIRMED. */
export const ORDER_STATUSES: readonly QuoteStatus[] = ['CONFIRMED'];

/** The kinds of a discount origin ("TIER:<id>", "COMBO:<id>"). A gift is a line, never a discount. */
export const DISCOUNT_ORIGIN_KINDS: readonly string[] = ['TIER', 'COMBO'];

/** The forms of a count the dictionaries write: the singular and the plural. */
export const COUNT_FORMS: readonly string[] = ['one', 'other'];

/** Every way out a notice can offer (SPEC §10.4, §10.5), with its label. */
export const ACTION_KEYS = {
  retry: 'common.retry',
  review: 'cart.actions.review',
  payCash: 'quote.actions.payCash',
  requote: 'quote.actions.requote',
  viewOrder: 'quote.actions.viewOrder',
  edit: 'quote.actions.edit',
} as const;

export type NoticeAction = keyof typeof ACTION_KEYS;

export function statusKey(status: QuoteStatus): string {
  return `orderSummary.status.${status}`;
}

export function orderStatusKey(status: QuoteStatus): string {
  return `order.status.${status}`;
}

export function originKind(origin: string): string {
  return origin.split(':')[0];
}

export function originKey(origin: string): string {
  return `orderSummary.origin.${originKind(origin)}`;
}

export function paymentKey(method: PaymentMethod): string {
  return `paymentMethod.${method}`;
}

export function languageKey(language: Language): string {
  return `shell.language.${language}`;
}

export function languageNameKey(language: Language): string {
  return `shell.languageName.${language}`;
}

export function actionKey(action: NoticeAction): string {
  return ACTION_KEYS[action];
}

/**
 * The form of a count, from the plural category of the formatting locale: "one" is the singular, and every other
 * category is the plural. Spanish also has "many" (a million and up), which it writes like "other" here.
 */
export function countForm(count: number, formatLocale: string): string {
  return new Intl.PluralRules(formatLocale).select(count) === 'one' ? 'one' : 'other';
}

/** The key of a line count. */
export function lineCountKey(count: number, formatLocale: string): string {
  return `orderSummary.lines.${countForm(count, formatLocale)}`;
}

/** The key of a unit count. */
export function unitCountKey(count: number, formatLocale: string): string {
  return `cart.units.${countForm(count, formatLocale)}`;
}

/** Every key built at run time, for every value the contract allows and each count form. */
export const BUILT_KEYS: readonly string[] = [
  ...QUOTE_STATUSES.map(statusKey),
  ...ORDER_STATUSES.map(orderStatusKey),
  ...DISCOUNT_ORIGIN_KINDS.map((kind) => originKey(`${kind}:`)),
  ...PAYMENT_METHODS.map(paymentKey),
  ...SUPPORTED_LANGUAGES.map(languageKey),
  ...SUPPORTED_LANGUAGES.map(languageNameKey),
  ...Object.values(ACTION_KEYS),
  ...COUNT_FORMS.map((form) => `orderSummary.lines.${form}`),
  ...COUNT_FORMS.map((form) => `cart.units.${form}`),
];
