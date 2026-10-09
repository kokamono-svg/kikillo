// =====================================================================
// auth.guard.ts
// Guards de rutas. Se usan con canMatch: si el usuario no tiene el rol,
// Angular ni siquiera descarga el código de esa pantalla.
// =====================================================================
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService, Rol } from './auth.service';

/** Deja pasar solo a usuarios con sesión y con alguno de los roles. */
export function requiereRol(...roles: Rol[]): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const u = auth.usuario();

    if (!auth.estaAutenticado() || !u) return router.createUrlTree(['/']);
    if (roles.includes(u.rol)) return true;
    // Tiene sesión pero no le toca esta pantalla: a su propio inicio
    return router.createUrlTree([auth.inicioDe(u.rol)]);
  };
}

/** Para el login: si ya hay sesión, manda directo a su pantalla. */
export const soloInvitados: CanMatchFn = () => {
  const auth = inject(AuthService);
  const u = auth.usuario();
  return auth.estaAutenticado() && u ? inject(Router).createUrlTree([auth.inicioDe(u.rol)]) : true;
};
