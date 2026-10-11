// =====================================================================
// actualizar-articulo.component.ts
// Ventana para actualizar un artículo del inventario (almacenista,
// compras, supervisor y admin):
//   - Por pieza (arnés, taladro...): cambiar su estado → disponible,
//     en mantenimiento, en reparación o dañada (las prestadas no).
//   - Por cantidad (guantes, discos...): registrar el conteo real.
// Cada cambio queda en los movimientos (AJUSTE) y avisa al grupo de Telegram.
// =====================================================================
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AlmacenService } from '../almacen.service';
import { EstatusPieza, Pieza } from '../almacen.models';
import { contieneCodigo, mismoCodigo } from '../../compartido/codigos';
import { BotonEscanerComponent } from '../../compartido/escaner/boton-escaner.component';

type EstatusManual = Exclude<EstatusPieza, 'en uso'>;

/** Estados que se pueden poner a mano, con su color. */
export const ESTATUS: { valor: EstatusManual; texto: string; ayuda: string; clase: string }[] = [
  { valor: 'disponible', texto: 'Disponible', ayuda: 'Lista para prestar', clase: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300' },
  { valor: 'en mantenimiento', texto: 'En mantenimiento', ayuda: 'Servicio, limpieza o calibración', clase: 'border-gray-300 bg-gray-100 text-gray-800 dark:border-white/20 dark:bg-white/10 dark:text-gray-200' },
  { valor: 'en reparación', texto: 'En reparación', ayuda: 'Se está arreglando', clase: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300' },
  { valor: 'dañado', texto: 'Dañada', ayuda: 'No se puede usar', clase: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300' },
];

/** Texto del estado de una pieza (incluye "Prestada"). */
export const TEXTO_ESTATUS: Record<EstatusPieza, string> = {
  disponible: 'Disponible',
  'en uso': 'Prestada',
  'en mantenimiento': 'En mantenimiento',
  'en reparación': 'En reparación',
  dañado: 'Dañada',
};

/** Estado real de la pieza (los datos viejos solo traían apto / no apto). */
export function estatusDe(p: Pieza): EstatusPieza {
  return p.estatus ?? (p.prestada ? 'en uso' : p.estado === 'no apto' ? 'dañado' : 'disponible');
}

const MOTIVOS_STOCK = ['Conteo físico', 'Merma / se dañaron', 'Compra recibida', 'Corrección de captura'];

@Component({
  selector: 'app-actualizar-articulo',
  imports: [BotonEscanerComponent],
  templateUrl: './actualizar-articulo.component.html',
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
})
export class ActualizarArticuloComponent {
  private almacen = inject(AlmacenService);

  readonly nombreAlmacen = input.required<string>();
  readonly codigo = input.required<string>();
  readonly cerrar = output<void>();

  readonly estatus = ESTATUS;
  readonly textoEstatus = TEXTO_ESTATUS;
  readonly estatusDe = estatusDe;
  readonly motivosStock = MOTIVOS_STOCK;

  /** El artículo se vuelve a leer del servicio: después de guardar ya trae lo nuevo. */
  readonly articulo = computed(() => this.almacen.catalogoDe(this.nombreAlmacen()).find((a) => a.codigo === this.codigo()) ?? null);

  readonly busqueda = signal('');
  readonly piezas = computed(() => {
    const t = this.busqueda().trim();
    return (this.articulo()?.piezas ?? []).filter((p) => !t || contieneCodigo(p.serie, t));
  });

  /* ----- Pieza que se está cambiando ----- */
  readonly editando = signal<string | null>(null);
  readonly nuevoEstatus = signal<EstatusManual>('en mantenimiento');
  readonly notas = signal('');

  /* ----- Conteo de lo que va por cantidad ----- */
  readonly cantidad = signal<number | null>(null);
  readonly diferencia = computed(() => {
    const a = this.articulo();
    const n = this.cantidad();
    return a && n !== null && Number.isFinite(n) ? n - a.stock : 0;
  });

  readonly guardando = signal(false);
  readonly aviso = signal<{ texto: string; ok: boolean } | null>(null);

  readonly faltaPieza = computed(() => {
    const p = this.articulo()?.piezas?.find((x) => x.serie === this.editando());
    if (!p) return '';
    if (estatusDe(p) === this.nuevoEstatus()) return 'Elige un estado diferente al actual.';
    if (this.nuevoEstatus() !== 'disponible' && !this.notas().trim()) return 'Escribe el motivo (qué tiene o qué se le hará).';
    return '';
  });

  readonly faltaStock = computed(() => {
    const n = this.cantidad();
    if (n === null || !Number.isInteger(n) || n < 0) return 'Escribe cuántas unidades hay realmente.';
    if (this.diferencia() === 0) return 'Es la misma cantidad que ya tiene.';
    if (!this.notas().trim()) return 'Escribe o elige el motivo del ajuste.';
    return '';
  });

  editar(p: Pieza): void {
    if (p.prestada) return;
    this.editando.set(p.serie);
    // Sugerencia: si está disponible, lo usual es mandarla a mantenimiento; si no, regresarla
    this.nuevoEstatus.set(estatusDe(p) === 'disponible' ? 'en mantenimiento' : 'disponible');
    this.notas.set('');
    this.aviso.set(null);
  }

  /** Serie leída con la cámara o la pistola: abre esa pieza. */
  leerSerie(texto: string): void {
    const p = this.articulo()?.piezas?.find((x) => mismoCodigo(x.serie, texto));
    if (!p) {
      this.aviso.set({ texto: `${texto} no es una pieza de este artículo.`, ok: false });
      return;
    }
    this.busqueda.set('');
    if (p.prestada) {
      this.aviso.set({ texto: `${p.serie} está prestada: primero debe devolverse.`, ok: false });
      return;
    }
    this.editar(p);
  }

  async guardarPieza(): Promise<void> {
    const serie = this.editando();
    if (!serie || this.faltaPieza() || this.guardando()) return;
    this.guardando.set(true);
    const error = await this.almacen.cambiarEstadoPieza(this.nombreAlmacen(), serie, this.nuevoEstatus(), this.notas().trim());
    this.guardando.set(false);
    if (error) {
      this.aviso.set({ texto: error, ok: false });
      return;
    }
    this.aviso.set({ texto: `${serie} ahora está ${TEXTO_ESTATUS[this.nuevoEstatus()].toLowerCase()}.`, ok: true });
    this.editando.set(null);
  }

  async guardarStock(): Promise<void> {
    const n = this.cantidad();
    if (n === null || this.faltaStock() || this.guardando()) return;
    this.guardando.set(true);
    const error = await this.almacen.ajustarStock(this.nombreAlmacen(), this.codigo(), n, this.notas().trim());
    this.guardando.set(false);
    if (error) {
      this.aviso.set({ texto: error, ok: false });
      return;
    }
    this.aviso.set({ texto: `Stock actualizado a ${n}.`, ok: true });
    this.cantidad.set(null);
    this.notas.set('');
  }

  claseEstatus(e: EstatusPieza): string {
    return e === 'en uso'
      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
      : (ESTATUS.find((x) => x.valor === e)?.clase ?? '');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  numero(e: Event): number | null {
    const n = (e.target as HTMLInputElement).valueAsNumber;
    return Number.isNaN(n) ? null : n;
  }
}
