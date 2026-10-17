import { Routes } from '@angular/router';
import { OrderSummaryPage } from './pages/order-summary/order-summary';

export const routes: Routes = [{ path: 'quotes/:quoteId', component: OrderSummaryPage }];
