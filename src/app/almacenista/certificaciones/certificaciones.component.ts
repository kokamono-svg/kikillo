// =====================================================================
// certificaciones.component.ts
// Equipo que requiere certificación (arneses, retráctiles, detectores...):
//   - Vencida   → no se presta hasta recertificarla
//   - Por vencer (30 días o menos) → se presta, pero hay que programarla
//   - Vigente
// El almacenista registra aquí la nueva fecha cuando se recertifica.
// =====================================================================
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService, DIAS_AVISO_CERTIFICACION, EstadoCertificacion } from '../almacen.service';
import { contieneCodigo } from '../../compartido/codigos';
import { BotonEscanerComponent } from '../../compartido/escaner/boton-escaner.component';
import { LectorDirective } from '../../compartido/escaner/lector.directive';

@Component({
  selector: 'app-certificaciones',
  imports: [DatePipe, RouterLink, BotonEscanerComponent, LectorDirective],
  templateUrl: './certificaciones.component.html',
})
export class CertificacionesComponent {
  readonly acceso = inject(AccesoAlmacen);
  private almacen = inject(AlmacenService);
  readonly diasAviso = DIAS_AVISO_CERTIFICACION;

  readonly busqueda = signal('');
  readonly filtro = signal<EstadoCertificacion | ''>('');
  /** Pieza que se está recertificando (almacén + serie) y la fecha nueva. */
  readonly editando = signal<{ almacen: string; serie: string } | null>(null);
  readonly nuevaFecha = signal('');
  readonly aviso = signal<{ texto: string; tipo: 'ok' | 'error' } | null>(null);

  readonly todas = computed(() => this.almacen.certificaciones(this.acceso.enVista()));

  readonly conteo = computed(() => {
    const c = { vencida: 0, 'por-vencer': 0, vigente: 0 } as Record<string, number>;
    for (const x of this.todas()) c[x.estado] = (c[x.estado] ?? 0) + 1;
    return c;
  });

  readonly filtradas = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    return this.todas().filter(
      (x) =>
        (!this.filtro() || x.estado === this.filtro()) &&
        (!t || contieneCodigo(x.pieza.serie, t) || x.articulo.nombre.toLowerCase().includes(t)),
    );
  });

  readonly variosAlmacenes = computed(() => this.acceso.enVista().length > 1);

  readonly filtros: { valor: EstadoCertificacion | ''; texto: string }[] = [
    { valor: '', texto: 'Todas' },
    { valor: 'vencida', texto: 'Vencidas' },
    { valor: 'por-vencer', texto: 'Por vencer' },
    { valor: 'vigente', texto: 'Vigentes' },
  ];

  /** Fecha sugerida al recertificar: un año a partir de hoy. */
  editar(almacen: string, serie: string): void {
    const f = new Date();
    f.setFullYear(f.getFullYear() + 1);
    this.nuevaFecha.set(f.toLocaleDateString('en-CA'));
    this.editando.set({ almacen, serie });
    this.aviso.set(null);
  }

  async guardar(): Promise<void> {
    const e = this.editando();
    if (!e) return;
    const error = await this.almacen.recertificar(e.almacen, e.serie, this.nuevaFecha());
    if (error) {
      this.aviso.set({ texto: error, tipo: 'error' });
      return;
    }
    this.aviso.set({ texto: `${e.serie} recertificada hasta el ${this.nuevaFecha()}.`, tipo: 'ok' });
    this.editando.set(null);
  }

  hoy(): string {
    return new Date().toLocaleDateString('en-CA');
  }

  textoDias(dias: number): string {
    if (dias < 0) return `Venció hace ${-dias} día${dias === -1 ? '' : 's'}`;
    if (dias === 0) return 'Vence hoy';
    if (dias === 1) return 'Vence mañana';
    return `Vence en ${dias} días`;
  }

  corto(almacen: string): string {
    return almacen.replace(/^(Área|Central)\s+/, '').replace(/\s*\(.*\)$/, '');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
