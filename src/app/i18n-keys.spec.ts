import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';
import appTemplate from './app.html' with { loader: 'text' };
import { FORMAT_LOCALE_KEY, Language, SUPPORTED_LANGUAGES } from './core/language';
import { COUNT_FORMS, DISCOUNT_ORIGIN_KINDS, QUOTE_STATUSES, enumKey, lineCountKey } from './pages/order-summary/order-summary-keys';
import orderSummaryTemplate from './pages/order-summary/order-summary.html' with { loader: 'text' };
import actionBarTemplate from './ui/ui-action-bar/ui-action-bar.html' with { loader: 'text' };
import problemNoticeTemplate from './ui/ui-problem-notice/ui-problem-notice.html' with { loader: 'text' };
import productImageTemplate from './ui/ui-product-image/ui-product-image.html' with { loader: 'text' };
import textTemplate from './ui/ui-text/ui-text.html' with { loader: 'text' };

/**
 * Every component template, by its path under src/app. scripts/no-literal-text.mjs fails when a template is missing
 * here, so no screen can use a key this spec does not see.
 */
const TEMPLATES: Readonly<Record<string, string>> = {
  'app.html': appTemplate,
  'pages/order-summary/order-summary.html': orderSummaryTemplate,
  'ui/ui-action-bar/ui-action-bar.html': actionBarTemplate,
  'ui/ui-problem-notice/ui-problem-notice.html': problemNoticeTemplate,
  'ui/ui-product-image/ui-product-image.html': productImageTemplate,
  'ui/ui-text/ui-text.html': textTemplate,
};

const DICTIONARIES: Readonly<Record<Language, unknown>> = { es, en };

/** A literal key: 'orderSummary.title' | translate */
const LITERAL_KEY = /'([^'\s]+)'\s*\|\s*translate\b/g;
/** A key built at run time from an API value or a count, through enumKey. */
const BUILT_KEY = /\b(statusKey|originKey|linesKey)\([^()]*\)\s*\|\s*translate\b/g;
const ANY_TRANSLATE = /\|\s*translate\b/g;

/** The keys built at run time, for every value the contract allows (status, discount origin kind) and each count form. */
const BUILT_KEYS = [
  ...QUOTE_STATUSES.map((status) => enumKey('status', status)),
  ...DISCOUNT_ORIGIN_KINDS.map((kind) => enumKey('origin', kind)),
  ...COUNT_FORMS.map((form) => enumKey('lines', form)),
];

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

  it('every key the code uses exists, including the keys built from status and origin values', () => {
    for (const key of usedKeys()) {
      for (const language of SUPPORTED_LANGUAGES) {
        expect(flat[language].has(key), `${language}: ${key}`).toBe(true);
      }
    }
  });

  it('every count, in every formatting locale, picks one of the count forms the dictionaries write', () => {
    const forms = new Set(COUNT_FORMS.map((form) => enumKey('lines', form)));
    for (const language of SUPPORTED_LANGUAGES) {
      const locale = String(flat[language].get(FORMAT_LOCALE_KEY));
      for (const count of [0, 1, 2, 21, 1_000_000]) {
        expect(forms.has(lineCountKey(count, locale)), `${locale}: ${count}`).toBe(true);
      }
      expect(lineCountKey(1, locale)).toBe(enumKey('lines', 'one'));
      expect(lineCountKey(2, locale)).toBe(enumKey('lines', 'other'));
    }
  });

  it('no key is unused', () => {
    const used = usedKeys();
    expect([...flat.es.keys()].filter((key) => !used.has(key))).toEqual([]);
  });
});
