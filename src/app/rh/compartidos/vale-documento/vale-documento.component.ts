// =====================================================================
// vale-documento.component.ts
// Dibuja un vale con el formato de IMHOTEP, listo para imprimir.
// Sirve para los dos tipos: ENTREGA (almacén) y ADEUDOS (RH).
// =====================================================================
import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Vale } from '../../rh.model';
import { nombreCompleto } from '../../rh.utils';

@Component({
  selector: 'app-vale-documento',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './vale-documento.component.html',
  host: { class: 'block' }, // el elemento <app-...> se comporta como bloque (respeta márgenes)
})
export class ValeDocumentoComponent {
  vale = input.required<Vale>();

  esAdeudo = computed(() => this.vale().tipo === 'ADEUDOS');

  titulo = computed(() =>
    this.esAdeudo() ? 'Vale de adeudos de herramienta y EPP' : 'Entrega de herramienta y EPP al trabajador'
  );

  /** Las firmas cambian según el tipo de vale. */
  firmas = computed(() =>
    this.esAdeudo()
      ? [{ rol: 'Emite (RH)', nombre: this.vale().responsable },
         { rol: 'Enterado (Trabajador)', nombre: nombreCompleto(this.vale().trabajador) },
         { rol: 'Recibe devolución (Almacén)', nombre: '' }]
      : [{ rol: 'Entrega (Almacén)', nombre: this.vale().responsable },
         { rol: 'Recibe (Trabajador)', nombre: nombreCompleto(this.vale().trabajador) },
         { rol: 'Vo. Bo. (Supervisor)', nombre: this.vale().trabajador.supervisor }]
  );

  /** Total de piezas para el pie de la tabla. */
  totalPiezas = computed(() => this.vale().renglones.reduce((s, r) => s + r.cantidad, 0));

  nombreCompleto = nombreCompleto;
}
