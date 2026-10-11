import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { CURSO_INDUCCION, nombreCurso } from '../compartido/cursos';
import { limpiarCodigo, mismoCodigo } from '../compartido/codigos';
import { Articulo, EntradaArticulo, Etiqueta, EstadoPrestamo, LineaVale, Pieza, Recepcion, ResumenAlmacen, Traspaso, Vale } from './almacen.models';

/* =====================================================
   SERVICIO DEL ALMACÉN
   Un "service" es una clase que guarda datos y lógica
   que pueden usar varios componentes.
   providedIn: 'root' = Angular crea UNA sola instancia
   para toda la app (todos ven los mismos datos).

   Los datos viven en MySQL (backend Flask: /api/almacen).
   Aquí se guarda una copia en signals para que las
   pantallas se calculen al instante; después de cada
   cambio (préstamo, devolución, alta...) se vuelve a
   pedir el estado al servidor, que es quien manda.
   El servidor revisa otra vez todas las reglas.
===================================================== */

/** Con estos días (o menos) para vencer, la certificación de una pieza se marca "por vencer". */
export const DIAS_AVISO_CERTIFICACION = 30;

export type EstadoCertificacion = 'vigente' | 'por-vencer' | 'vencida' | 'no-aplica';

/** ¿Cómo está la certificación de una pieza? (vence al terminar el día indicado) */
export function estadoCertificacion(p: Pieza): EstadoCertificacion {
  if (!p.certificacionVence) return 'no-aplica';
  const dias = diasParaVencer(p);
  if (dias < 0) return 'vencida';
  return dias <= DIAS_AVISO_CERTIFICACION ? 'por-vencer' : 'vigente';
}

