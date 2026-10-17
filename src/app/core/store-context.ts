import { HttpBackend, HttpClient } from '@angular/common/http';
import { EnvironmentProviders, Injectable, inject, provideAppInitializer, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** A seeded demo store: the tenant and the customer the API headers carry (SPEC A-06). The name is data. */
export interface Store {
  readonly tenantId: string;
  readonly customerId: string;
  readonly name: string;
}

export const STORES_URL = '/config/stores.json';

/** The store every API call speaks for. Authentication is out of scope, so a configured store stands in for it. */
@Injectable({ providedIn: 'root' })
export class StoreContext {
  private readonly selected = signal<Store | null>(null);

  /** Selects the first configured store. */
  useFirstOf(stores: readonly Store[]): void {
    const [first] = stores;
    if (!first) {
      throw new Error(`${STORES_URL} lists no store`);
    }
    this.selected.set(first);
  }

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
    return firstValueFrom(http.get<Store[]>(STORES_URL)).then((stores) => context.useFirstOf(stores));
  });
}
