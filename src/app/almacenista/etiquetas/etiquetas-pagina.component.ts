// =====================================================================
// etiquetas-pagina.component.ts
// /almacen/etiquetas?codigo=HER-FLX&almacen=...
// Reimprimir las etiquetas de un artículo (si una se perdió o se maltrató).
// Se puede filtrar para imprimir solo algunas series.
// =====================================================================
import { Component, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService } from '../almacen.service';
import { EtiquetasComponent } from './etiquetas.component';
import { contieneCodigo, mismoCodigo } from '../../compartido/codigos';

@Component({
  selector: 'app-etiquetas-pagina',
  imports: [EtiquetasComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div class="min-w-0">
          <button type="button" (click)="regresar()" class="mb-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">← Regresar</button>
          <h1 class="truncate text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-white">Etiquetas · {{ articulo()?.nombre ?? codigo() }}</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ almacenFinal() }} · {{ etiquetas().length }} etiqueta{{ etiquetas().length === 1 ? '' : 's' }}</p>
        </div>
        <button
          type="button"
          (click)="imprimir()"
          [disabled]="!etiquetas().length"
          class="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:bg-gray-300 disabled:shadow-none"
        >
          Imprimir
        </button>
      </div>

      @if (todas().length > 1) {
        <input
          type="search"
          placeholder="Filtrar series (ej. FLX-00)"
          [value]="filtro()"
          (input)="filtro.set($any($event.target).value)"
          class="h-11 w-full max-w-sm rounded-xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 sm:text-sm print:hidden dark:border-white/10 dark:bg-neutral-900 dark:text-white"
        />
      }

      <app-etiquetas [etiquetas]="etiquetas()" />
    </div>
  `,
})
export class EtiquetasPaginaComponent {
  private almacen = inject(AlmacenService);
  private acceso = inject(AccesoAlmacen);
  private location = inject(Location);

  /** Vienen de la URL (?codigo=...&almacen=...) gracias a withComponentInputBinding. */
  readonly codigo = input('');
  readonly almacenUrl = input('', { alias: 'almacen' });
  readonly filtro = signal('');

  /** Solo se imprimen etiquetas de un almacén al que el usuario tiene acceso. */
  readonly almacenFinal = computed(() => {
    const pedido = this.almacenUrl() || this.acceso.actual() || this.acceso.almacenes()[0] || '';
    return this.acceso.almacenes().includes(pedido) ? pedido : '';
  });

  readonly articulo = computed(() => this.almacen.catalogoDe(this.almacenFinal()).find((a) => mismoCodigo(a.codigo, this.codigo())));
  readonly todas = computed(() => (this.almacenFinal() ? this.almacen.etiquetasDe(this.almacenFinal(), this.codigo()) : []));
  readonly etiquetas = computed(() => {
    const f = this.filtro();
    return f.trim() ? this.todas().filter((e) => contieneCodigo(e.valor, f)) : this.todas();
  });

  imprimir(): void {
    window.print();
  }

  regresar(): void {
    this.location.back();
  }
}
