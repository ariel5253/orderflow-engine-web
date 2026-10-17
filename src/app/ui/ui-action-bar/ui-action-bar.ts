import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  InjectionToken,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';

/** What the action bar needs from window.visualViewport. Specs provide a simulated one. */
export interface VisualViewportPort {
  readonly height: number;
  readonly offsetTop: number;
  addEventListener(type: 'resize' | 'scroll', listener: () => void): void;
  removeEventListener(type: 'resize' | 'scroll', listener: () => void): void;
}

export const VISUAL_VIEWPORT = new InjectionToken<VisualViewportPort | null>('VISUAL_VIEWPORT', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView?.visualViewport ?? null,
});

/**
 * Holds each screen's primary action and keeps it reachable (SPEC §10.2): sticky to the bottom, padded with the
 * safe-area insets, and lifted above the on-screen keyboard by following the visual viewport. Every control it holds
 * gets a touch target of at least 44 x 44 px.
 */
@Component({
  selector: 'ui-action-bar',
  templateUrl: './ui-action-bar.html',
  styleUrl: './ui-action-bar.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.bottom.px]': 'keyboardOffset()' },
})
export class UiActionBar {
  /** The height of the layout viewport that the keyboard covers. */
  protected readonly keyboardOffset = signal(0);

  constructor() {
    const viewport = inject(VISUAL_VIEWPORT);
    const window = inject(DOCUMENT).defaultView;
    if (!viewport || !window) {
      return;
    }
    const follow = (): void => {
      const covered = window.innerHeight - (viewport.height + viewport.offsetTop);
      this.keyboardOffset.set(Math.max(0, Math.round(covered)));
    };
    viewport.addEventListener('resize', follow);
    viewport.addEventListener('scroll', follow);
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', follow);
      viewport.removeEventListener('scroll', follow);
    });
    follow();
  }
}
