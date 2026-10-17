import { DOCUMENT, EnvironmentProviders, Injectable, InjectionToken, Provider, inject, provideAppInitializer } from '@angular/core';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';
import { BROWSER_STORAGE, readStored, writeStored } from './browser-storage';

/** One dictionary per language in public/i18n. Adding a language means adding one file and one entry here. */
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'es';

/** The dictionary key that names the locale Intl uses for money, numbers and dates (SPEC §9). */
export const FORMAT_LOCALE_KEY = 'app.formatLocale';

export function isLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.some((language) => language === value);
}

export function resolveLanguage(requested: string | null | undefined): Language {
  return isLanguage(requested) ? requested : DEFAULT_LANGUAGE;
}

/** The browser storage key of the ES/EN choice, kept for the next visit (SPEC §9). */
const CHOSEN_LANGUAGE = 'language';

/**
 * The language a visit starts in (SPEC §9): a supported `?lang=` wins and replaces the stored choice; otherwise the
 * choice stored by an earlier visit; otherwise Spanish. A `?lang=` with no dictionary is ignored, so a mistyped link
 * never drops the stored choice. Storage that is missing or throws holds nothing and keeps nothing.
 */
export function initialLanguage(query: string, storage: Storage | null): Language {
  const requested = new URLSearchParams(query).get('lang');
  if (isLanguage(requested)) {
    writeStored(storage, CHOSEN_LANGUAGE, requested);
    return requested;
  }
  const stored = readStored<unknown>(storage, CHOSEN_LANGUAGE);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

/** The active language, and the ES/EN switch of the shell: it changes the language at run time (SPEC §9). */
@Injectable({ providedIn: 'root' })
export class ActiveLanguage {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(BROWSER_STORAGE);

  /** Read inside a computed or a template, it follows the switch. */
  current(): Language {
    return resolveLanguage(this.translate.getCurrentLang());
  }

  /** Every later API call sends this language, so the problem texts arrive in it; the next visit starts in it. */
  use(language: Language): void {
    this.document.documentElement.lang = language;
    this.translate.use(language);
    writeStored(this.storage, CHOSEN_LANGUAGE, language);
  }
}

/** The query string of the page the client opened at, such as `?lang=en`. Specs provide their own. */
export const PAGE_QUERY = new InjectionToken<string>('PAGE_QUERY', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).location.search,
});

/** Sets the language a visit starts in, before the first screen renders. */
export function startLanguage(): Promise<unknown> {
  const language = initialLanguage(inject(PAGE_QUERY), inject(BROWSER_STORAGE));
  inject(DOCUMENT).documentElement.lang = language;
  return firstValueFrom(inject(TranslateService).use(language));
}

/**
 * Text comes from the runtime dictionaries; a visit starts in the language of `?lang=`, else the one chosen on an
 * earlier visit, else Spanish. The dictionaries load through HttpBackend, so they never pass the API interceptor.
 */
export function provideLanguage(): (Provider | EnvironmentProviders)[] {
  return [
    provideTranslateService(),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json', useHttpBackend: true, failOnError: true }),
    provideAppInitializer(startLanguage),
  ];
}
