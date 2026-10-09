// =====================================================================
// rh-layout.component.ts
// "Marco" del módulo de RH: el mismo diseño del dashboard (menú lateral
// negro + barra superior). Cada sección (Resumen, Alta, Baja, Vales,
// Kardex) se pinta dentro de <router-outlet>.
// =====================================================================
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OpcionMenu, PanelLayoutComponent } from '../../compartido/panel-layout/panel-layout.component';
import { ICONOS } from '../../compartido/panel-layout/iconos';

@Component({
  selector: 'app-rh-layout',
  standalone: true,
  imports: [RouterOutlet, PanelLayoutComponent],
  templateUrl: './rh-layout.component.html',
})
export class RhLayoutComponent {
  /** Opciones del menú lateral. */
  readonly menu: OpcionMenu[] = [
    { ruta: '/rh', texto: 'Resumen', icono: ICONOS.inicio, exacto: true },
    { ruta: '/rh/alta', texto: 'Alta', icono: ICONOS.agregarPersona },
    { ruta: '/rh/credencial', texto: 'Credencial', icono: ICONOS.credencial },
    { ruta: '/rh/baja', texto: 'Baja', icono: ICONOS.quitarPersona },
    { ruta: '/rh/vales', texto: 'Vales', icono: ICONOS.documento },
    { ruta: '/rh/kardex', texto: 'Kardex', icono: ICONOS.lista },
  ];
}
