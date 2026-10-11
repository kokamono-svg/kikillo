// =====================================================================
// panel-layout.component.ts
// Marco común de los módulos (Panel, Almacén, RH): menú lateral negro
// (fijo en computadora, deslizable en celular), barra superior y, en
// celular/tablet, pestañas para cambiar de sección sin abrir el menú.
// Cada módulo le pasa sus opciones de menú y mete su contenido adentro:
//
//   <app-panel-layout modulo="rh" titulo="Recursos Humanos" [menu]="menu">
//     <div encabezado>...lo que va en la barra superior...</div>
//     <router-outlet />
//   </app-panel-layout>
// =====================================================================
import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService, Rol } from '../../auth/auth.service';
import { ICONOS } from './iconos';

export interface OpcionMenu {
  ruta: string;
  texto: string;
  icono: string;
  /** true = solo se marca activa con la ruta exacta (para la ruta de inicio del módulo). */
  exacto?: boolean;
  /** Número del globito naranja (ej. préstamos vencidos). 0 = no se muestra. */
  globo?: number;
}

type Modulo = 'panel' | 'almacen' | 'rh';

/**
 * Módulos de la app y qué roles entran a cada uno.
 * soloVer: roles que ven la opción en el menú, pero bloqueada (con candado).
 * Recursos Humanos: solo RH entra; el almacenista la ve bloqueada; admin y compras no la ven.
 */
const MODULOS: { id: Modulo; ruta: string; texto: string; icono: string; roles: Rol[]; soloVer?: Rol[] }[] = [
  { id: 'panel', ruta: '/dashboard', texto: 'Panel general', icono: ICONOS.barras, roles: ['admin'] },
  { id: 'almacen', ruta: '/almacen', texto: 'Almacén', icono: ICONOS.almacen, roles: ['admin', 'almacenista', 'comprador'] },
  { id: 'rh', ruta: '/rh', texto: 'Recursos Humanos', icono: ICONOS.personas, roles: ['rh'], soloVer: ['almacenista'] },
];

@Component({
  selector: 'app-panel-layout',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './panel-layout.component.html',
  host: { class: 'block' },
})
export class PanelLayoutComponent {
  readonly auth = inject(AuthService);
  readonly iconos = ICONOS;

  /** En qué módulo estamos (no se repite en "Otros módulos"). */
  readonly modulo = input.required<Modulo>();
  /** Título de la sección del menú. */
  readonly titulo = input.required<string>();
  readonly menu = input.required<OpcionMenu[]>();
  /** Texto bajo el nombre del usuario (rol, almacén...). */
  readonly etiqueta = input('');
  /** true = siempre en tema claro (para pantallas que todavía no tienen modo oscuro). */
  readonly claro = input(false);

  /** En celular: menú lateral abierto o cerrado. */
  readonly menuAbierto = signal(false);

  /** Otros módulos que ve en el menú: a los que puede entrar y los bloqueados (bloqueado = true). */
  readonly otrosModulos = computed(() => {
    const rol = this.auth.usuario()?.rol;
    if (!rol) return [];
    return MODULOS.filter((m) => m.id !== this.modulo() && (m.roles.includes(rol) || !!m.soloVer?.includes(rol))).map((m) => ({
      ...m,
      bloqueado: !m.roles.includes(rol),
    }));
  });

  /** Iniciales del usuario para el avatar. */
  readonly iniciales = computed(() =>
    (this.auth.usuario()?.nombre ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join(''),
  );

  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    // En celular las pestañas se deslizan: al navegar, la activa queda a la vista
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() =>
        setTimeout(() =>
          host.nativeElement
            .querySelector('[data-pestana-activa="true"]')
            ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }),
        ),
      );
  }
}
