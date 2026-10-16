import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, signal } from '@angular/core';

/** The contract has no image field, so a product image is looked up by SKU (SPEC §10.2). */
export function productImagePath(sku: string): string {
  return `/products/${encodeURIComponent(sku)}.svg`;
}

export const PLACEHOLDER_IMAGE = '/products/placeholder.svg';

/**
 * The only way to draw a product image (SPEC §10.2): one aspect ratio, the picture contained in it whatever its own
 * proportions, and the placeholder when the image fails to load.
 */
@Component({
  selector: 'ui-product-image',
  templateUrl: './ui-product-image.html',
  styleUrl: './ui-product-image.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiProductImage {
  readonly sku = input.required<string>();

  private readonly failedSku = signal<string | null>(null);

  protected readonly src = computed(() =>
    this.failedSku() === this.sku() ? PLACEHOLDER_IMAGE : productImagePath(this.sku()),
  );

  protected fallBack(): void {
    this.failedSku.set(this.sku());
  }
}
