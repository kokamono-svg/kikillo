// =====================================================================
// modal-confirmacion.component.ts
// Ventana de "¿Estás seguro?" reutilizable. El texto del cuerpo lo pone
// el padre entre las etiquetas <app-modal-confirmacion> ... </...>
// (eso se llama "proyección de contenido" y se recibe con <ng-content>).
// =====================================================================
import { Component, ElementRef, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-modal-confirmacion',
  standalone: true,
  templateUrl: './modal-confirmacion.component.html',
})
export class ModalConfirmacionComponent {
  titulo = input('¿Confirmar?');
  textoConfirmar = input('Confirmar');
  procesando = input(false);           // el padre indica si está guardando

  confirmar = output<void>();          // avisa al padre: "sí, adelante"

  /** viewChild: referencia al <dialog #dialogo> del HTML. */
  private dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  /** El padre llama a abrir() y cerrar() usando una referencia #modal. */
  abrir(): void {
    this.dialogo().nativeElement.showModal();
  }

  /** Cierra siempre. Lo usa el padre cuando terminó de guardar. */
  cerrar(): void {
    this.dialogo().nativeElement.close();
  }

  /** Cierre por el usuario (botón Regresar o clic afuera): no se permite mientras guarda. */
  cancelar(): void {
    if (!this.procesando()) this.cerrar();
  }

  /** Clic en el fondo oscuro (fuera del recuadro) = cancelar. */
  clicFondo(e: MouseEvent): void {
    if (e.target === this.dialogo().nativeElement) this.cancelar();
  }
}
