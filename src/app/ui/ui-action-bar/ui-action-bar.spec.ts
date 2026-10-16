import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import hostPage from '../../../index.html' with { loader: 'text' };
import barStyles from './ui-action-bar.css' with { loader: 'text' };
import { UiActionBar, VISUAL_VIEWPORT, VisualViewportPort } from './ui-action-bar';

/** Stands in for window.visualViewport: a desktop browser cannot raise an on-screen keyboard. */
class SimulatedVisualViewport extends EventTarget implements VisualViewportPort {
  height = window.innerHeight;
  offsetTop = 0;

  showKeyboard(keyboardHeight: number): void {
    this.height = window.innerHeight - keyboardHeight;
    this.dispatchEvent(new Event('resize'));
  }

  hideKeyboard(): void {
    this.height = window.innerHeight;
    this.dispatchEvent(new Event('resize'));
  }
}

@Component({
  imports: [UiActionBar],
  template: `
    <div class="content"></div>
    <ui-action-bar>
      <div class="controls">
        <button type="button" aria-label="first">1</button>
        <a href="#top" aria-label="second">2</a>
      </div>
    </ui-action-bar>
  `,
  styles: '.content { height: 2000px; } .controls { display: flex; gap: 8px; font-size: 12px; line-height: 14px; }',
})
class ScreenWithBar {}

async function render(viewport: SimulatedVisualViewport): Promise<ComponentFixture<ScreenWithBar>> {
  await page.viewport(375, 812);
  TestBed.configureTestingModule({ providers: [{ provide: VISUAL_VIEWPORT, useValue: viewport }] });
  const fixture = TestBed.createComponent(ScreenWithBar);
  await fixture.whenStable();
  return fixture;
}

function bar(fixture: ComponentFixture<ScreenWithBar>): DOMRect {
  return fixture.nativeElement.querySelector('ui-action-bar').getBoundingClientRect();
}

describe('ui-action-bar', () => {
  it('sits at the bottom of the viewport, then stays above a 300 px keyboard', async () => {
    const viewport = new SimulatedVisualViewport();
    const fixture = await render(viewport);
    expect(bar(fixture).bottom).toBeCloseTo(window.innerHeight, 0);

    viewport.showKeyboard(300);
    await fixture.whenStable();
    const keyboardTop = window.innerHeight - 300;
    expect(bar(fixture).bottom).toBeLessThanOrEqual(keyboardTop + 0.5);
    expect(bar(fixture).bottom).toBeGreaterThanOrEqual(keyboardTop - 0.5);

    viewport.hideKeyboard();
    await fixture.whenStable();
    expect(bar(fixture).bottom).toBeCloseTo(window.innerHeight, 0);
  });

  it('gives every control it holds at least 44 x 44 px at 375 px', async () => {
    const fixture = await render(new SimulatedVisualViewport());
    const controls = [...fixture.nativeElement.querySelectorAll('ui-action-bar button, ui-action-bar a')];
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      const box = control.getBoundingClientRect();
      expect(box.width, control.outerHTML).toBeGreaterThanOrEqual(44);
      expect(box.height, control.outerHTML).toBeGreaterThanOrEqual(44);
    }
  });

  it('pads with the safe-area insets, which the host page enables with viewport-fit=cover', () => {
    expect(barStyles).toContain('env(safe-area-inset-bottom)');
    expect(barStyles).toContain('env(safe-area-inset-left)');
    expect(barStyles).toContain('env(safe-area-inset-right)');
    expect(hostPage).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });
});