/** Días que faltan para que venza (negativo = ya venció). */
export function diasParaVencer(p: Pieza): number {
  if (!p.certificacionVence) return Infinity;
  const [a, m, d] = p.certificacionVence.split('-').map(Number);
  const hoy = new Date();
  const vence = new Date(a, m - 1, d);
  return Math.round((vence.getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000);
}

/** ¿Se puede entregar esta pieza? Apta, sin prestar y con su certificación vigente (si aplica). */
export function piezaEntregable(p: Pieza): boolean {
  return p.estado === 'apto' && !p.prestada && estadoCertificacion(p) !== 'vencida';
}

/** Con esta cantidad disponible (o menos) un artículo se marca como "stock bajo". */
export const STOCK_BAJO = 3;

/** Almacenes de la empresa (los mismos de la tabla almacen). */
export const ALMACENES = [
  'Colonia de Contratistas (Mittal)',
  'Central Kepler',
  'Área Midrex',
  'Área HYL',
  'Área Laminador',
  'Área Minas',
];

/** Inventario de cada almacén, por nombre de almacén. */
type Inventarios = Record<string, Articulo[]>;

/** Fecha de hoy + n días en AAAA-MM-DD (hora local). */
function dentroDe(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** Los consumibles se gastan: nunca se devuelven. */
export function seDevuelve(l: LineaVale): boolean {
  return l.tipo !== 'Consumible';
}

/** El mensaje que manda Flask ({ok: false, mensaje}) o uno genérico si no hubo respuesta. */
function mensajeDe(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.';
    return e.error?.mensaje ?? `Error del servidor (${e.status}).`;
  }
  return 'Ocurrió un error inesperado.';
}

/** Roles que usan el almacén (los demás no cargan sus datos). */
const ROLES_ALMACEN = ['admin', 'almacenista', 'comprador'];

@Injectable({ providedIn: 'root' })
export class AlmacenService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private api = `${this.auth.apiUrl}/almacen`;

  /* signal = una "caja" con un valor. Cuando cambia, la pantalla se actualiza sola. */
  readonly inventarios = signal<Inventarios>({});
  readonly vales = signal<Vale[]>([]);
  /** true mientras llega la primera respuesta del servidor. */
  readonly cargando = signal(false);
  /** Mensaje si no se pudo cargar (backend apagado, sin permiso...). */
  readonly errorCarga = signal('');

  constructor() {
    // Al iniciar sesión (o cambiar de usuario) se cargan sus almacenes; al salir se limpia todo
    effect(() => {
      const usuario = this.auth.usuario();
      untracked(() => {
        if (usuario && ROLES_ALMACEN.includes(usuario.rol)) {
          void this.cargar();
        } else {
          this.inventarios.set({});
          this.vales.set([]);
        }
      });
    });
  }

  /** Pide al servidor el inventario y los vales de los almacenes del usuario. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await firstValueFrom(this.http.get<{ inventarios: Inventarios; vales: Vale[] }>(`${this.api}/estado`));
      this.inventarios.set(r.inventarios);
      this.vales.set(r.vales);
      this.errorCarga.set('');
    } catch (e) {
      this.errorCarga.set(mensajeDe(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Los artículos de un almacén. */
  catalogoDe(almacen: string): Articulo[] {
    return this.inventarios()[almacen] ?? [];
  }

  /** Busca un artículo de un almacén por su código (lo que manda el QR o la pistola). */
  buscarPorCodigo(almacen: string, codigo: string): Articulo | undefined {
    // Se acepta el código del artículo (ALT-KEV) o la serie de una pieza (ALT-024),
    // escrito con cualquier separador: ALT'024, ALT024 y alt 024 son lo mismo
    return this.catalogoDe(almacen).find(
      (a) => mismoCodigo(a.codigo, codigo) || a.piezas?.some((p) => mismoCodigo(p.serie, codigo)),
    );
  }

  /** La pieza de un artículo cuya serie coincide con lo escaneado (sin importar separadores). */
  piezaPorCodigo(a: Articulo, codigo: string): Pieza | undefined {
    return a.piezas?.find((p) => mismoCodigo(p.serie, codigo));
  }

  /** Cuántas unidades se pueden entregar ahora mismo. */
  disponibles(a: Articulo): number {
    return a.piezas ? a.piezas.filter(piezaEntregable).length : a.stock;
  }

  /** Activo, vencido (ya pasó su fecha de entrega), devuelto o entregado (solo consumibles). */
  estadoDe(v: Vale): EstadoPrestamo {
    if (!v.lineas.some(seDevuelve)) return 'entregado';
    if (v.devuelto) return 'devuelto';
    return v.fechaDevolucion < dentroDe(0) ? 'vencido' : 'activo';
  }

  /** Los vales de los almacenes indicados, del más reciente al más antiguo. */
  valesDe(almacenes: string[]): Vale[] {
    return this.vales().filter((v) => almacenes.includes(v.almacen));
  }

  /** Cuántas unidades de un artículo están prestadas en un almacén (los consumibles no se prestan). */
  prestadas(almacen: string, a: Articulo): number {
    if (a.piezas) return a.piezas.filter((p) => p.prestada).length;
    if (a.tipo === 'Consumible') return 0;
    return this.valesDe([almacen])
      .filter((v) => !v.devuelto)
      .flatMap((v) => v.lineas)
      .filter((l) => l.codigo === a.codigo)
      .reduce((s, l) => s + l.cantidad, 0);
  }

  /** Piezas "no apto" o unidades que regresaron dañadas: existen, pero no se pueden prestar. */
  noAptas(a: Articulo): number {
    // No apta, o en el almacén con la certificación vencida (no se puede entregar hasta recertificarla)
    const piezas = a.piezas?.filter((p) => p.estado === 'no apto' || (!p.prestada && estadoCertificacion(p) === 'vencida')).length ?? 0;
    return piezas + (a.danados ?? 0);
  }

  /** ¿Es equipo de alto valor? (se busca en el catálogo del almacén del vale) */
  esCostoso(almacen: string, codigo: string): boolean {
    return !!this.catalogoDe(almacen).find((a) => a.codigo === codigo)?.costoso;
  }

  /** ¿Conviene reponer este artículo? */
  esStockBajo(a: Articulo): boolean {
    return this.disponibles(a) <= (a.piezas ? 1 : STOCK_BAJO);
  }

  /** Números de un almacén para el tablero. */
  resumen(almacen: string): ResumenAlmacen {
    const articulos = this.catalogoDe(almacen);
    const vales = this.valesDe([almacen]);
    let disponibles = 0;
    let prestadas = 0;
    let noAptas = 0;
    for (const a of articulos) {
      disponibles += this.disponibles(a);
      prestadas += this.prestadas(almacen, a);
      noAptas += this.noAptas(a);
    }
    return {
      almacen,
      unidades: disponibles + prestadas + noAptas,
      disponibles,
      prestadas,
      noAptas,
      activos: vales.filter((v) => this.estadoDe(v) === 'activo').length,
      vencidos: vales.filter((v) => this.estadoDe(v) === 'vencido').length,
      stockBajo: articulos.filter((a) => this.esStockBajo(a)),
    };
  }

  /* =====================================================
     PRÉSTAMO
  ===================================================== */

  /**
   * Guarda el vale en el servidor (que asigna el folio y descuenta existencias).
   * trabajadorId = el trabajador de RH identificado con su credencial (si se escaneó).
   */
  async registrarVale(vale: Vale, trabajadorId?: number): Promise<{ vale: Vale } | { error: string }> {
    // Revisión rápida aquí; el servidor vuelve a revisar todo con los datos al día
    const error = this.validarVale(vale);
    if (error) return { error };
    try {
      const guardado = await firstValueFrom(
        this.http.post<Vale>(`${this.api}/vales`, {
          almacen: vale.almacen,
          empleado: { ...vale.empleado, trabajadorId },
          fechaDevolucion: vale.fechaDevolucion,
          lineas: vale.lineas.map((l) => ({ codigo: l.codigo, serie: l.serie, cantidad: l.cantidad })),
          firma: vale.firma,
          autorizoSupervisor: vale.autorizoSupervisor,
        }),
      );
      await this.cargar();
      return { vale: guardado };
    } catch (e) {
      await this.cargar(); // por si alguien más prestó lo mismo: la pantalla se pone al día
      return { error: mensajeDe(e) };
    }
  }

  /**
   * ¿Se puede entregar este vale? Regresa el problema o null si todo está bien:
   *  - cada pieza debe existir en ese almacén, estar apta y no estar prestada
   *  - la misma pieza no puede ir dos veces
   *  - por cantidad: no se puede entregar más de lo que hay en stock
   */
  validarVale(vale: Vale): string | null {
    const catalogo = this.catalogoDe(vale.almacen);
    if (!vale.lineas.length) return 'El vale no tiene artículos.';
    const series = new Set<string>();
    const cantidades = new Map<string, number>();
    for (const l of vale.lineas) {
      const a = catalogo.find((x) => x.codigo === l.codigo);
      if (!a) return `${l.nombre} no existe en ${vale.almacen}.`;
      if (!Number.isInteger(l.cantidad) || l.cantidad < 1) return `Cantidad inválida de ${a.nombre}.`;
      const falta = this.faltaCurso(a, vale.empleado.cursos);
      if (falta) return falta;
      if (a.piezas) {
        if (!l.serie) return `${a.nombre}: falta indicar la serie de la pieza.`;
        const pieza = a.piezas.find((p) => p.serie === l.serie);
        if (!pieza) return `La serie ${l.serie} no pertenece a ${a.nombre}.`;
        if (pieza.estado === 'no apto') return `${l.serie} está marcado como NO APTO.`;
        if (pieza.prestada) return `${l.serie} ya está prestado.`;
        if (estadoCertificacion(pieza) === 'vencida') return `${l.serie}: su certificación venció el ${pieza.certificacionVence}. No se puede prestar hasta recertificarla.`;
        if (series.has(l.serie)) return `${l.serie} está dos veces en el vale.`;
        series.add(l.serie);
      } else {
        const llevan = (cantidades.get(a.codigo) ?? 0) + l.cantidad;
        cantidades.set(a.codigo, llevan);
        if (llevan > a.stock) return `Solo hay ${a.stock} de ${a.nombre} en stock.`;
      }
    }
    return null;
  }

  /**
   * ¿El trabajador puede llevarse este artículo según sus cursos?
   * cursos = claves vigentes leídas de RH; undefined = se capturó a mano (no se sabe).
   * Regresa el motivo si NO puede, o '' si sí.
   */
  faltaCurso(a: Articulo, cursos: string[] | undefined): string {
    for (const clave of this.cursosRequeridos(a)) {
      const curso = nombreCurso(clave);
      if (!cursos) return `${a.nombre} requiere el curso "${curso}": escanea la credencial del trabajador para verificarlo.`;
      if (!cursos.includes(clave)) return `${a.nombre} requiere el curso "${curso}" vigente, y el trabajador no lo tiene.`;
    }
    return '';
  }

  /** Cursos que debe tener vigentes quien se lleve este artículo. El EPP siempre pide la inducción. */
  cursosRequeridos(a: Articulo): string[] {
    const cursos = a.tipo === 'EPP' ? [CURSO_INDUCCION] : [];
    if (a.cursoRequerido && !cursos.includes(a.cursoRequerido)) cursos.push(a.cursoRequerido);
    return cursos;
  }

  /**
   * El trabajador regresó el equipo.
   * recepciones[i] = cómo llegó el renglón i del vale (condición, notas y fotos).
   * Lo que llegó bien vuelve al stock; lo dañado queda apartado. Regresa el error o ''.
   */
  async registrarDevolucion(folio: string, recepciones: (Recepcion | undefined)[]): Promise<string> {
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/vales/${encodeURIComponent(folio)}/devolucion`, { recepciones: recepciones.map((r) => r ?? null) }),
      );
      await this.cargar();
      return '';
    } catch (e) {
      await this.cargar();
      return mensajeDe(e);
    }
  }

  /* =====================================================
     CERTIFICACIONES
  ===================================================== */

  /** Piezas con certificación de los almacenes indicados, de la que vence primero a la última. */
  certificaciones(almacenes: string[]): { almacen: string; articulo: Articulo; pieza: Pieza; estado: EstadoCertificacion; dias: number }[] {
    return almacenes
      .flatMap((almacen) =>
        this.catalogoDe(almacen).flatMap((articulo) =>
          (articulo.piezas ?? [])
            .filter((p) => p.certificacionVence && p.estado !== 'no apto')
            .map((pieza) => ({ almacen, articulo, pieza, estado: estadoCertificacion(pieza), dias: diasParaVencer(pieza) })),
        ),
      )
      .sort((a, b) => a.dias - b.dias);
  }

  /** Registra una nueva fecha de certificación para una pieza. Regresa el error, o '' si quedó. */
  async recertificar(almacen: string, serie: string, vence: string): Promise<string> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || vence < dentroDe(0)) return 'La nueva fecha de vencimiento debe ser hoy o después.';
    try {
      await firstValueFrom(this.http.post(`${this.api}/certificaciones`, { almacen, serie, vence }));
      await this.cargar();
      return '';
    } catch (e) {
      return mensajeDe(e);
    }
  }

  /* =====================================================
     ALTA DE ARTÍCULOS
  ===================================================== */

  /** ¿Ya existe esta serie en los almacenes que veo? (el servidor revisa en TODA la empresa) */
  existeSerie(serie: string): boolean {
    return Object.values(this.inventarios()).some((lista) => lista.some((a) => a.piezas?.some((p) => mismoCodigo(p.serie, serie))));
  }

  /** Busca un artículo por código en cualquier almacén (para reusar su nombre y tipo). */
  articuloEnCualquierAlmacen(codigo: string): Articulo | undefined {
    for (const lista of Object.values(this.inventarios())) {
      const a = lista.find((x) => mismoCodigo(x.codigo, codigo));
      if (a) return a;
    }
    return undefined;
  }

  /**
   * Siguientes series libres para un artículo: HER-TAL → HER-TAL-001, HER-TAL-002...
   * Sirve para el equipo que no trae número de serie de fábrica.
   */
  seriesSugeridas(codigo: string, cuantas: number, ocupadas: string[] = []): string[] {
    const base = limpiarCodigo(codigo);
    const resultado: string[] = [];
    for (let n = 1; resultado.length < cuantas && n < 10000; n++) {
      const serie = `${base}-${String(n).padStart(3, '0')}`;
      if (!this.existeSerie(serie) && !ocupadas.some((o) => mismoCodigo(o, serie))) resultado.push(serie);
    }
    return resultado;
  }

  /**
   * Agrega equipo a un almacén (artículo nuevo o más unidades de uno que ya existe)
   * y SUMA al stock. Regresa las etiquetas a imprimir, o el error si algo no cuadra.
   */
  async agregarArticulo(almacen: string, entrada: EntradaArticulo): Promise<{ etiquetas: Etiqueta[] } | { error: string }> {
    try {
      const r = await firstValueFrom(this.http.post<{ etiquetas: Etiqueta[] }>(`${this.api}/articulos`, { almacen, entrada }));
      await this.cargar();
      return r;
    } catch (e) {
      return { error: mensajeDe(e) };
    }
  }

  /** Etiquetas de un artículo (todas sus piezas, o una del código si es consumible). */
  etiquetasDe(almacen: string, codigo: string): Etiqueta[] {
    const a = this.catalogoDe(almacen).find((x) => mismoCodigo(x.codigo, codigo));
    if (!a) return [];
    return a.piezas
      ? a.piezas.map((p) => ({ valor: p.serie, nombre: a.nombre, detalle: `Serie · ${a.codigo}`, almacen }))
      : [{ valor: a.codigo, nombre: a.nombre, detalle: 'Código · consumible', almacen }];
  }

  /* =====================================================
     TRASPASOS ENTRE ALMACENES
  ===================================================== */

  /** Historial de traspasos que salen o llegan a mis almacenes. */
  async traspasos(): Promise<Traspaso[]> {
    return firstValueFrom(this.http.get<Traspaso[]>(`${this.api}/traspasos`));
  }

  /** Mueve piezas (por serie) y consumibles (por cantidad) de un almacén a otro. */
  async traspasar(
    origen: string,
    destino: string,
    lineas: { codigo: string; serie?: string; cantidad: number }[],
    notas: string,
  ): Promise<{ folio: string } | { error: string }> {
    try {
      const r = await firstValueFrom(this.http.post<{ folio: string }>(`${this.api}/traspasos`, { origen, destino, lineas, notas }));
      await this.cargar();
      return r;
    } catch (e) {
      await this.cargar();
      return { error: mensajeDe(e) };
    }
  }
}
