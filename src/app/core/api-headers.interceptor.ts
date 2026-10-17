import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { resolveLanguage } from './language';
import { StoreContext } from './store-context';

/** The client calls only relative paths under this prefix; whoever serves it forwards them to the API. */
export const API_PATH_PREFIX = '/api/';

/**
 * The only place that sets the API headers: the store's tenant and customer, and the active language, so problem
 * texts arrive in the language of the screen. Screens never set headers. Other requests pass unchanged.
 */
export const apiHeadersInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_PATH_PREFIX)) {
    return next(request);
  }
  const store = inject(StoreContext).current();
  const language = resolveLanguage(inject(TranslateService).getCurrentLang());
  return next(
    request.clone({
      setHeaders: {
        'X-Tenant-Id': store.tenantId,
        'X-Customer-Id': store.customerId,
        'Accept-Language': language,
      },
    }),
  );
};
