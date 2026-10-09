// =====================================================================
// almacen-layout.component.ts
// Marco del módulo de almacén (usa el marco común del dashboard).
// Cada sección (Resumen, Inventario, Préstamos, Nuevo préstamo) se pinta
// dentro de <router-outlet>. Las opciones del menú cambian según el rol.
// =====================================================================
import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OpcionMenu, PanelLayoutComponent } from '../../compartido/panel-layout/panel-layout.component';
import { ICONOS } from '../../compartido/panel-layout/iconos';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService } from '../almacen.service';

@Component({
  selector: 'app-almacen-layout',
  imports: [RouterOutlet, PanelLayoutComponent],
  templateUrl: './almacen-layout.component.html',
})
export class AlmacenLayoutComponent {
  readonly acceso = inject(AccesoAlmacen);
  private almacen = inject(AlmacenService);

  /** Préstamos vencidos en los almacenes que se están viendo (globito naranja del menú). */
  private readonly vencidos = computed(
    () => this.almacen.valesDe(this.acceso.enVista()).filter((v) => this.almacen.estadoDe(v) === 'vencido').length,
  );

  /** Opciones del menú lateral según el rol. */
  readonly menu = computed(() => {
    const opciones: OpcionMenu[] = [
      { ruta: '/almacen', texto: 'Resumen', exacto: true, icono: ICONOS.inicio },
      { ruta: '/almacen/inventario', texto: 'Inventario', icono: ICONOS.caja },
      { ruta: '/almacen/prestamos', texto: 'Préstamos', icono: ICONOS.flechas, globo: this.vencidos() },
    ];
    if (this.acceso.puedePrestar()) {
      opciones.push({ ruta: '/almacen/nuevo', texto: 'Nuevo préstamo', icono: ICONOS.mas });
      opciones.push({ ruta: '/almacen/agregar', texto: 'Agregar artículo', icono: ICONOS.entrada });
    }
    opciones.push({ ruta: '/almacen/mapa', texto: 'Mapa 3D', icono: ICONOS.mapa });
    return opciones;
  });

  valor(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }
}
