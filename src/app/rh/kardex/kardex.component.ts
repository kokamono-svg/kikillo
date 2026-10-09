// =====================================================================
// kardex.component.ts
// Pantalla de KARDEX: historial cronológico de todos los movimientos
// del trabajador (entregas, devoluciones, reposiciones, daños, pérdidas).
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { RhService } from '../rh.service';
import { Adeudo, Movimiento, TipoMovimiento, Trabajador } from '../rh.model';
import { ESTILO_MOVIMIENTO, nombreCompleto } from '../rh.utils';
import { BuscadorTrabajadorComponent } from '../compartidos/buscador-trabajador/buscador-trabajador.component';
import { TarjetaTrabajadorComponent } from '../compartidos/tarjeta-trabajador/tarjeta-trabajador.component';

@Component({
  selector: 'app-kardex',
  standalone: true,
  imports: [DatePipe, FormsModule, BuscadorTrabajadorComponent, TarjetaTrabajadorComponent],
  templateUrl: './kardex.component.html',
})
export class KardexComponent implements OnInit {
  private rh = inject(RhService);
  private ruta = inject(ActivatedRoute);

  trabajador = signal<Trabajador | null>(null);
  movimientos = signal<Movimiento[]>([]);
  adeudos = signal<Adeudo[]>([]);
  cargando = signal(false);
  error = signal<string | null>(null);

  /** Filtro por tipo de movimiento ('' = todos). Es signal para que filtrados() se recalcule. */
  filtro = signal<TipoMovimiento | ''>('');

  estilos = ESTILO_MOVIMIENTO;
  tipos = Object.keys(ESTILO_MOVIMIENTO) as TipoMovimiento[];
  nombreCompleto = nombreCompleto;

  /** Movimientos que pasan el filtro. */
  filtrados = computed(() => {
    const f = this.filtro();
    return f ? this.movimientos().filter((m) => m.tipo === f) : this.movimientos();
  });

  /** Totales para las tarjetas de resumen. */
  resumen = computed(() => {
    const movs = this.movimientos();
    const suma = (cond: (m: Movimiento) => boolean) => movs.filter(cond).reduce((s, m) => s + m.cantidad, 0);
    return {
      entregadas: suma((m) => m.tipo === 'ENTREGA' && m.tipoArticulo !== 'Consumible'),
      devueltas: suma((m) => m.tipo === 'DEVOLUCION'),
      pendientes: this.adeudos().reduce((s, a) => s + a.cantidadPendiente, 0),
      consumibles: suma((m) => m.tipo === 'ENTREGA' && m.tipoArticulo === 'Consumible'),
      incidencias: movs.filter((m) => m.tipo === 'DANO' || m.tipo === 'PERDIDA').length,
    };
  });

  ngOnInit(): void {
    const id = Number(this.ruta.snapshot.queryParamMap.get('trabajador'));
    if (id) this.rh.obtenerTrabajador(id).subscribe((t) => this.seleccionar(t));
  }

  seleccionar(t: Trabajador): void {
    this.trabajador.set(t);
    this.filtro.set('');
    this.error.set(null);
    this.cargando.set(true);
    forkJoin({ movs: this.rh.obtenerKardex(t.id), adeudos: this.rh.obtenerAdeudos(t.id) }).subscribe({
      next: ({ movs, adeudos }) => {
        this.movimientos.set(movs);
        this.adeudos.set(adeudos);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el kardex.');
        this.cargando.set(false);
      },
    });
  }

  imprimir(): void {
    window.print();
  }
}
