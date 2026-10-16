import { QuoteStatus } from '../../core/quote-api';

/*
 * Some dictionary keys are built at run time from a value the API sends or from a count. They are built here only,
 * so the template and i18n-keys.spec share one definition and every value the contract allows has its text.
 */

export const QUOTE_STATUSES: readonly QuoteStatus[] = ['OPEN', 'CONFIRMED', 'EXPIRED'];

/** The kinds of a discount origin ("TIER:<id>", "COMBO:<id>"). A gift is a line, never a discount. */
export const DISCOUNT_ORIGIN_KINDS: readonly string[] = ['TIER', 'COMBO'];

/** The forms of a count the dictionaries write: the singular and the plural. */
export const COUNT_FORMS: readonly string[] = ['one', 'other'];

export type EnumKeyGroup = 'status' | 'origin' | 'lines';

/** The dictionary key of an enum value: a quote status, the kind of a discount origin, or the form of a line count. */
export function enumKey(group: EnumKeyGroup, value: string): string {
  return `orderSummary.${group}.${value}`;
}

export function originKind(origin: string): string {
  return origin.split(':')[0];
}

/**
 * The key of the line count, from the plural category of the formatting locale: "one" is the singular, and every
 * other category is the plural. Spanish also has "many" (a million and up), which it writes like "other" here.
 */
export function lineCountKey(count: number, formatLocale: string): string {
  const form = new Intl.PluralRules(formatLocale).select(count) === 'one' ? 'one' : 'other';
  return enumKey('lines', form);
}
