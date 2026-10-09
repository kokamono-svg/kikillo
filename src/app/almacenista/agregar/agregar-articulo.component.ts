// =====================================================================
// agregar-articulo.component.ts
// El almacenista da de alta equipo en su almacén:
//   1. Elige un artículo que ya existe (para sumar unidades) o crea uno nuevo.
//   2. Herramienta y EPP: captura el número de serie de CADA pieza (puede
//      escanearlo, escribirlo o generarlo si el equipo no trae serie).
//      Consumibles (guantes, lentes, casco...): solo la cantidad.
//   3. Se suma al stock y se imprimen las etiquetas con QR y código de barras.
// =====================================================================
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AlmacenService } from '../almacen.service';
import { Articulo, Etiqueta, TipoArticulo } from '../almacen.models';
import { CLASE_TIPO } from '../estado-prestamo';
import { EtiquetasComponent } from '../etiquetas/etiquetas.component';
import { CURSOS } from '../../compartido/cursos';
import { contieneCodigo, limpiarCodigo, llaveCodigo, mismoCodigo } from '../../compartido/codigos';


@Component({
  selector: 'app-agregar-articulo',
  imports: [RouterLink, EtiquetasComponent],
  templateUrl: './agregar-articulo.component.html',
  styleUrl: './agregar-articulo.component.css',
})
export class AgregarArticuloComponent {
  readonly acceso = inject(AccesoAlmacen);
  readonly almacen = inject(AlmacenService);
  readonly claseTipo = CLASE_TIPO;

  readonly tipos: { tipo: TipoArticulo; texto: string; ayuda: string }[] = [
    { tipo: 'Herramienta', texto: 'Herramienta', ayuda: 'Con número de serie' },
    { tipo: 'EPP', texto: 'Equipo / EPP', ayuda: 'Con número de serie (arnés, retráctil...)' },
    { tipo: 'Consumible', texto: 'Consumible', ayuda: 'Por cantidad (guantes, lentes, casco...)' },
  ];

  /* ---------- Paso 1: almacén y artículo ---------- */
  /** El almacenista solo puede agregar a su almacén; admin elige. */
  readonly destino = signal(this.acceso.actual() || (this.acceso.veTodos() ? '' : (this.acceso.almacenes()[0] ?? '')));
  readonly busqueda = signal('');
  /** null = todavía no elige; 'nuevo' = artículo nuevo; si no, el código del existente. */
  readonly eleccion = signal<string | null>(null);

  readonly catalogo = computed(() => (this.destino() ? this.almacen.catalogoDe(this.destino()) : []));
  readonly encontrados = computed(() => {
    const t = normalizar(this.busqueda());
    return this.catalogo().filter((a) => !t || normalizar(a.nombre).includes(t) || contieneCodigo(a.codigo, this.busqueda()));
  });
  readonly existente = computed<Articulo | null>(() => this.catalogo().find((a) => a.codigo === this.eleccion()) ?? null);

  /* ---------- Paso 2: datos del artículo nuevo ---------- */
  readonly nombre = signal('');
  readonly tipo = signal<TipoArticulo>('Herramienta');
  readonly codigo = signal('');
  /** true = el almacenista escribió el código a mano (ya no se sugiere solo). */
  readonly codigoManual = signal(false);
  readonly limite = signal(1);
  readonly costoso = signal(false);
  /** Curso que debe tener vigente quien lo pida ('' = ninguno). */
  readonly cursoRequerido = signal('');
  readonly cursos = CURSOS;

  /** Tipo y código efectivos (del existente o de lo capturado). */
  readonly tipoFinal = computed(() => this.existente()?.tipo ?? this.tipo());
  readonly codigoFinal = computed(() => limpiarCodigo(this.existente()?.codigo ?? this.codigo()));
  readonly consumible = computed(() => this.tipoFinal() === 'Consumible');

  /* ---------- Paso 3: unidades ---------- */
  readonly series = signal<string[]>([]);
  readonly serieEscrita = signal('');
  readonly cuantasGenerar = signal(1);
  readonly cantidad = signal(1);

  /** Problema con la serie que se está escribiendo ('' = se puede agregar). */
  readonly errorSerie = computed(() => {
    const s = limpiarCodigo(this.serieEscrita());
    if (!s) return '';
    if (llaveCodigo(s).length < 2 || s.length > 30) return 'La serie debe tener de 2 a 30 letras o números.';
    if (this.series().some((x) => mismoCodigo(x, s))) return 'Ya está en la lista.';
    if (this.almacen.existeSerie(s)) return 'Esa serie ya está registrada.';
    return '';
  });

  readonly guardando = signal(false);
  readonly error = signal('');
  readonly etiquetas = signal<Etiqueta[] | null>(null);

