// =====================================================================
// no-encontrado.component.ts
// Se muestra cuando la dirección no existe. Ofrece regresar a la
// pantalla de inicio de cada rol (o al login si no hay sesión).
// =====================================================================
import { Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-no-encontrado',
  imports: [RouterLink],
  template: `
    <main class="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <img src="images/logo.jpg" alt="IMHOTEP" class="mb-8 size-16 rounded-2xl bg-white object-contain p-1 shadow-sm ring-1 ring-gray-200" />
      <p class="text-sm font-semibold tracking-wide text-blue-600 uppercase">Error 404</p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">No encontramos esta página</h1>
      <p class="mt-3 max-w-md text-base text-gray-500">
        La dirección no existe o cambió de lugar. Revisa que esté bien escrita o regresa a tu inicio.
      </p>
      <div class="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <a
          [routerLink]="inicio()"
          class="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
        >
          {{ auth.usuario() ? 'Ir a mi inicio' : 'Iniciar sesión' }}
        </a>
        <button
          type="button"
          (click)="regresar()"
          class="inline-flex h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          Regresar
        </button>
      </div>
    </main>
  `,
})
export class NoEncontradoComponent {
  readonly auth = inject(AuthService);
  private location = inject(Location);

  readonly inicio = computed(() => {
    const u = this.auth.usuario();
    return u ? this.auth.inicioDe(u.rol) : '/';
  });

  regresar(): void {
    this.location.back();
  }
}
