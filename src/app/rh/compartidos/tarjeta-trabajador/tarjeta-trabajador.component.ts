// =====================================================================
// tarjeta-trabajador.component.ts
// Expediente visual del trabajador. Solo MUESTRA datos: no llama a la
// API ni guarda nada. Recibe el trabajador desde el padre con input().
// =====================================================================
import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Trabajador } from '../../rh.model';
import { iniciales, nombreCompleto } from '../../rh.utils';

@Component({
  selector: 'app-tarjeta-trabajador',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './tarjeta-trabajador.component.html',
  host: { class: 'block' }, // el elemento <app-...> se comporta como bloque (respeta márgenes)
})
export class TarjetaTrabajadorComponent {
  /** input.required: el padre DEBE pasarlo, si no Angular marca error. */
  trabajador = input.required<Trabajador>();

  iniciales = iniciales;
  nombreCompleto = nombreCompleto;
}
