// =====================================================================
// auth.interceptor.ts
// Agrega "Authorization: Bearer <token>" a cada llamada a nuestra API.
// Si Flask responde 401 (token vencido o inválido), cierra la sesión.
// =====================================================================
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // El token solo se manda a nuestro backend, nunca a otros dominios
  if (!req.url.startsWith(auth.apiUrl)) return next(req);

  const token = auth.token();
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(peticion).pipe(
    catchError((e: unknown) => {
      const esLogin = req.url.endsWith('/auth/login');
      if (e instanceof HttpErrorResponse && e.status === 401 && !esLogin) auth.cerrarSesion();
      return throwError(() => e);
    })
  );
};
