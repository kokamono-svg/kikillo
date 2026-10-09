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
      { path: '', title: 'Almacén · Resumen', loadComponent: () => import('./resumen/resumen.component').then((m) => m.ResumenComponent) },
      { path: 'inventario', title: 'Almacén · Inventario', loadComponent: () => import('./inventario/inventario.component').then((m) => m.InventarioComponent) },
      { path: 'prestamos', title: 'Almacén · Préstamos', loadComponent: () => import('./prestamos/prestamos.component').then((m) => m.PrestamosComponent) },
      {
        path: 'nuevo',
        title: 'Almacén · Nuevo préstamo',
        canMatch: [requiereRol('admin', 'almacenista')],
        loadComponent: () => import('./almacenista.component').then((m) => m.AlmacenistaComponent),
      },
      {
        path: 'agregar',
        title: 'Almacén · Agregar artículo',
        canMatch: [requiereRol('admin', 'almacenista')],
        loadComponent: () => import('./agregar/agregar-articulo.component').then((m) => m.AgregarArticuloComponent),
      },
      { path: 'etiquetas', title: 'Almacén · Etiquetas', loadComponent: () => import('./etiquetas/etiquetas-pagina.component').then((m) => m.EtiquetasPaginaComponent) },
      { path: 'mapa', title: 'Almacén · Mapa 3D', loadComponent: () => import('../components/mapa3d/mapa3d').then((m) => m.Mapa3d) },
      { path: '**', redirectTo: '' },
    ],
  },
];
