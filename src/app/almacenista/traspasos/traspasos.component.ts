// =====================================================================
// traspasos.component.ts
// Mover herramienta y consumibles de un almacén a otro (folio T-0001).
//   - Piezas: por número de serie (escaneando su etiqueta o eligiéndolas).
//     Una pieza prestada no se puede traspasar hasta que regrese.
//   - Consumibles: por cantidad.
// El almacenista solo envía desde SU almacén (puede enviar a cualquiera).
// =====================================================================
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { ALMACENES, AlmacenService } from '../almacen.service';
import { Articulo, Traspaso } from '../almacen.models';
import { CLASE_TIPO } from '../estado-prestamo';
import { contieneCodigo, limpiarCodigo } from '../../compartido/codigos';
import { BotonEscanerComponent } from '../../compartido/escaner/boton-escaner.component';
import { LectorDirective } from '../../compartido/escaner/lector.directive';

interface Renglon {
  codigo: string;
  nombre: string;
  tipo: Articulo['tipo'];
  serie?: string;
  cantidad: number;
  maximo: number; // para consumibles: lo que hay en el origen
}

@Component({
  selector: 'app-traspasos',
  imports: [DatePipe, BotonEscanerComponent, LectorDirective],
  templateUrl: './traspasos.component.html',
})
export class TraspasosComponent {
  readonly acceso = inject(AccesoAlmacen);
  readonly almacen = inject(AlmacenService);
  readonly claseTipo = CLASE_TIPO;

  /** Origen: el almacén elegido arriba (el almacenista siempre usa el suyo). */
  readonly origen = signal(this.acceso.actual());
  readonly destino = signal('');
  readonly destinos = computed(() => ALMACENES.filter((a) => a !== this.origen()));
  readonly renglones = signal<Renglon[]>([]);
  readonly notas = signal('');
  readonly codigoEscaneado = signal('');
  readonly busqueda = signal('');
  readonly guardando = signal(false);
  readonly aviso = signal<{ texto: string; tipo: 'ok' | 'alerta' } | null>(null);
  readonly historial = signal<Traspaso[]>([]);
  readonly abierto = signal<string | null>(null);

  /** Artículos del origen que coinciden con la búsqueda. */
  readonly encontrados = computed(() => {
    const t = this.busqueda().trim();
    if (!t) return [];
    const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return this.almacen
      .catalogoDe(this.origen())
      .filter((a) => a.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(n) || contieneCodigo(a.codigo, t))
      .slice(0, 8);
  });

  readonly totalPiezas = computed(() => this.renglones().reduce((s, r) => s + r.cantidad, 0));

  readonly falta = computed(() => {
    if (!this.origen()) return 'Elige el almacén de origen.';
    if (!this.destino()) return 'Elige el almacén de destino.';
    if (!this.renglones().length) return 'Agrega al menos un artículo.';
    if (this.renglones().some((r) => !r.serie && (r.cantidad < 1 || r.cantidad > r.maximo))) return 'Revisa las cantidades.';
    return '';
  });

  constructor() {
    void this.cargarHistorial();
    // Si cambian el almacén de arriba, el traspaso empieza de nuevo desde ese almacén
    effect(() => {
      const actual = this.acceso.actual();
      untracked(() => {
        this.origen.set(actual);
        this.renglones.set([]);
        if (this.destino() === actual) this.destino.set('');
      });
    });
  }

  async cargarHistorial(): Promise<void> {
    try {
      this.historial.set(await this.almacen.traspasos());
    } catch {
      this.historial.set([]);
    }
  }

  /** Piezas de un artículo que se pueden mover (las prestadas no). */
  piezasMovibles(a: Articulo) {
    return (a.piezas ?? []).filter((p) => !p.prestada && !this.renglones().some((r) => r.serie === p.serie));
  }

  /** Código leído con la cámara o con la pistola fuera del campo. */
  leerCodigo(texto: string): void {
    this.codigoEscaneado.set(texto);
    this.escanear();
  }

  /** La pistola manda la serie (pieza) o el código (consumible). */
  escanear(): void {
    const codigo = limpiarCodigo(this.codigoEscaneado());
    this.codigoEscaneado.set('');
    if (!codigo) return;
    const a = this.almacen.buscarPorCodigo(this.origen(), codigo);
    if (!a) {
      this.avisar(`${codigo} no está en ${this.origen()}.`, 'alerta');
      return;
    }
    const pieza = this.almacen.piezaPorCodigo(a, codigo);
    if (a.piezas && !pieza) {
      this.avisar(`${a.nombre}: escanea la serie de la pieza, no el código del artículo.`, 'alerta');
      return;
    }
    this.agregar(a, pieza?.serie);
  }

  agregar(a: Articulo, serie?: string): void {
    if (serie) {
      const p = a.piezas?.find((x) => x.serie === serie);
      if (!p) return;
      if (p.prestada) {
        this.avisar(`${serie} está prestado: primero debe devolverse.`, 'alerta');
        return;
      }
      if (this.renglones().some((r) => r.serie === serie)) {
        this.avisar(`${serie} ya está en la lista.`, 'alerta');
        return;
      }
      this.renglones.update((l) => [...l, { codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, serie, cantidad: 1, maximo: 1 }]);
    } else if (!a.piezas) {
      const ya = this.renglones().find((r) => r.codigo === a.codigo && !r.serie);
      if (ya) {
        this.cambiarCantidad(ya, ya.cantidad + 1);
      } else {
        this.renglones.update((l) => [...l, { codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, cantidad: 1, maximo: a.stock }]);
      }
    }
    this.busqueda.set('');
  }

  cambiarCantidad(r: Renglon, cantidad: number): void {
    const n = Math.max(1, Math.min(Math.floor(cantidad || 1), r.maximo));
    this.renglones.update((l) => l.map((x) => (x === r ? { ...x, cantidad: n } : x)));
  }

  quitar(r: Renglon): void {
    this.renglones.update((l) => l.filter((x) => x !== r));
  }

  async traspasar(): Promise<void> {
    if (this.falta() || this.guardando()) {
      this.avisar(this.falta(), 'alerta');
      return;
    }
    this.guardando.set(true);
    const r = await this.almacen.traspasar(
      this.origen(),
      this.destino(),
      this.renglones().map((x) => ({ codigo: x.codigo, serie: x.serie, cantidad: x.cantidad })),
      this.notas().trim(),
    );
    this.guardando.set(false);
    if ('error' in r) {
      this.avisar(r.error, 'alerta');
      return;
    }
    this.avisar(`Traspaso ${r.folio}: ${this.totalPiezas()} unidad(es) enviadas a ${this.destino()}.`, 'ok');
    this.renglones.set([]);
    this.notas.set('');
    await this.cargarHistorial();
    this.abierto.set(r.folio);
  }

  corto(almacen: string): string {
    return almacen.replace(/^(Área|Central)\s+/, '').replace(/\s*\(.*\)$/, '');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  numero(e: Event): number {
    return (e.target as HTMLInputElement).valueAsNumber;
  }

  private temporizador?: ReturnType<typeof setTimeout>;

  private avisar(texto: string, tipo: 'ok' | 'alerta'): void {
    this.aviso.set({ texto, tipo });
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.aviso.set(null), 5000);
  }
}
