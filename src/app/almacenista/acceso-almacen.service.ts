import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ALMACENES } from './almacen.service';

/* =====================================================
   QUÉ PUEDE VER Y HACER CADA ROL EN EL ALMACÉN
     admin       → todos los almacenes, puede prestar
     comprador   → todos los almacenes, solo consulta
     almacenista → solo su almacén, puede prestar

   Igual que en los guards: esto solo decide qué se
   muestra. El backend debe validar lo mismo en cada
   endpoint (rol y almacén del usuario).
===================================================== */

@Injectable({ providedIn: 'root' })
export class AccesoAlmacen {
  private auth = inject(AuthService);

  private readonly rol = computed(() => this.auth.usuario()?.rol);

  /** Puede consultar todos los almacenes (y elegir cuál ver). */
  readonly veTodos = computed(() => this.rol() === 'admin' || this.rol() === 'comprador');

  /** Puede registrar préstamos y devoluciones. */
  readonly puedePrestar = computed(() => this.rol() === 'admin' || this.rol() === 'almacenista');

  /** Almacenes a los que tiene acceso. */
  readonly almacenes = computed(() => {
    if (this.veTodos()) return ALMACENES;
    const propio = this.auth.usuario()?.almacen;
    return propio ? [propio] : [];
  });

  /** Almacén elegido en el selector ('' = todos). */
  private readonly elegido = signal('');

  /** El almacén que se está viendo ('' = todos los que tiene a su alcance). */
  readonly actual = computed(() => (this.veTodos() ? this.elegido() : (this.almacenes()[0] ?? '')));

  /** Lista de almacenes que entran en los números de la pantalla. */
  readonly enVista = computed(() => (this.actual() ? [this.actual()] : this.almacenes()));

  elegir(almacen: string): void {
    if (this.veTodos() && (almacen === '' || ALMACENES.includes(almacen))) this.elegido.set(almacen);
  }

  /** Texto corto del rol para mostrar en pantalla. */
  readonly etiquetaRol = computed(() => {
    switch (this.rol()) {
      case 'admin':
        return 'Administrador';
      case 'comprador':
        return 'Compras · solo consulta';
      case 'almacenista':
        return this.almacenes()[0] ?? 'Sin almacén asignado';
      default:
        return '';
    }
  });
}