  /** Qué falta para poder guardar ('' = todo listo). */
  readonly falta = computed(() => {
    if (!this.destino()) return 'Elige el almacén.';
    if (this.eleccion() === null) return 'Elige el artículo o crea uno nuevo.';
    if (!this.existente()) {
      if (!this.nombre().trim()) return 'Escribe el nombre del artículo.';
      if (llaveCodigo(this.codigoFinal()).length < 2 || this.codigoFinal().length > 20) return 'Revisa el código del artículo.';
      if (this.catalogo().some((a) => mismoCodigo(a.codigo, this.codigoFinal()))) return 'Ese código ya existe en este almacén: elígelo de la lista.';
      if (!(this.limite() >= 1)) return 'El máximo por vale debe ser 1 o más.';
    }
    if (this.consumible()) return this.cantidad() >= 1 ? '' : 'Escribe cuántas unidades entran.';
    return this.series().length ? '' : 'Agrega al menos un número de serie.';
  });

  /** Existencias antes y después (para que el almacenista vea que sí se suma). */
  readonly stockAntes = computed(() => {
    const a = this.existente();
    return a ? this.almacen.disponibles(a) : 0;
  });
  readonly entran = computed(() => (this.consumible() ? Math.max(0, Math.floor(this.cantidad() || 0)) : this.series().length));

  /* ---------- Acciones ---------- */
  elegir(codigo: string | 'nuevo'): void {
    this.eleccion.set(codigo);
    this.series.set([]);
    this.error.set('');
    if (codigo === 'nuevo') {
      this.nombre.set(this.busqueda().trim());
      this.sugerirCodigo();
    }
  }

  cambiarTipo(t: TipoArticulo): void {
    this.tipo.set(t);
    if (t === 'Consumible') this.costoso.set(false);
    this.series.set([]);
    this.sugerirCodigo();
  }

  cambiarNombre(v: string): void {
    this.nombre.set(v);
    this.sugerirCodigo();
  }

  cambiarCodigo(v: string): void {
    this.codigo.set(v.toUpperCase());
    this.codigoManual.set(true);
  }

  /** Código sugerido: prefijo del tipo + 3 letras del nombre, sin repetir. Ej. "Taladro" → HER-TAL. */
  private sugerirCodigo(): void {
    if (this.codigoManual()) return;
    const prefijo = { Herramienta: 'HER', EPP: 'EPP', Consumible: 'CON' }[this.tipo()];
    const letras = normalizar(this.nombre()).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'ART';
    let codigo = `${prefijo}-${letras}`;
    for (let n = 2; this.almacen.articuloEnCualquierAlmacen(codigo) && n < 100; n++) codigo = `${prefijo}-${letras}${n}`;
    this.codigo.set(codigo);
  }

  /** Enter en el campo de serie (la pistola lectora manda Enter al final). */
  agregarSerie(): void {
    // Se guarda limpia: TB'0001 → TB-0001
    const s = limpiarCodigo(this.serieEscrita());
    if (!s || this.errorSerie()) return;
    this.series.update((l) => [...l, s]);
    this.serieEscrita.set('');
  }

  quitarSerie(s: string): void {
    this.series.update((l) => l.filter((x) => x !== s));
  }

  /** Para equipo sin serie de fábrica: genera series consecutivas libres (HER-TAL-001...). */
  generarSeries(): void {
    const n = Math.min(Math.max(1, Math.floor(this.cuantasGenerar() || 1)), 200);
    this.series.update((l) => [...l, ...this.almacen.seriesSugeridas(this.codigoFinal(), n, l)]);
  }

  guardar(): void {
    if (this.falta() || this.guardando()) {
      this.error.set(this.falta());
      return;
    }
    this.guardando.set(true);
    const a = this.existente();
    const r = this.almacen.agregarArticulo(this.destino(), {
      codigo: this.codigoFinal(),
      nombre: a?.nombre ?? this.nombre(),
      tipo: this.tipoFinal(),
      limite: a?.limite ?? this.limite(),
      costoso: a?.costoso ?? this.costoso(),
      cursoRequerido: a ? a.cursoRequerido : this.cursoRequerido() || undefined,
      series: this.series(),
      cantidad: this.cantidad(),
    });
    this.guardando.set(false);
    if ('error' in r) {
      this.error.set(r.error);
      return;
    }
    this.error.set('');
    this.etiquetas.set(r.etiquetas);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Limpia todo para agregar otro artículo. */
  otro(): void {
    this.etiquetas.set(null);
    this.eleccion.set(null);
    this.busqueda.set('');
    this.nombre.set('');
    this.codigo.set('');
    this.codigoManual.set(false);
    this.tipo.set('Herramienta');
    this.limite.set(1);
    this.costoso.set(false);
    this.cursoRequerido.set('');
    this.series.set([]);
    this.cantidad.set(1);
    this.error.set('');
  }

  imprimir(): void {
    window.print();
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  numero(e: Event): number {
    return (e.target as HTMLInputElement).valueAsNumber;
  }
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
