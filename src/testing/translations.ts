import { EnvironmentProviders, Provider, provideAppInitializer } from '@angular/core';
import { TranslateLoader, TranslationObject, provideTranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';
import { Language, PAGE_QUERY, startLanguage } from '../app/core/language';

/** The real dictionaries, imported at build time, so specs never request them through HttpClient. */
export const DICTIONARIES: Readonly<Record<Language, TranslationObject>> = { es, en };

class DictionaryLoader implements TranslateLoader {
  getTranslation(language: string): Observable<TranslationObject> {
    return of(DICTIONARIES[language as Language]);
  }
}

export function provideTestTranslations(language: Language = 'es'): (Provider | EnvironmentProviders)[] {
  return provideTranslateService({ lang: language, loader: provideTranslateLoader(DictionaryLoader) });
}

/**
 * The real dictionaries with the client's own start, as on a visit to a page with this query string: the language
 * comes from the same initializer the client runs in the browser.
 */
export function provideVisitTranslations(query: string): (Provider | EnvironmentProviders)[] {
  return [
    provideTranslateService({ loader: provideTranslateLoader(DictionaryLoader) }),
    { provide: PAGE_QUERY, useValue: query },
    provideAppInitializer(startLanguage),
  ];
}
