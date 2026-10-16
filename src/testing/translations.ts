import { EnvironmentProviders, Provider } from '@angular/core';
import { TranslateLoader, TranslationObject, provideTranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';
import { Language } from '../app/core/language';

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
