// =====================================================================
// prestamos.component.ts
// Vales (préstamos) de los almacenes en vista. Todos pueden consultarlos;
// solo admin y almacenista registran devoluciones.
// =====================================================================
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService } from '../almacen.service';
import { EstadoPrestamo, Recepcion, Vale } from '../almacen.models';
import { ESTADO_PRESTAMO } from '../estado-prestamo';
import { ValeImpresoComponent } from '../vale-impreso/vale-impreso.component';
import { DevolucionComponent } from './devolucion/devolucion.component';

@Component({
  selector: 'app-almacen-prestamos',
  imports: [DatePipe, ValeImpresoComponent, DevolucionComponent],
  templateUrl: './prestamos.component.html',
})
export class PrestamosComponent {
  readonly acceso = inject(AccesoAlmacen);
  readonly almacen = inject(AlmacenService);
  readonly esAdmin = inject(AuthService).usuario()?.rol === 'admin';
  readonly estado = ESTADO_PRESTAMO;

  readonly busqueda = signal('');
  readonly filtro = signal<EstadoPrestamo | ''>('');

  /** Folio del vale abierto en el detalle (puede venir en la URL: ?folio=V-0003). */
  readonly abierto = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('folio'));
  /** true = se está llenando el formulario de devolución del vale abierto. */
  readonly devolviendo = signal(false);
  /** Aviso después de registrar una devolución. */
  readonly aviso = signal<{ texto: string; tipo: 'ok' | 'alerta' } | null>(null);

  readonly variosAlmacenes = computed(() => this.acceso.enVista().length > 1);

  /** Vales que el usuario puede ver, con su estado ya calculado. */
  readonly visibles = computed(() =>
    this.almacen.valesDe(this.acceso.enVista()).map((v) => ({ vale: v, estado: this.almacen.estadoDe(v) })),
  );

  readonly conteo = computed(() => {
    const c: Record<EstadoPrestamo | '', number> = { '': 0, activo: 0, vencido: 0, devuelto: 0, entregado: 0 };
    for (const v of this.visibles()) {
      c[''] += 1;
      c[v.estado] += 1;
    }
    return c;
  });

  readonly filtrados = computed(() => {
    const t = this.normalizar(this.busqueda());
    return this.visibles().filter(
      ({ vale: v, estado }) =>
        (!this.filtro() || estado === this.filtro()) &&
        (!t ||
          v.folio.toLowerCase().includes(t) ||
          this.normalizar(v.empleado.nombre).includes(t) ||
          v.empleado.numeroEmpleado.includes(t) ||
          v.lineas.some((l) => this.normalizar(l.nombre).includes(t) || (l.serie ?? l.codigo).toLowerCase().includes(t))),
    );
  });

  /** El vale abierto, solo si el usuario tiene acceso a su almacén. */
  readonly detalle = computed(() => this.visibles().find((v) => v.vale.folio === this.abierto()) ?? null);

  readonly filtros: { valor: EstadoPrestamo | ''; texto: string }[] = [
    { valor: '', texto: 'Todos' },
    { valor: 'activo', texto: 'Prestados' },
    { valor: 'vencido', texto: 'Vencidos' },
    { valor: 'devuelto', texto: 'Devueltos' },
    { valor: 'entregado', texto: 'Consumibles' },
  ];

  abrir(v: Vale): void {
    this.devolviendo.set(false);
    this.abierto.set(v.folio);
  }

  cerrar(): void {
    this.devolviendo.set(false);
    this.abierto.set(null);
  }

  devolver(v: Vale, recepciones: (Recepcion | undefined)[]): void {
    if (!this.acceso.puedePrestar()) return;
    const guardado = this.almacen.registrarDevolucion(v.folio, recepciones);
    this.devolviendo.set(false);
    const conDano = recepciones.filter((r) => r?.condicion === 'danado').length;
    this.avisar(
      !guardado
        ? 'Devolución registrada, pero no cupo en la memoria del navegador (fotos muy pesadas). Se perderá al recargar.'
        : conDano
          ? `Devolución de ${v.folio} registrada. ${conDano} ${conDano === 1 ? 'artículo quedó apartado' : 'artículos quedaron apartados'} por daño.`
          : `Devolución de ${v.folio} registrada.`,
      guardado && !conDano ? 'ok' : 'alerta',
    );
  }

  private temporizador?: ReturnType<typeof setTimeout>;

  private avisar(texto: string, tipo: 'ok' | 'alerta'): void {
    this.aviso.set({ texto, tipo });
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.aviso.set(null), 5000);
  }

  imprimir(): void {
    window.print();
  }

  /** Cuántas piezas en total lleva un vale. */
  piezas(v: Vale): number {
    return v.lineas.reduce((s, l) => s + l.cantidad, 0);
  }

  claseFiltro(activo: boolean): string {
    return activo
      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
      : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/10';
  }

  iniciales(nombre: string): string {
    return nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  private normalizar(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
