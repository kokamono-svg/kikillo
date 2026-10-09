// =====================================================================
// tabla-adeudos.component.ts
// Resumen en números + tabla de lo que el trabajador no ha devuelto.
// Solo muestra; los datos llegan del padre.
// =====================================================================
import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Adeudo } from '../../rh.model';
import { diasDesde } from '../../rh.utils';

@Component({
  selector: 'app-tabla-adeudos',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './tabla-adeudos.component.html',
  host: { class: 'block' }, // el elemento <app-...> se comporta como bloque (respeta márgenes)
})
export class TablaAdeudosComponent {
  adeudos = input.required<Adeudo[]>();

  /** computed: se recalcula solo cuando cambia adeudos(). */
  totalPiezas = computed(() => this.adeudos().reduce((s, a) => s + a.cantidadPendiente, 0));
  diasMasAntiguo = computed(() =>
    this.adeudos().reduce((max, a) => Math.max(max, diasDesde(a.fechaEntrega)), 0)
  );

  diasDesde = diasDesde;
}
