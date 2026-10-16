import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { page } from 'vitest/browser';
import { PRODUCTS, STORES, backend, button, expectRequest, openApp, settle, texts } from '../testing/app-harness';
import { DICTIONARIES } from '../testing/translations';
import { appConfig } from './app.config';
import { browserStorage } from './core/browser-storage';
import { ActiveLanguage, Language } from './core/language';
import { STORES_URL } from './core/store-context';

/*
 * The language a visit starts in (SPEC §9, AC-46): the ES/EN choice is kept in browser storage and restored on the
 * next visit; a supported ?lang= wins over it and replaces it; without storage, or with storage that throws, the client
 * starts in Spanish and the switch still works. Each visit runs the client's own start, as in the browser.
 */

/** Opens the cart as a visit with this query string, and checks that E-07 asks in the expected language. */
async function visit(query: string, expected: Language, storage?: Storage | null): Promise<ComponentFixture<unknown>> {
  const fixture = await openApp('/cart', { query, storage });
  expectRequest({ method: 'GET', url: '/api/v1/products', language: expected }).flush(PRODUCTS);
  await settle(fixture);
  return fixture;
}

/** A reload: the same browser storage, a new client. */
function reload(): void {
  backend().verify();
  TestBed.resetTestingModule();
}

/** A tap on the ES/EN switch of the shell. */
function choose(fixture: ComponentFixture<unknown>, label: 'ES' | 'EN'): void {
  button(fixture, label).click();
  TestBed.tick();
}

/** The screen, the page and the switch all speak this language. */
function expectLanguage(fixture: ComponentFixture<unknown>, language: Language): void {
  expect(texts(fixture, 'h1')).toEqual([language === 'es' ? 'Comprar' : 'Shop']);
  expect(document.documentElement.lang).toBe(language);
  expect(button(fixture, language.toUpperCase()).getAttribute('aria-pressed')).toBe('true');
}

/** Browser storage that throws on every access, as a blocked one does. */
function blockedStorage(): Storage {
  const blocked = (): never => {
    throw new DOMException('The storage is blocked', 'SecurityError');
  };
  return {
    get length(): number {
      return blocked();
    },
    clear: blocked,
    getItem: blocked,
    key: blocked,
    removeItem: blocked,
    setItem: blocked,
  };
}

describe('the remembered language (SPEC §9, AC-46)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(768, 1024);
  });
  afterEach(() => {
    backend().verify();
    localStorage.clear();
  });

  it('starts in Spanish on a first visit, and a reload keeps the ES/EN choice', async () => {
    const first = await visit('', 'es');
    expectLanguage(first, 'es');

    choose(first, 'EN');
    expectLanguage(first, 'en');
    reload();
    const second = await visit('', 'en');
    expectLanguage(second, 'en');

    choose(second, 'ES');
    reload();
    expectLanguage(await visit('', 'es'), 'es');
  });

  it('lets ?lang= win over the stored choice and replace it', async () => {
    choose(await visit('', 'es'), 'EN');
    reload();

    expectLanguage(await visit('?lang=es', 'es'), 'es');
    reload();
    expectLanguage(await visit('', 'es'), 'es');
    reload();

    expectLanguage(await visit('?store=1&lang=en', 'en'), 'en');
    reload();
    expectLanguage(await visit('', 'en'), 'en');
  });

  it('ignores a ?lang= the client has no dictionary for', async () => {
    expectLanguage(await visit('?lang=fr', 'es'), 'es');
    reload();

    choose(await visit('', 'es'), 'EN');
    reload();
    expectLanguage(await visit('?lang=fr', 'en'), 'en');
  });

  it('without browser storage, starts in Spanish, still switches, and remembers nothing', async () => {
    const fixture = await visit('', 'es', null);
    expectLanguage(fixture, 'es');
    choose(fixture, 'EN');
    expectLanguage(fixture, 'en');
    reload();

    expectLanguage(await visit('', 'es', null), 'es');
    reload();
    expectLanguage(await visit('?lang=en', 'en', null), 'en');
  });

  it('in a browser that refuses access to its storage at all, has none and starts in Spanish', async () => {
    const refusing = {
      get localStorage(): Storage {
        throw new DOMException('Access to storage is denied', 'SecurityError');
      },
    };
    const storage = browserStorage(refusing);
    expect(storage).toBeNull();

    const fixture = await visit('', 'es', storage);
    expectLanguage(fixture, 'es');
    choose(fixture, 'EN');
    expectLanguage(fixture, 'en');
  });

  it('with browser storage that throws on every access, starts in Spanish, still switches, and still takes ?lang=', async () => {
    const fixture = await visit('', 'es', blockedStorage());
    expectLanguage(fixture, 'es');
    choose(fixture, 'EN');
    expectLanguage(fixture, 'en');
    reload();

    expectLanguage(await visit('', 'es', blockedStorage()), 'es');
    reload();
    expectLanguage(await visit('?lang=en', 'en', blockedStorage()), 'en');
    expect(localStorage.length).toBe(0);
  });
});

/*
 * The same start through the client's own configuration (app.config), as main.ts boots it: the query string comes from
 * the page address, the choice from the page's localStorage, and the dictionary is requested from public/i18n. Only the
 * backend is simulated, so leaving the start out of the configuration, or reading the address wrongly, fails here.
 */
describe('the start of the client as configured for the browser (SPEC §9)', () => {
  const opened = location.href;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });
  afterEach(() => {
    history.replaceState(history.state, '', opened);
    localStorage.clear();
  });

  /** Boots app.config at the page address with this `lang` (none when null), and answers the files read at start. */
  async function boot(lang: string | null, expected: Language): Promise<void> {
    const address = new URL(opened);
    if (lang === null) {
      address.searchParams.delete('lang');
    } else {
      address.searchParams.set('lang', lang);
    }
    history.replaceState(history.state, '', address);
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const started = TestBed.inject(ApplicationInitStatus).donePromise;
    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url: `/i18n/${expected}.json` }, `the ${expected} dictionary`).flush(DICTIONARIES[expected]);
    http.expectOne({ method: 'GET', url: STORES_URL }, 'the store list').flush(STORES);
    await started;
    http.verify();
  }

  function expectStartedIn(language: Language): void {
    expect(TestBed.inject(TranslateService).getCurrentLang()).toBe(language);
    expect(TestBed.inject(ActiveLanguage).current()).toBe(language);
    expect(document.documentElement.lang).toBe(language);
  }

  it('starts in Spanish on a first visit to an address without ?lang=', async () => {
    await boot(null, 'es');
    expectStartedIn('es');
  });

  it('starts in the language of ?lang= in the page address, and the next visit without it keeps that choice', async () => {
    await boot('en', 'en');
    expectStartedIn('en');
    TestBed.resetTestingModule();

    await boot(null, 'en');
    expectStartedIn('en');
  });
});
