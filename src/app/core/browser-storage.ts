import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/*
 * The client's own state in the browser: the selected store, the ES/EN choice, one cart per store, and the
 * idempotency key of each quote's confirmation. Storage can be missing or blocked (a private window, cleared data):
 * every read falls back to nothing and every write is skipped, so the screens keep working on what they hold in memory.
 */

/**
 * The storage of a browser window, or null when there is none. A browser that blocks site data throws on the mere
 * access to `localStorage`, so the access itself is guarded.
 */
export function browserStorage(view: Pick<Window, 'localStorage'> | null | undefined): Storage | null {
  try {
    return view?.localStorage ?? null;
  } catch {
    return null;
  }
}

export const BROWSER_STORAGE = new InjectionToken<Storage | null>('BROWSER_STORAGE', {
  providedIn: 'root',
  factory: () => browserStorage(inject(DOCUMENT).defaultView),
});

/** Every key this client writes starts with this prefix. */
export const STORAGE_PREFIX = 'orderflow.';

export function readStored<T>(storage: Storage | null, key: string): T | null {
  try {
    const raw = storage?.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStored(storage: Storage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the value lives in memory until the page is closed.
  }
}
