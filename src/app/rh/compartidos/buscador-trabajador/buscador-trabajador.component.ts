// =====================================================================
// buscador-trabajador.component.ts
// Buscador reutilizable con AUTOCOMPLETADO: mientras se escribe número,
// nombre o CURP, aparece una lista desplegable con las coincidencias.
// Al elegir a alguien, AVISA al componente padre con (seleccionado).
// Lo usan Baja, Vales y Kardex.
// =====================================================================
import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';
import { RhService } from '../../rh.service';
import { Trabajador } from '../../rh.model';
import { iniciales, nombreCompleto } from '../../rh.utils';

/** Contador para que cada buscador tenga ids únicos (accesibilidad). */
let siguienteId = 0;

@Component({
  selector: 'app-buscador-trabajador',
  standalone: true,
  templateUrl: './buscador-trabajador.component.html',
  host: {
    class: 'block', // el elemento <app-...> se comporta como bloque (respeta márgenes)
    '(document:click)': 'clicAfuera($event)', // cierra la lista al hacer clic fuera
  },
})
export class BuscadorTrabajadorComponent {
  private rh = inject(RhService);
  private elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  /** input(): dato que manda el padre. Aquí, el título del recuadro. */
  titulo = input('Buscar trabajador');

  /** output(): evento hacia el padre. Se dispara al elegir a alguien. */
  seleccionado = output<Trabajador>();

  termino = signal('');
  resultados = signal<Trabajador[]>([]);
  abierto = signal(false);       // ¿se ve la lista desplegable?
  buscando = signal(false);
  error = signal(false);
  resaltado = signal(-1);        // índice marcado con las flechas (-1 = ninguno)

  idLista = `buscador-lista-${siguienteId++}`;

  /** Cada tecla manda el texto aquí; debounceTime espera a que dejen de escribir. */
  private busquedas = new Subject<string>();

  // Se exponen las utilidades para poder usarlas en el template
  iniciales = iniciales;
  nombreCompleto = nombreCompleto;

  constructor() {
    this.busquedas
      .pipe(
        debounceTime(250), // no consulta en cada tecla, solo 250 ms después de la última
        // switchMap cancela la búsqueda anterior si llega una nueva
        switchMap((t) =>
          t.length < 2
            ? of([])
            : this.rh.buscarTrabajadores(t).pipe(
                catchError(() => {
                  this.error.set(true);
                  return of([] as Trabajador[]);
                })
              )
        ),
        takeUntilDestroyed() // se desuscribe solo al destruir el componente
      )
      .subscribe((lista) => {
        this.buscando.set(false);
        this.resultados.set(lista);
        this.resaltado.set(lista.length ? 0 : -1);
      });
  }

  /** Se llama en cada tecla del input. */
  escribir(valor: string): void {
    this.termino.set(valor);
    this.abierto.set(true);
    this.error.set(false);
    const t = valor.trim();
    if (t.length >= 2) {
      this.buscando.set(true);
    } else {
      this.buscando.set(false);
      this.resultados.set([]);
    }
    this.busquedas.next(t);
  }

  /** Flechas para moverse, Enter para elegir, Esc para cerrar. */
  teclado(e: KeyboardEvent): void {
    const lista = this.resultados();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.abierto.set(true);
        if (lista.length) this.mover((this.resaltado() + 1) % lista.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (lista.length) this.mover((this.resaltado() - 1 + lista.length) % lista.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.abierto() && lista[this.resaltado()]) this.elegir(lista[this.resaltado()]);
        break;
      case 'Escape':
        this.abierto.set(false);
        break;
    }
  }

  /** Marca una opción y la hace visible si la lista tiene scroll. */
  private mover(i: number): void {
    this.resaltado.set(i);
    this.elemento.nativeElement.querySelector(`#${this.idLista}-${i}`)?.scrollIntoView({ block: 'nearest' });
  }

  elegir(t: Trabajador): void {
    this.termino.set(nombreCompleto(t)); // deja el nombre escrito en el input
    this.abierto.set(false);
    this.seleccionado.emit(t); // avisa al padre
  }

  limpiar(input: HTMLInputElement): void {
    this.escribir('');
    input.focus();
  }

  clicAfuera(e: MouseEvent): void {
    if (!this.elemento.nativeElement.contains(e.target as Node)) this.abierto.set(false);
  }
}
