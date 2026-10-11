// =====================================================================
// stock-almacenes.component.ts
// Stock de cada almacén en una sola tabla (pensada para Compras):
// una fila por artículo y una columna por almacén con lo disponible.
// Naranja = stock bajo (hay que reponer). "—" = ese almacén no lo maneja.
// Solo consulta: no se presta ni se mueve nada desde aquí.
// =====================================================================
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { ALMACENES, AlmacenService } from '../almacen.service';
import { Articulo, TipoArticulo } from '../almacen.models';
import { CLASE_TIPO } from '../estado-prestamo';
import { contieneCodigo } from '../../compartido/codigos';

interface Celda {
  disponibles: number;
  total: number;
  bajo: boolean;
}

interface Fila {
  codigo: string;
  nombre: string;
  tipo: TipoArticulo;
  /** Una celda por almacén (null = ese almacén no lo maneja). */
  celdas: (Celda | null)[];
  disponibles: number;
  total: number;
  /** En cuántos almacenes está bajo. */
  bajos: number;
}

function sinAcentos(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

@Component({
  selector: 'app-stock-almacenes',
  imports: [RouterLink],
  templateUrl: './stock-almacenes.component.html',
})
export class StockAlmacenesComponent {
  private almacen = inject(AlmacenService);
  readonly acceso = inject(AccesoAlmacen);
  readonly claseTipo = CLASE_TIPO;
  readonly almacenes = ALMACENES;

  readonly busqueda = signal('');
  readonly tipo = signal<TipoArticulo | ''>('');
  readonly soloBajo = signal(false);
  readonly tipos: (TipoArticulo | '')[] = ['', 'Herramienta', 'EPP', 'Consumible'];

  /** Tarjetas de arriba: totales de cada almacén. */
  readonly resumenes = computed(() => ALMACENES.map((a) => this.almacen.resumen(a)));

  /** Todos los artículos de todos los almacenes, juntados por código. */
  readonly filas = computed<Fila[]>(() => {
    const porCodigo = new Map<string, Fila>();
    ALMACENES.forEach((alm, i) => {
      for (const a of this.almacen.catalogoDe(alm)) {
        let f = porCodigo.get(a.codigo);
        if (!f) {
          f = { codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, celdas: ALMACENES.map(() => null), disponibles: 0, total: 0, bajos: 0 };
          porCodigo.set(a.codigo, f);
        }
        const celda = this.celda(alm, a);
        f.celdas[i] = celda;
        f.disponibles += celda.disponibles;
        f.total += celda.total;
        if (celda.bajo) f.bajos++;
      }
    });
    return [...porCodigo.values()].sort((a, b) => b.bajos - a.bajos || a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly visibles = computed(() => {
    const t = sinAcentos(this.busqueda().trim());
    return this.filas().filter(
      (f) =>
        (!t || sinAcentos(f.nombre).includes(t) || contieneCodigo(f.codigo, this.busqueda())) &&
        (!this.tipo() || f.tipo === this.tipo()) &&
        (!this.soloBajo() || f.bajos > 0),
    );
  });

  readonly porReponer = computed(() => this.filas().filter((f) => f.bajos > 0).length);

  private celda(almacen: string, a: Articulo): Celda {
    const disponibles = this.almacen.disponibles(a);
    return {
      disponibles,
      total: disponibles + this.almacen.prestadas(almacen, a) + this.almacen.noAptas(a),
      bajo: this.almacen.esStockBajo(a),
    };
  }

  /** "Colonia de Contratistas (Mittal)" → "Colonia de Contratistas"; "Área HYL" → "HYL". */
  corto(almacen: string): string {
    return almacen.replace(/^(Área|Central)\s+/, '').replace(/\s*\(.*\)$/, '');
  }

  /** Abre el inventario detallado de ese almacén. */
  verAlmacen(nombre: string): void {
    this.acceso.elegir(nombre);
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
