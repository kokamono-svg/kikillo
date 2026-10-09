// =====================================================================
// cerrar-sesion.component.ts
// Botón de "Cerrar sesión" para poner en el encabezado de cada panel.
// =====================================================================
import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-cerrar-sesion',
  template: `
    <button
      type="button"
      (click)="auth.cerrarSesion()"
      [title]="'Cerrar sesión de ' + (auth.usuario()?.nombre ?? '')"
      class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-orange-400/40 px-3 text-sm font-medium text-orange-500 transition hover:bg-orange-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 print:hidden"
    >
      <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
      </svg>
      <span class="hidden sm:inline">Cerrar sesión</span>
    </button>
  `,
})
export class CerrarSesionComponent {
  readonly auth = inject(AuthService);
}
