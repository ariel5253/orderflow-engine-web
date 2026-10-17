import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { apiHeadersInterceptor } from './core/api-headers.interceptor';
import { provideLanguage } from './core/language';
import { provideStoreContext } from './core/store-context';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([apiHeadersInterceptor])),
    provideLanguage(),
    provideStoreContext(),
  ],
};
