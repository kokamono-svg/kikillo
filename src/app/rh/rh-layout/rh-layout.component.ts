// =====================================================================
// rh-layout.component.ts
// "Marco" del módulo de RH: encabezado + pestañas. El contenido de cada
// pestaña (Alta, Baja, Vales, Kardex) se pinta dentro de <router-outlet>.
// =====================================================================
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-rh-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './rh-layout.component.html',
})
export class RhLayoutComponent {
  /** Pestañas del módulo. ruta = la parte final de la URL (/rh/alta...). */
  pestanas = [
    { ruta: 'alta', texto: 'Alta' },
    { ruta: 'baja', texto: 'Baja' },
    { ruta: 'vales', texto: 'Vales' },
    { ruta: 'kardex', texto: 'Kardex' },
  ];
}
