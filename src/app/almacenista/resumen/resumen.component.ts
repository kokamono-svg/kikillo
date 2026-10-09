// =====================================================================
// resumen.component.ts
// Tablero del almacén: indicadores, almacenes, stock bajo y préstamos
// recientes. Muestra solo los almacenes a los que el usuario tiene acceso
// (o el que eligió en el selector de arriba).
// =====================================================================
import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService } from '../almacen.service';
import { EstadoPrestamo, TipoArticulo, Vale } from '../almacen.models';
import { ESTADO_PRESTAMO } from '../estado-prestamo';

@Component({
  selector: 'app-almacen-resumen',
  imports: [RouterLink, DatePipe],
  templateUrl: './resumen.component.html',
})
export class ResumenComponent {
  readonly acceso = inject(AccesoAlmacen);
  readonly almacen = inject(AlmacenService);
  readonly estado = ESTADO_PRESTAMO;

  /** true = se están viendo varios almacenes a la vez. */
  readonly variosAlmacenes = computed(() => this.acceso.enVista().length > 1);

  readonly resumenes = computed(() => this.acceso.enVista().map((a) => this.almacen.resumen(a)));

  /** Suma de todos los almacenes en vista. */
  readonly total = computed(() =>
    this.resumenes().reduce(
      (t, r) => ({
        unidades: t.unidades + r.unidades,
        disponibles: t.disponibles + r.disponibles,
        prestadas: t.prestadas + r.prestadas,
        noAptas: t.noAptas + r.noAptas,
        activos: t.activos + r.activos,
        vencidos: t.vencidos + r.vencidos,
      }),
      { unidades: 0, disponibles: 0, prestadas: 0, noAptas: 0, activos: 0, vencidos: 0 },
    ),
  );

  /** Artículos por reponer, con el almacén al que pertenecen. */
  readonly stockBajo = computed(() =>
    this.resumenes().flatMap((r) =>
      r.stockBajo.map((a) => ({ articulo: a, almacen: r.almacen, disponibles: this.almacen.disponibles(a) })),
    ),
  );

  /** Disponibles frente al total, por tipo de artículo. */
  readonly porTipo = computed(() => {
    const tipos: TipoArticulo[] = ['Herramienta', 'EPP'];
    return tipos.map((tipo) => {
      let disponibles = 0;
      let total = 0;
      for (const al of this.acceso.enVista()) {
        for (const a of this.almacen.catalogoDe(al).filter((x) => x.tipo === tipo)) {
          const d = this.almacen.disponibles(a);
          disponibles += d;
          total += a.piezas ? a.piezas.length : d + this.almacen.prestadas(al, a);
        }
      }
      return { tipo, disponibles, total, porcentaje: this.porcentaje(disponibles, total) };
    });
  });

  readonly recientes = computed(() => this.almacen.valesDe(this.acceso.enVista()).slice(0, 6));

  estadoVale(v: Vale): EstadoPrestamo {
    return this.almacen.estadoDe(v);
  }

  porcentaje(parte: number, total: number): number {
    return total ? Math.round((parte / total) * 100) : 0;
  }

  /** Verde si hay mucho disponible, azul si hay regular, naranja si queda poco. */
  colorBarra(porcentaje: number): string {
    return porcentaje >= 70 ? 'bg-emerald-500' : porcentaje >= 40 ? 'bg-blue-500' : 'bg-orange-400';
  }

  iniciales(nombre: string): string {
    return nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }
}
