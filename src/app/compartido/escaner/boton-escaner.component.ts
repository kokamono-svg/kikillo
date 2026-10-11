// =====================================================================
// boton-escaner.component.ts
// Botón con ícono de cámara que va junto a cada campo de escaneo.
// Abre el lector con cámara y entrega el texto leído:
//
//   <input appLector (lector)="usar($event)" ... />
//   <app-boton-escaner titulo="Escanea la etiqueta" [continuo]="true" (leido)="usar($event)" />
//
// La pistola lectora sigue funcionando igual en el campo de al lado.
// =====================================================================
import { Component, input, output, signal } from '@angular/core';
import { AvisoEscaner, LectorCamaraComponent } from './lector-camara.component';

/** Estilo por defecto: cuadro blanco del mismo alto que los campos (h-11). */
const CLASE_BASE =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-blue-500/10';

@Component({
  selector: 'app-boton-escaner',
  imports: [LectorCamaraComponent],
  host: { class: 'contents' },
  template: `
    <button type="button" (click)="abierto.set(true)" [disabled]="deshabilitado()" [attr.aria-label]="texto() ? null : titulo()" [title]="titulo()" [class]="clase()">
      <svg class="size-5" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
      </svg>
      @if (texto()) {
        <span>{{ texto() }}</span>
      }
    </button>
    @if (abierto()) {
      <app-lector-camara [titulo]="titulo()" [continuo]="continuo()" [aviso]="aviso()" (leido)="leido.emit($event)" (cerrar)="abierto.set(false)" />
    }
  `,
})
export class BotonEscanerComponent {
  /** Texto de la ventana de la cámara (y del botón para lectores de pantalla). */
  readonly titulo = input('Escanear con la cámara');
  /** Texto visible junto al ícono (vacío = solo ícono). */
  readonly texto = input('');
  /** true = la cámara sigue abierta para leer varios códigos. */
  readonly continuo = input(false);
  /** Aviso que da la página tras cada lectura (se ve sobre la cámara en modo continuo). */
  readonly aviso = input<AvisoEscaner | null>(null);
  readonly deshabilitado = input(false);
  readonly clase = input(CLASE_BASE);
  readonly leido = output<string>();

  readonly abierto = signal(false);
}
