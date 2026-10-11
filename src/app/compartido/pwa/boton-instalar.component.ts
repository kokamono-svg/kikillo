// =====================================================================
// boton-instalar.component.ts
// "Instalar app" (Android, Chrome, Edge) o la instrucción para iPhone.
// No muestra nada si ya está instalada o el navegador no lo permite.
//   <app-boton-instalar />            botón completo (login)
//   <app-boton-instalar compacto />   renglón del menú de usuario
// =====================================================================
import { Component, booleanAttribute, inject, input, signal } from '@angular/core';
import { PwaService } from './pwa.service';

@Component({
  selector: 'app-boton-instalar',
  template: `
    @if (pwa.puedeInstalar()) {
      <button type="button" (click)="pwa.instalar()" [class]="compacto() ? claseCompacta : claseCompleta">
        <svg class="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
        Instalar app en este equipo
      </button>
    } @else if (pwa.esIphone) {
      <button type="button" (click)="ayuda.set(!ayuda())" [attr.aria-expanded]="ayuda()" [class]="compacto() ? claseCompacta : claseCompleta">
        <svg class="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
        Instalar en iPhone
      </button>
      @if (ayuda()) {
        <p class="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-900">
          En Safari toca <strong>Compartir</strong> (el cuadro con flecha hacia arriba) y luego <strong>“Agregar a inicio”</strong>.
        </p>
      }
    }
  `,
})
export class BotonInstalarComponent {
  readonly pwa = inject(PwaService);
  readonly compacto = input(false, { transform: booleanAttribute });
  readonly ayuda = signal(false);

  readonly claseCompleta =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-white text-sm font-semibold text-blue-700 transition hover:bg-blue-50';
  readonly claseCompacta =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10';
}
