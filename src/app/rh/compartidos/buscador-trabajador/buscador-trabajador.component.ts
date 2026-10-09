// =====================================================================
// buscador-trabajador.component.ts
// Buscador reutilizable: escribe número, nombre o CURP, y cuando el
// usuario elige a alguien, AVISA al componente padre con (seleccionado).
// Lo usan Baja, Vales y Kardex.
// =====================================================================
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RhService } from '../../rh.service';
import { Trabajador } from '../../rh.model';
import { iniciales, nombreCompleto } from '../../rh.utils';

@Component({
  selector: 'app-buscador-trabajador',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './buscador-trabajador.component.html',
  host: { class: 'block' }, // el elemento <app-...> se comporta como bloque (respeta márgenes)
})
export class BuscadorTrabajadorComponent {
  private rh = inject(RhService);

  /** input(): dato que manda el padre. Aquí, el título del recuadro. */
  titulo = input('Buscar trabajador');

  /** output(): evento hacia el padre. Se dispara al elegir a alguien. */
  seleccionado = output<Trabajador>();

  termino = '';
  resultados = signal<Trabajador[]>([]);
  buscando = signal(false);
  mensaje = signal('');

  // Se exponen las utilidades para poder usarlas en el template
  iniciales = iniciales;
  nombreCompleto = nombreCompleto;

  buscar(): void {
    if (this.termino.trim().length < 2) {
      this.mensaje.set('Escribe al menos 2 caracteres.');
      return;
    }
    this.mensaje.set('');
    this.buscando.set(true);
    this.rh.buscarTrabajadores(this.termino).subscribe({
      next: (lista) => {
        this.buscando.set(false);
        this.resultados.set(lista);
        if (lista.length === 0) this.mensaje.set('No se encontró ningún trabajador.');
        if (lista.length === 1) this.elegir(lista[0]); // uno solo: se elige directo
        if (lista.length > 1) this.mensaje.set(`${lista.length} coincidencias. Elige una:`);
      },
      error: () => {
        this.buscando.set(false);
        this.mensaje.set('No se pudo conectar con el servidor.');
      },
    });
  }

  elegir(t: Trabajador): void {
    this.resultados.set([]);
    this.mensaje.set('');
    this.seleccionado.emit(t); // avisa al padre
  }
}
