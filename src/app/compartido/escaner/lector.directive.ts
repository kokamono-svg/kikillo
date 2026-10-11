// =====================================================================
// lector.directive.ts
// Pistola lectora (USB o Bluetooth) aunque el cursor NO esté en el campo.
//
// La pistola se comporta como un teclado: escribe el código muy rápido
// (unos milisegundos entre letras) y manda Enter. Si el cursor está en el
// campo, el campo lo recibe como siempre. Si quedó en otro lado (por
// ejemplo, en un botón que se acaba de presionar), esta directiva
// reconoce la ráfaga, evita que el Enter "presione" ese botón y entrega
// el código:
//
//   <input appLector (lector)="usar($event)" ... />
//
// Si hay varios campos con appLector en pantalla, lo recibe el último
// que apareció. No hace nada mientras se escribe en otro campo.
// =====================================================================
import { Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

/** Máximo entre teclas para considerarlas de la pistola (ms). Una persona tarda 80+ ms. */
const MAX_PAUSA = 45;
/** Largo mínimo de un código. */
const MIN_LARGO = 3;

const activos: LectorDirective[] = [];

function esEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type);
}

@Directive({
  selector: '[appLector]',
  host: { '(document:keydown)': 'tecla($event)' },
})
export class LectorDirective implements OnDestroy {
  readonly lector = output<string>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private buffer = '';
  private ultima = 0;

  constructor() {
    activos.push(this);
  }

  ngOnDestroy(): void {
    activos.splice(activos.indexOf(this), 1);
  }

  /** El último campo visible y habilitado es el que recibe la lectura. */
  private esElegido(): boolean {
    for (let i = activos.length - 1; i >= 0; i--) {
      const el = activos[i].el;
      const visible = el.isConnected && el.getClientRects().length > 0 && !(el as HTMLInputElement).disabled;
      if (visible) return activos[i] === this;
    }
    return false;
  }

  tecla(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    // Escribiendo en un campo: la pistola escribe ahí, como un teclado normal
    if (esEditable(e.target)) {
      this.buffer = '';
      return;
    }
    // La cámara u otra ventana encima: no se toca nada
    if (document.querySelector('[aria-modal="true"]') && !this.el.closest('[aria-modal="true"]')) return;
    if (!this.esElegido()) return;

    const pausa = e.timeStamp - this.ultima;
    if (e.key === 'Enter' || e.key === 'Tab') {
      const codigo = this.buffer;
      this.buffer = '';
      if (codigo.length >= MIN_LARGO && pausa <= MAX_PAUSA * 3) {
        e.preventDefault(); // que el Enter no presione el botón que tenga el foco
        this.lector.emit(codigo);
      }
      return;
    }
    if (e.key.length !== 1) return; // Shift y demás teclas sin letra no cuentan
    this.ultima = e.timeStamp;
    if (this.buffer && pausa > MAX_PAUSA) this.buffer = ''; // fue una persona: se empieza de nuevo
    if (this.buffer) e.preventDefault(); // a media ráfaga (p. ej. un espacio no debe presionar botones)
    this.buffer += e.key;
  }
}
