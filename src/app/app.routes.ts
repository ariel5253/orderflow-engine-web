import { Routes } from '@angular/router';
import { CartPage } from './pages/cart/cart';
import { HistoryPage } from './pages/history/history';
import { OrderSummaryPage } from './pages/order-summary/order-summary';
import { OrderPage } from './pages/order/order';

/** The screens of SPEC §10.1. Any other path opens the cart. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'cart' },
  { path: 'cart', component: CartPage },
  { path: 'quotes/:quoteId', component: OrderSummaryPage },
  { path: 'orders', component: HistoryPage },
  { path: 'orders/:orderId', component: OrderPage },
  { path: '**', redirectTo: 'cart' },
];
