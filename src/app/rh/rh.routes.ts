// =====================================================================
// rh.routes.ts
// Rutas del módulo. Se cargan con "lazy loading": el código de cada
// pantalla solo se descarga cuando el usuario entra a ella.
// =====================================================================
import { Routes } from '@angular/router';
import { RhLayoutComponent } from './rh-layout/rh-layout.component';

export const RH_ROUTES: Routes = [
  {
    path: '',
    component: RhLayoutComponent, // el marco con pestañas
    children: [
      { path: '', redirectTo: 'alta', pathMatch: 'full' },
      { path: 'alta', title: 'RH · Alta', loadComponent: () => import('./alta/alta-trabajador.component').then((m) => m.AltaTrabajadorComponent) },
      { path: 'baja', title: 'RH · Baja', loadComponent: () => import('./baja/baja-trabajador.component').then((m) => m.BajaTrabajadorComponent) },
      { path: 'vales', title: 'RH · Vales', loadComponent: () => import('./vales/vales.component').then((m) => m.ValesComponent) },
      { path: 'kardex', title: 'RH · Kardex', loadComponent: () => import('./kardex/kardex.component').then((m) => m.KardexComponent) },
    ],
  },
];
