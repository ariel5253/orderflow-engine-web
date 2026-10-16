import { DOCUMENT, EnvironmentProviders, Injectable, Provider, inject, provideAppInitializer } from '@angular/core';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

/** One dictionary per language in public/i18n. Adding a language means adding one file and one entry here. */
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'es';

/** The dictionary key that names the locale Intl uses for money, numbers and dates (SPEC §9). */
export const FORMAT_LOCALE_KEY = 'app.formatLocale';

export function resolveLanguage(requested: string | null | undefined): Language {
  return SUPPORTED_LANGUAGES.find((language) => language === requested) ?? DEFAULT_LANGUAGE;
}

/** The active language, and the ES/EN switch of the shell: it changes the language at run time (SPEC §9). */
@Injectable({ providedIn: 'root' })
export class ActiveLanguage {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  /** Read inside a computed or a template, it follows the switch. */
  current(): Language {
    return resolveLanguage(this.translate.getCurrentLang());
  }

  /** Every later API call sends this language, so the problem texts arrive in it. */
  use(language: Language): void {
    this.document.documentElement.lang = language;
    this.translate.use(language);
  }
}

/**
 * Text comes from the runtime dictionaries; the active language is read once from `?lang=`, Spanish otherwise.
 * The dictionaries load through HttpBackend, so they never pass the API interceptor.
 */
export function provideLanguage(): (Provider | EnvironmentProviders)[] {
  return [
    provideTranslateService(),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json', useHttpBackend: true, failOnError: true }),
    provideAppInitializer(() => {
      const document = inject(DOCUMENT);
      const language = resolveLanguage(new URLSearchParams(document.location.search).get('lang'));
      document.documentElement.lang = language;
      return firstValueFrom(inject(TranslateService).use(language));
    }),
  ];
}
