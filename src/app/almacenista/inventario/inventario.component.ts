// =====================================================================
// inventario.component.ts
// Stock de los almacenes en vista. Con un solo almacén se ve su detalle;
// con varios, cada artículo suma todos y muestra cuánto hay en cada uno.
// =====================================================================
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService, diasParaVencer, estadoCertificacion } from '../almacen.service';
import { Pieza, TipoArticulo } from '../almacen.models';
import { CLASE_TIPO } from '../estado-prestamo';
import { contieneCodigo } from '../../compartido/codigos';

/** Un renglón del inventario (puede sumar varios almacenes). */
interface Renglon {
  codigo: string;
  nombre: string;
  tipo: TipoArticulo;
  limite: number;
  disponibles: number;
  prestadas: number;
  noAptas: number;
  total: number;
  bajo: boolean;
  porAlmacen: { almacen: string; disponibles: number; bajo: boolean }[];
  piezas: Pieza[];
}
import { BotonEscanerComponent } from '../../compartido/escaner/boton-escaner.component';
import { LectorDirective } from '../../compartido/escaner/lector.directive';

@Component({
  selector: 'app-almacen-inventario',
  imports: [RouterLink, BotonEscanerComponent, LectorDirective],
  templateUrl: './inventario.component.html',
})
export class InventarioComponent {
  readonly acceso = inject(AccesoAlmacen);
  private almacen = inject(AlmacenService);
  readonly claseTipo = CLASE_TIPO;

  readonly busqueda = signal('');
  readonly tipo = signal<TipoArticulo | ''>('');
  readonly soloBajo = signal(false);

  readonly variosAlmacenes = computed(() => this.acceso.enVista().length > 1);

  /** Todos los artículos de los almacenes en vista, sumados por código. */
  readonly renglones = computed(() => {
    const porCodigo = new Map<string, Renglon>();
    for (const al of this.acceso.enVista()) {
      for (const a of this.almacen.catalogoDe(al)) {
        const disponibles = this.almacen.disponibles(a);
        const prestadas = this.almacen.prestadas(al, a);
        const noAptas = this.almacen.noAptas(a);
        const bajo = this.almacen.esStockBajo(a);

        let r = porCodigo.get(a.codigo);
        if (!r) {
          r = { codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, limite: a.limite, disponibles: 0, prestadas: 0, noAptas: 0, total: 0, bajo: false, porAlmacen: [], piezas: [] };
          porCodigo.set(a.codigo, r);
        }
        r.disponibles += disponibles;
        r.prestadas += prestadas;
        r.noAptas += noAptas;
        r.total += disponibles + prestadas + noAptas;
        r.bajo ||= bajo;
        r.porAlmacen.push({ almacen: al, disponibles, bajo });
        r.piezas.push(...(a.piezas ?? []));
      }
    }
    return [...porCodigo.values()];
  });

  /** Renglones que pasan los filtros. */
  readonly filtrados = computed(() => {
    const t = this.normalizar(this.busqueda());
    return this.renglones().filter(
      (r) =>
        (!t || this.normalizar(r.nombre).includes(t) || contieneCodigo(r.codigo, t) || r.piezas.some((p) => contieneCodigo(p.serie, t))) &&
        (!this.tipo() || r.tipo === this.tipo()) &&
        (!this.soloBajo() || r.bajo),
    );
  });

  readonly cuantosBajo = computed(() => this.renglones().filter((r) => r.bajo).length);

  porcentaje(r: Renglon): number {
    return r.total ? Math.round((r.disponibles / r.total) * 100) : 0;
  }

  colorBarra(r: Renglon): string {
    const p = this.porcentaje(r);
    return r.bajo || p < 40 ? 'bg-orange-400' : p >= 70 ? 'bg-emerald-500' : 'bg-blue-500';
  }

  claseFiltro(activo: boolean): string {
    return activo
      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
      : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/10';
  }

  clasePieza(p: Pieza): string {
    const cert = estadoCertificacion(p);
    if (cert === 'vencida' && p.estado !== 'no apto') return 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300';
    if (cert === 'por-vencer' && !p.prestada && p.estado !== 'no apto') return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300';
    if (p.estado === 'no apto') return 'border-orange-300 bg-orange-50 text-orange-700 line-through dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300';
    if (p.prestada) return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  textoPieza(p: Pieza): string {
    const base = p.estado === 'no apto' ? 'No apta' : p.prestada ? 'Prestada' : 'Disponible';
    const cert = estadoCertificacion(p);
    if (cert === 'no-aplica') return base;
    const dias = diasParaVencer(p);
    return `${base} · certificación ${cert === 'vencida' ? 'VENCIDA el' : 'vence el'} ${p.certificacionVence}${cert === 'por-vencer' ? ` (${dias} días)` : ''}`;
  }

  /** Nombre corto del almacén para las etiquetas ("Área Midrex" → "Midrex"). */
  corto(almacen: string): string {
    return almacen.replace(/^(Área|Central)\s+/, '').replace(/\s*\(.*\)$/, '');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  private normalizar(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
