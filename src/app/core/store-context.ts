import { HttpBackend, HttpClient } from '@angular/common/http';
import { EnvironmentProviders, Injectable, inject, provideAppInitializer, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BROWSER_STORAGE, readStored, writeStored } from './browser-storage';

/** A seeded demo store: the tenant and the customer the API headers carry (SPEC A-06). The name is data. */
export interface Store {
  readonly tenantId: string;
  readonly customerId: string;
  readonly name: string;
}

export const STORES_URL = '/config/stores.json';

const SELECTED_STORE = 'store';

/** One store, as a key: its tenant and its customer. */
export function storeKey(store: Store): string {
  return `${store.tenantId}/${store.customerId}`;
}

/**
 * The store every API call speaks for. Authentication is out of scope, so a configured store stands in for it, chosen
 * in the store picker and remembered in the browser.
 */
@Injectable({ providedIn: 'root' })
export class StoreContext {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly configured = signal<readonly Store[]>([]);
  private readonly selected = signal<Store | null>(null);

  /** The configured stores, in the order of the configuration. */
  readonly stores = this.configured.asReadonly();

  /** Takes the configured stores and selects the one chosen last in this browser, or else the first. */
  load(stores: readonly Store[]): void {
    const [first] = stores;
    if (!first) {
      throw new Error(`${STORES_URL} lists no store`);
    }
    const remembered = readStored<string>(this.storage, SELECTED_STORE);
    this.configured.set(stores);
    this.selected.set(stores.find((store) => storeKey(store) === remembered) ?? first);
  }

  /** Selects one of the configured stores; the next API call speaks for it. */
  select(store: Store): void {
    if (!this.configured().some((candidate) => storeKey(candidate) === storeKey(store))) {
      throw new Error(`Not a configured store: ${storeKey(store)}`);
    }
    this.selected.set(store);
    writeStored(this.storage, SELECTED_STORE, storeKey(store));
  }

  /** The selected store. Read inside a computed or a template, it follows the picker. */
  current(): Store {
    const store = this.selected();
    if (!store) {
      throw new Error('The store context is not initialized');
    }
    return store;
  }
}

/** Loads the configured stores before the first screen renders, outside the API interceptor. */
export function provideStoreContext(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const http = new HttpClient(inject(HttpBackend));
    const context = inject(StoreContext);
    return firstValueFrom(http.get<Store[]>(STORES_URL)).then((stores) => context.load(stores));
  });
}
