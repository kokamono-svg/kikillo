// =====================================================================
// credencial.component.ts
// Credencial / kardex del trabajador (frente y reverso), tamaño tarjeta
// (85.6 × 54 mm al imprimir).
//   Frente: foto, nombre, NSS, N° de tarjeta, compañía, administrador,
//           fecha de emisión y el QR con el N° de tarjeta.
//   Reverso: kardex de cursos (ID, nombre y vigencia) y firmas.
// El QR guarda SOLO el N° de tarjeta: el almacén lo escanea y busca al
// trabajador en RH para saber qué cursos tiene vigentes.
// =====================================================================
import { Component, computed, effect, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import QRCode from 'qrcode';
import { Trabajador } from '../../rh.model';
import { iniciales, nombreCompleto } from '../../rh.utils';
import { cursoVigente, nombreCurso } from '../../../compartido/cursos';

@Component({
  selector: 'app-credencial',
  imports: [DatePipe],
  templateUrl: './credencial.component.html',
})
export class CredencialComponent {
  readonly trabajador = input.required<Trabajador>();

  readonly qr = signal('');
  readonly nombre = computed(() => nombreCompleto(this.trabajador()));
  readonly iniciales = computed(() => iniciales(this.trabajador()));
  /** Máximo 5 cursos en el reverso (los más recientes primero). */
  readonly cursos = computed(() => [...this.trabajador().cursos].sort((a, b) => b.vigencia.localeCompare(a.vigencia)).slice(0, 5));

  readonly nombreCurso = nombreCurso;
  readonly vigente = cursoVigente;

  constructor() {
    effect((onCleanup) => {
      const tarjeta = this.trabajador().numeroTarjeta;
      let vigenteQr = true;
      onCleanup(() => (vigenteQr = false));
      QRCode.toDataURL(tarjeta || '-', { margin: 0, width: 300, errorCorrectionLevel: 'M' }).then((url) => vigenteQr && this.qr.set(url));
    });
  }
}
