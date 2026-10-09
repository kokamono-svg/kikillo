// =====================================================================
// resumen-rh.component.ts
// Tablero de RH: personal activo, altas y bajas, quién debe equipo,
// expedientes incompletos y los últimos movimientos de almacén.
// =====================================================================
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RhService } from '../rh.service';
import { ResumenRh } from '../rh.model';
import { ESTILO_MOVIMIENTO, iniciales, nombreCompleto } from '../rh.utils';

@Component({
  selector: 'app-resumen-rh',
  imports: [RouterLink, DatePipe],
  templateUrl: './resumen-rh.component.html',
})
export class ResumenRhComponent {
  private rh = inject(RhService);

  readonly resumen = signal<ResumenRh | null>(null);
  readonly error = signal(false);

  readonly estiloMovimiento = ESTILO_MOVIMIENTO;
  readonly iniciales = iniciales;
  readonly nombreCompleto = nombreCompleto;

  /** El área con más gente (para escalar las barras). */
  readonly maxArea = computed(() => Math.max(1, ...(this.resumen()?.porArea.map((a) => a.total) ?? [])));

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.error.set(false);
    this.rh.obtenerResumen().subscribe({
      next: (r) => this.resumen.set(r),
      error: () => this.error.set(true),
    });
  }

  porcentajeArea(total: number): number {
    return Math.round((total / this.maxArea()) * 100);
  }
}
