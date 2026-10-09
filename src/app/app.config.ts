import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsMx from '@angular/common/locales/es-MX';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

// Fechas, días y meses en español de México ("viernes 9 de octubre")
registerLocaleData(localeEsMx);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es-MX' },
    provideRouter(
      routes,
      // Al cambiar de página se regresa arriba; con "Atrás" vuelve a donde estaba
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Desvanecido suave entre páginas (los navegadores que no lo soportan cambian normal)
      withViewTransitions({ skipInitialTransition: true }),
      // Los parámetros de la URL (?codigo=...) llegan como input() del componente
      withComponentInputBinding(),
    ),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
