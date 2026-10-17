import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store, StoreContext, storeKey } from '../core/store-context';
import { UiText } from '../ui/ui-text/ui-text';

interface TenantGroup {
  readonly tenantId: string;
  readonly stores: readonly Store[];
}

/**
 * The store picker (SPEC §10.1): the configured demo stores, grouped by tenant, behind a disclosure. A native select
 * would cut a long store name while closed; the disclosure shows it whole, open or closed. Choosing a store opens
 * its cart, and every later API call speaks for it.
 */
@Component({
  selector: 'app-store-picker',
  imports: [TranslatePipe, UiText],
  templateUrl: './store-picker.html',
  styleUrl: './store-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorePicker {
  private readonly context = inject(StoreContext);
  private readonly router = inject(Router);

  protected readonly current = computed(() => this.context.current());

  protected readonly groups = computed<readonly TenantGroup[]>(() => {
    const groups = new Map<string, Store[]>();
    for (const store of this.context.stores()) {
      groups.set(store.tenantId, [...(groups.get(store.tenantId) ?? []), store]);
    }
    return [...groups].map(([tenantId, stores]) => ({ tenantId, stores }));
  });

  protected readonly storeKey = storeKey;

  protected isCurrent(store: Store): boolean {
    return storeKey(store) === storeKey(this.current());
  }

  protected choose(store: Store, disclosure: HTMLDetailsElement): void {
    this.close(disclosure);
    this.context.select(store);
    void this.router.navigate(['/cart']);
  }

  /** Closes the disclosure and gives the focus back to its summary, so the keyboard keeps its place. */
  protected close(disclosure: HTMLDetailsElement): void {
    disclosure.open = false;
    disclosure.querySelector('summary')?.focus();
  }
}
