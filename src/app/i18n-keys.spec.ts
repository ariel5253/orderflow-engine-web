import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';
import appTemplate from './app.html' with { loader: 'text' };
import breakdownLinesTemplate from './breakdown/breakdown-lines.html' with { loader: 'text' };
import breakdownTotalsTemplate from './breakdown/breakdown-totals.html' with { loader: 'text' };
import { BUILT_KEYS, COUNT_FORMS, lineCountKey, unitCountKey } from './core/dictionary-keys';
import { FORMAT_LOCALE_KEY, Language, SUPPORTED_LANGUAGES } from './core/language';
import cartTemplate from './pages/cart/cart.html' with { loader: 'text' };
import orderSummaryTemplate from './pages/order-summary/order-summary.html' with { loader: 'text' };
import orderTemplate from './pages/order/order.html' with { loader: 'text' };
import shellHeaderTemplate from './shell/shell-header.html' with { loader: 'text' };
import storePickerTemplate from './shell/store-picker.html' with { loader: 'text' };
import actionBarTemplate from './ui/ui-action-bar/ui-action-bar.html' with { loader: 'text' };
import noticeTemplate from './ui/ui-notice/ui-notice.html' with { loader: 'text' };
import problemNoticeTemplate from './ui/ui-problem-notice/ui-problem-notice.html' with { loader: 'text' };
import productImageTemplate from './ui/ui-product-image/ui-product-image.html' with { loader: 'text' };
import textTemplate from './ui/ui-text/ui-text.html' with { loader: 'text' };

/**
 * Every component template, by its path under src/app. scripts/no-literal-text.mjs fails when a template is missing
 * here, so no screen can use a key this spec does not see.
 */
const TEMPLATES: Readonly<Record<string, string>> = {
  'app.html': appTemplate,
  'breakdown/breakdown-lines.html': breakdownLinesTemplate,
  'breakdown/breakdown-totals.html': breakdownTotalsTemplate,
  'pages/cart/cart.html': cartTemplate,
  'pages/order-summary/order-summary.html': orderSummaryTemplate,
  'pages/order/order.html': orderTemplate,
  'shell/shell-header.html': shellHeaderTemplate,
  'shell/store-picker.html': storePickerTemplate,
  'ui/ui-action-bar/ui-action-bar.html': actionBarTemplate,
  'ui/ui-notice/ui-notice.html': noticeTemplate,
  'ui/ui-problem-notice/ui-problem-notice.html': problemNoticeTemplate,
  'ui/ui-product-image/ui-product-image.html': productImageTemplate,
  'ui/ui-text/ui-text.html': textTemplate,
};

const DICTIONARIES: Readonly<Record<Language, unknown>> = { es, en };

/** A literal key: 'orderSummary.title' | translate */
const LITERAL_KEY = /'([^'\s]+)'\s*\|\s*translate\b/g;
/** A key built at run time from an API value, a count, a language or a way out, through core/dictionary-keys. */
const BUILT_KEY =
  /\b(statusKey|orderStatusKey|originKey|paymentKey|languageKey|languageNameKey|actionKey|linesKey|unitsKey)\([^()]*\)\s*\|\s*translate\b/g;
const ANY_TRANSLATE = /\|\s*translate\b/g;

function flatten(node: unknown, prefix = '', entries = new Map<string, unknown>()): Map<string, unknown> {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, entries);
    }
  } else {
    entries.set(prefix, node);
  }
  return entries;
}

function matches(pattern: RegExp, text: string): RegExpExecArray[] {
  return [...text.matchAll(pattern)];
}

/** Every key the code uses: literal keys in templates, the keys built from enum values, and the formatting locale. */
function usedKeys(): Set<string> {
  const keys = new Set<string>([FORMAT_LOCALE_KEY, ...BUILT_KEYS]);
  for (const template of Object.values(TEMPLATES)) {
    for (const [, key] of matches(LITERAL_KEY, template)) {
      keys.add(key);
    }
  }
  return keys;
}

function parameters(text: unknown): string[] {
  return [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(([, name]) => name).sort();
}

describe('i18n dictionaries (AC-46)', () => {
  const flat = Object.fromEntries(SUPPORTED_LANGUAGES.map((language) => [language, flatten(DICTIONARIES[language])])) as Record<
    Language,
    Map<string, unknown>
  >;

  it('es and en have the same keys', () => {
    expect([...flat.en.keys()].sort()).toEqual([...flat.es.keys()].sort());
  });

  it('every value is a non-empty text, with the same parameters in every language', () => {
    for (const [key, value] of flat.es) {
      for (const language of SUPPORTED_LANGUAGES) {
        const text = flat[language].get(key);
        expect(typeof text === 'string' && text.trim().length > 0, `${language}: ${key}`).toBe(true);
        expect(parameters(text), `${language}: ${key}`).toEqual(parameters(value));
      }
    }
  });

  it('each dictionary sets app.formatLocale: es-419 for es and en for en', () => {
    expect(flat.es.get(FORMAT_LOCALE_KEY)).toBe('es-419');
    expect(flat.en.get(FORMAT_LOCALE_KEY)).toBe('en');
  });

  it('every translate in a template takes a literal key or a key built from an enum value', () => {
    for (const [path, template] of Object.entries(TEMPLATES)) {
      const all = matches(ANY_TRANSLATE, template).length;
      const known = matches(LITERAL_KEY, template).length + matches(BUILT_KEY, template).length;
      expect(known, path).toBe(all);
    }
  });

  it('every key the code uses exists, including the keys built from status, origin, payment method, language and action values', () => {
    for (const key of usedKeys()) {
      for (const language of SUPPORTED_LANGUAGES) {
        expect(flat[language].has(key), `${language}: ${key}`).toBe(true);
      }
    }
  });

  it('every count, in every formatting locale, picks one of the count forms the dictionaries write', () => {
    for (const [group, countKey] of [
      ['orderSummary.lines', lineCountKey],
      ['cart.units', unitCountKey],
    ] as const) {
      const forms = new Set(COUNT_FORMS.map((form) => `${group}.${form}`));
      for (const language of SUPPORTED_LANGUAGES) {
        const locale = String(flat[language].get(FORMAT_LOCALE_KEY));
        for (const count of [0, 1, 2, 21, 1_000_000]) {
          expect(forms.has(countKey(count, locale)), `${locale}: ${count}`).toBe(true);
        }
        expect(countKey(1, locale)).toBe(`${group}.one`);
        expect(countKey(2, locale)).toBe(`${group}.other`);
      }
    }
  });

  it('no key is unused', () => {
    const used = usedKeys();
    expect([...flat.es.keys()].filter((key) => !used.has(key))).toEqual([]);
  });
});
