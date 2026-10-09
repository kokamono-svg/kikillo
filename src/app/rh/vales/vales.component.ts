// =====================================================================
// vales.component.ts
// Pantalla de VALES: elige un trabajador, ve sus vales (entrega y
// adeudos), genera un vale de adeudos e imprime el que esté abierto.
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { RhService } from '../rh.service';
import { Adeudo, Trabajador, Vale } from '../rh.model';
import { nombreCompleto } from '../rh.utils';
import { BuscadorTrabajadorComponent } from '../compartidos/buscador-trabajador/buscador-trabajador.component';
import { ValeDocumentoComponent } from '../compartidos/vale-documento/vale-documento.component';

@Component({
  selector: 'app-vales',
  standalone: true,
  imports: [DatePipe, BuscadorTrabajadorComponent, ValeDocumentoComponent],
  templateUrl: './vales.component.html',
})
export class ValesComponent implements OnInit {
  private rh = inject(RhService);
  private ruta = inject(ActivatedRoute);

  trabajador = signal<Trabajador | null>(null);
  vales = signal<Vale[]>([]);
  adeudos = signal<Adeudo[]>([]);
  valeAbierto = signal<Vale | null>(null);
  cargando = signal(false);
  generando = signal(false);
  error = signal<string | null>(null);

  /** Usuario de RH que emite el vale. Cuando haya login, saldrá de la sesión. */
  usuarioActual = 'Recursos Humanos';

  tieneAdeudos = computed(() => this.adeudos().length > 0);
  nombreCompleto = nombreCompleto;

  ngOnInit(): void {
    const id = Number(this.ruta.snapshot.queryParamMap.get('trabajador'));
    if (id) this.rh.obtenerTrabajador(id).subscribe((t) => this.seleccionar(t));
  }

  /** Carga vales y adeudos AL MISMO TIEMPO con forkJoin. */
  seleccionar(t: Trabajador): void {
    this.trabajador.set(t);
    this.valeAbierto.set(null);
    this.error.set(null);
    this.cargando.set(true);

    // forkJoin espera a que terminen las dos peticiones y entrega ambas respuestas juntas
    forkJoin({ vales: this.rh.obtenerVales(t.id), adeudos: this.rh.obtenerAdeudos(t.id) }).subscribe({
      next: ({ vales, adeudos }) => {
        this.vales.set(vales);
        this.adeudos.set(adeudos);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los vales.');
        this.cargando.set(false);
      },
    });
  }

  generarValeAdeudos(): void {
    const t = this.trabajador();
    if (!t) return;
    this.generando.set(true);
    this.rh.generarValeAdeudos(t.id, this.usuarioActual).subscribe({
      next: (vale) => {
        this.generando.set(false);
        this.vales.update((lista) => [vale, ...lista]); // lo agrega al inicio
        this.valeAbierto.set(vale);                     // y lo abre
      },
      error: (e: HttpErrorResponse) => {
        this.generando.set(false);
        this.error.set(e.error?.mensaje ?? 'No se pudo generar el vale.');
      },
    });
  }

  /** window.print() abre el diálogo de impresión del navegador (también permite "Guardar como PDF"). */
  imprimir(): void {
    window.print();
  }
}
