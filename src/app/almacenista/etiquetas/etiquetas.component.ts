// =====================================================================
// etiquetas.component.ts
// Hoja de etiquetas para pegar en el equipo. Cada etiqueta lleva:
//  - QR y código de barras (Code128) con el MISMO valor: la serie de la
//    pieza o el código del consumible. Así sirve cualquier lector: pistola
//    de barras, lector 2D o la cámara del celular.
//  - El valor también en texto, por si el código se maltrata.
// Al escanearla en "Nuevo préstamo" el artículo entra directo al vale.
// =====================================================================
import { Component, effect, input, signal } from '@angular/core';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Etiqueta } from '../almacen.models';

interface Imagenes {
  qr: string;
  barras: string;
}

@Component({
  selector: 'app-etiquetas',
  template: `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3 print:gap-2">
      @for (e of etiquetas(); track e.valor) {
        @let img = imagenes().get(e.valor);
        <article class="flex break-inside-avoid gap-3 rounded-xl border border-gray-300 bg-white p-3 text-gray-900 print:rounded-none print:border-gray-400 print:p-2">
          @if (img) {
            <img [src]="img.qr" [alt]="'QR ' + e.valor" class="size-24 shrink-0 print:size-20" />
          } @else {
            <div class="size-24 shrink-0 animate-pulse rounded bg-gray-100"></div>
          }
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="truncate text-[11px] font-bold tracking-wide text-gray-500 uppercase">IMHOTEP · {{ corto(e.almacen) }}</p>
            <p class="truncate text-sm leading-tight font-semibold">{{ e.nombre }}</p>
            <p class="text-[11px] text-gray-500">{{ e.detalle }}</p>
            <p class="mt-auto font-mono text-base font-bold tracking-wider">{{ e.valor }}</p>
            @if (img) {
              <img [src]="img.barras" [alt]="'Código de barras ' + e.valor" class="mt-1 h-9 w-full object-fill" />
            }
          </div>
        </article>
      } @empty {
        <p class="col-span-full rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No hay etiquetas.</p>
      }
    </div>
  `,
})
export class EtiquetasComponent {
  readonly etiquetas = input.required<Etiqueta[]>();

  /** QR y código de barras ya dibujados, por valor. */
  readonly imagenes = signal(new Map<string, Imagenes>());

  constructor() {
    effect((onCleanup) => {
      const lista = this.etiquetas();
      let vigente = true;
      onCleanup(() => (vigente = false)); // si la lista cambia antes de terminar, se ignora el resultado viejo
      Promise.all(
        lista.map(async (e) => [e.valor, { qr: await qr(e.valor), barras: barras(e.valor) }] as const),
      ).then((pares) => vigente && this.imagenes.set(new Map(pares)));
    });
  }

  /** "Área Midrex" → "Midrex", "Colonia de Contratistas (Mittal)" → "Colonia de Contratistas". */
  corto(almacen: string): string {
    return almacen.replace(/^(Área|Central)\s+/, '').replace(/\s*\(.*\)$/, '');
  }
}

/** QR como imagen PNG (corrección de errores M: se lee aunque la etiqueta se ensucie un poco). */
function qr(valor: string): Promise<string> {
  return QRCode.toDataURL(valor, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
}

/** Código de barras Code128 como imagen SVG (nítido al imprimir). */
function barras(valor: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, valor, { format: 'CODE128', displayValue: false, height: 40, margin: 0, width: 2 });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
