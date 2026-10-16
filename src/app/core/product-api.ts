import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/*
 * The product list of the API contract (E-07): what the selected store's tenant sells, sorted by SKU, with the
 * currency once. A list price is a decimal string at the currency's scale, shown as it arrives: only a quote prices.
 */

export interface Product {
  readonly sku: string;
  readonly description: string;
  readonly listPrice: string;
  readonly taxRate: string;
}

export interface ProductList {
  readonly currency: string;
  readonly items: readonly Product[];
}

@Injectable({ providedIn: 'root' })
export class ProductApi {
  private readonly http = inject(HttpClient);

  /** E-07: the tenant's products. Read on every visit to the cart, so the cart lists exactly what the API prices. */
  list(): Observable<ProductList> {
    return this.http.get<ProductList>('/api/v1/products');
  }
}
