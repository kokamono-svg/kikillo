import { Routes } from '@angular/router';
import { LoginComponent } from './login.component/login.component';
import { requiereRol, soloInvitados } from './auth/auth.guard';

// Cada panel solo lo abre su rol (el administrador puede entrar a todos).
// canMatch evita incluso descargar el código de un panel ajeno.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: LoginComponent,
    canMatch: [soloInvitados],
  },
  {
    path: 'dashboard',
    canMatch: [requiereRol('admin')],
    loadChildren: () => import('./dashboard.component/dashboard.routes').then((m) => m.routes),
  },
  {
    path: 'rh',
    canMatch: [requiereRol('admin', 'rh')],
    loadChildren: () => import('./rh/rh.routes').then((m) => m.RH_ROUTES),
  },
  {
    // Mismo módulo para los 3 roles; lo que ve cada uno depende de su rol
    path: 'almacen',
    canMatch: [requiereRol('admin', 'almacenista', 'comprador')],
    loadChildren: () => import('./almacenista/almacen.routes').then((m) => m.ALMACEN_ROUTES),
  },
  { path: 'almacenista', redirectTo: 'almacen' },
  {
    path: 'solicitante',
    canMatch: [requiereRol('admin', 'solicitante')],
    loadComponent: () => import('./solicitante.component/solicitante.component').then((m) => m.SolicitanteComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
