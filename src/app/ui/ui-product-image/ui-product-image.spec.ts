import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { PLACEHOLDER_IMAGE, UiProductImage, productImagePath } from './ui-product-image';

@Component({
  imports: [UiProductImage],
  template: `
    <div class="grid">
      @for (sku of skus; track sku) {
        <ui-product-image [sku]="sku" />
      }
    </div>
  `,
  styles: '.grid { display: grid; grid-template-columns: repeat(4, 88px); gap: 8px; }',
})
class ImageGrid {
  skus: string[] = [];
}

async function render(skus: string[]): Promise<ComponentFixture<ImageGrid>> {
  await page.viewport(768, 1024);
  const fixture = TestBed.createComponent(ImageGrid);
  fixture.componentInstance.skus = skus;
  await fixture.whenStable();
  return fixture;
}

function images(fixture: ComponentFixture<ImageGrid>): HTMLImageElement[] {
  return [...fixture.nativeElement.querySelectorAll('ui-product-image img')];
}

async function loaded(fixture: ComponentFixture<ImageGrid>): Promise<void> {
  await vi.waitFor(async () => {
    await fixture.whenStable();
    for (const img of images(fixture)) {
      expect(img.complete && img.naturalWidth > 0, img.src).toBe(true);
    }
  });
}

describe('ui-product-image', () => {
  it('renders images of four different intrinsic ratios as identical squares', async () => {
    const fixture = await render(['BEV-COLA-350', 'BEV-COLA-1500', 'SNK-CHIPS-45', 'BEV-WATER-600']);
    await loaded(fixture);

    const ratios = images(fixture).map((img) => (img.naturalWidth / img.naturalHeight).toFixed(3));
    expect(new Set(ratios).size).toBe(4);

    const boxes = [...fixture.nativeElement.querySelectorAll('ui-product-image')].map((host: Element) =>
      host.getBoundingClientRect(),
    );
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeCloseTo(box.width, 1);
      expect(box.width).toBeCloseTo(boxes[0].width, 1);
    }
    for (const img of images(fixture)) {
      // The picture is contained in the square: never cropped, never stretched.
      expect(getComputedStyle(img).objectFit).toBe('contain');
      const host = img.parentElement!.getBoundingClientRect();
      const drawn = img.getBoundingClientRect();
      expect(drawn.width).toBeLessThanOrEqual(host.width);
      expect(drawn.height).toBeLessThanOrEqual(host.height);
    }
  });

  it('looks a product image up by SKU', async () => {
    const fixture = await render(['BEV-COLA-350']);
    expect(new URL(images(fixture)[0].src).pathname).toBe(productImagePath('BEV-COLA-350'));
    expect(productImagePath('BEV-COLA-350')).toBe('/products/BEV-COLA-350.svg');
  });

  it('falls back to the placeholder when the image is missing, in the same square', async () => {
    const fixture = await render(['BEV-COLA-350', 'NO-SUCH-SKU']);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(new URL(images(fixture)[1].src).pathname).toBe(PLACEHOLDER_IMAGE);
    });
    await loaded(fixture);

    const [known, missing] = [...fixture.nativeElement.querySelectorAll('ui-product-image')].map((host: Element) =>
      host.getBoundingClientRect(),
    );
    expect(missing.width).toBeCloseTo(known.width, 1);
    expect(missing.height).toBeCloseTo(known.height, 1);
  });
});
