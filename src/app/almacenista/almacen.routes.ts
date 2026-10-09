import { Routes } from '@angular/router';
import { requiereRol } from '../auth/auth.guard';
import { AlmacenLayoutComponent } from './layout/almacen-layout.component';

/* Rutas del módulo de almacén (/almacen/...).
   "Nuevo préstamo" solo para quien puede prestar: compras no entra. */
export const ALMACEN_ROUTES: Routes = [
  {
    path: '',
    component: AlmacenLayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./resumen/resumen.component').then((m) => m.ResumenComponent) },
      { path: 'inventario', loadComponent: () => import('./inventario/inventario.component').then((m) => m.InventarioComponent) },
      { path: 'prestamos', loadComponent: () => import('./prestamos/prestamos.component').then((m) => m.PrestamosComponent) },
      {
        path: 'nuevo',
        canMatch: [requiereRol('admin', 'almacenista')],
        loadComponent: () => import('./almacenista.component').then((m) => m.AlmacenistaComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
