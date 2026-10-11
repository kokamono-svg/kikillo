// =====================================================================
// almacen-layout.component.ts
// Marco del módulo de almacén (usa el marco común del dashboard).
// Cada sección (Resumen, Inventario, Préstamos, Traspasos, Reportes...) se pinta
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

  /** Certificaciones vencidas o por vencer (globito del menú). */
  private readonly certificaciones = computed(
    () => this.almacen.certificaciones(this.acceso.enVista()).filter((c) => c.estado !== 'vigente').length,
  );

  /** Opciones del menú lateral según el rol. */
  readonly menu = computed(() => {
    const opciones: OpcionMenu[] = [
      { ruta: '/almacen', texto: 'Resumen', exacto: true, icono: ICONOS.inicio },
      { ruta: '/almacen/inventario', texto: 'Inventario', icono: ICONOS.caja },
      { ruta: '/almacen/prestamos', texto: 'Préstamos', icono: ICONOS.flechas, globo: this.vencidos() },
    ];
    // Compras y administrador: el stock de todos los almacenes en una tabla
    if (this.acceso.veTodos()) opciones.splice(1, 0, { ruta: '/almacen/stock', texto: 'Stock por almacén', icono: ICONOS.almacen });
    if (this.acceso.puedePrestar()) {
      opciones.push({ ruta: '/almacen/nuevo', texto: 'Nuevo préstamo', icono: ICONOS.mas });
      opciones.push({ ruta: '/almacen/agregar', texto: 'Agregar artículo', icono: ICONOS.entrada });
    }
    opciones.push({ ruta: '/almacen/traspasos', texto: 'Traspasos', icono: ICONOS.flechaDerecha });
    opciones.push({ ruta: '/almacen/certificaciones', texto: 'Certificaciones', icono: ICONOS.escudo, globo: this.certificaciones() });
    opciones.push({ ruta: '/almacen/reportes', texto: 'Reportes', icono: ICONOS.barras });
    opciones.push({ ruta: '/almacen/mapa', texto: 'Mapa 3D', icono: ICONOS.mapa });
    return opciones;
  });

  valor(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }
}
