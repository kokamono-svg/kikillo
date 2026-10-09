import { Injectable, computed, signal } from '@angular/core';
import { Articulo, EstadoPrestamo, LineaVale, Recepcion, ResumenAlmacen, Vale } from './almacen.models';

/* =====================================================
   SERVICIO DEL ALMACÉN
   Un "service" es una clase que guarda datos y lógica
   que pueden usar varios componentes.
   providedIn: 'root' = Angular crea UNA sola instancia
   para toda la app (todos ven los mismos datos).

   Cada almacén tiene su propio inventario (su stock y
   sus piezas). Cada vale guarda de qué almacén salió
   el equipo.

   Por ahora los datos son de ejemplo y se guardan en
   localStorage (memoria del navegador). Cuando tengan
   backend, solo se cambia este archivo: los componentes
   no se enteran.
===================================================== */

const CLAVE_INVENTARIOS = 'imhotep.inventarios.v3';
const CLAVE_VALES = 'imhotep.vales.v3';

/** Con esta cantidad disponible (o menos) un artículo se marca como "stock bajo". */
export const STOCK_BAJO = 3;

/** Almacenes de la empresa. */
export const ALMACENES = [
  'Colonia de Contratistas (Mittal)',
  'Central Kepler',
  'Área Midrex',
  'Área HYL',
  'Área Laminador',
  'Área Minas',
];

/** Catálogo inicial: los 15 artículos de la hoja "Equipo y herramienta para 1 trabajador dentro de Mittal". */
const CATALOGO_INICIAL: Articulo[] = [
  {
    codigo: 'ALT-KEV', nombre: 'Arnés Kevlar', tipo: 'EPP', stock: 0, limite: 1, costoso: true,
    piezas: [
      { serie: 'ALT-001', estado: 'apto', ultimaInspeccion: '2026-09-20', prestada: false },
      { serie: 'ALT-002', estado: 'apto', ultimaInspeccion: '2026-09-20', prestada: false },
      { serie: 'ALT-003', estado: 'no apto', ultimaInspeccion: '2026-08-02', prestada: false },
    ],
  },
  {
    codigo: 'ALT-POL', nombre: 'Arnés Poliéster', tipo: 'EPP', stock: 0, limite: 1, costoso: true,
    piezas: [
      { serie: 'ALT-024', estado: 'apto', ultimaInspeccion: '2026-09-28', prestada: false },
      { serie: 'ALT-025', estado: 'apto', ultimaInspeccion: '2026-09-28', prestada: false },
    ],
  },
  {
    codigo: 'ALT-BAN', nombre: 'Bandola', tipo: 'EPP', stock: 0, limite: 1,
    piezas: [
      { serie: 'BAN-010', estado: 'apto', ultimaInspeccion: '2026-09-15', prestada: false },
      { serie: 'BAN-011', estado: 'no apto', ultimaInspeccion: '2026-07-30', prestada: false },
      { serie: 'BAN-012', estado: 'apto', ultimaInspeccion: '2026-09-15', prestada: false },
    ],
  },
  {
    codigo: 'ALT-GAN', nombre: 'Gancho doble de vida', tipo: 'EPP', stock: 0, limite: 1,
    piezas: [
      { serie: 'GAN-100', estado: 'apto', ultimaInspeccion: '2026-09-10', prestada: false },
      { serie: 'GAN-101', estado: 'apto', ultimaInspeccion: '2026-09-10', prestada: false },
    ],
  },
{codigo: 'HER-MPU',nombre: 'Minipulidor',tipo: 'Herramienta',stock: 0,limite: 1,costoso: true,piezas: [{serie: 'MPU-001',estado: 'apto',ultimaInspeccion: '2026-10-08',prestada: false},{serie: 'MPU-002',estado: 'apto',ultimaInspeccion: '2026-10-08',prestada: false},{serie: 'MPU-003',estado: 'apto',ultimaInspeccion: '2026-10-08',prestada: false }]},
  { codigo: 'HER-FLX', nombre: 'Flexómetro', tipo: 'Herramienta', stock: 20, limite: 1 },
  { codigo: 'HER-GAS', nombre: 'Detector de gases', tipo: 'Herramienta', stock: 3, limite: 1, costoso: true },
  { codigo: 'EPP-RET', nombre: 'Retráctil 3 mts', tipo: 'EPP', stock: 8, limite: 1, costoso: true },
  { codigo: 'HER-MAR', nombre: 'Marro bola', tipo: 'Herramienta', stock: 10, limite: 1 },
  { codigo: 'HER-CIN', nombre: 'Cincel', tipo: 'Herramienta', stock: 15, limite: 2 },
  { codigo: 'HER-EXT', nombre: 'Extensión eléctrica', tipo: 'Herramienta', stock: 9, limite: 1 },
  { codigo: 'HER-REF', nombre: 'Reflector o lámpara', tipo: 'Herramienta', stock: 7, limite: 1 },
  { codigo: 'EPP-PET', nombre: 'Peto', tipo: 'EPP', stock: 25, limite: 1 },
  { codigo: 'EPP-POL', nombre: 'Polainas', tipo: 'EPP', stock: 25, limite: 1 },
  { codigo: 'HER-D9', nombre: 'Discos de corte 9"', tipo: 'Consumible', stock: 80, limite: 5 },
  { codigo: 'HER-D45', nombre: 'Discos de corte 4 1/2"', tipo: 'Consumible', stock: 120, limite: 10 },
];

/** Inventario de cada almacén, por nombre de almacén. */
type Inventarios = Record<string, Articulo[]>;

/**
 * Inventario de ejemplo: el mismo catálogo en todos los almacenes, con
 * menos existencias en los almacenes chicos. Las piezas cambian de serie
 * por almacén (ALT-001 en Mittal, ALT-101 en Kepler...) para que cada
 * código sea único.
 */
function inventariosDeEjemplo(): Inventarios {
  const proporcion = [1, 0.7, 0.4, 0.6, 0.3, 0.15];
  const inv: Inventarios = {};
  ALMACENES.forEach((almacen, i) => {
    inv[almacen] = CATALOGO_INICIAL.map((a) => ({
      ...a,
      stock: Math.round(a.stock * proporcion[i]),
      piezas: a.piezas
        ?.slice(0, Math.max(1, Math.round(a.piezas.length * proporcion[i])))
        .map((p) => ({ ...p, serie: p.serie.replace(/\d+$/, (n) => String(i * 100 + Number(n)).padStart(3, '0')) })),
    }));
  });
  return inv;
}

/** Fecha de hoy + n días en AAAA-MM-DD (hora local). */
function dentroDe(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** Algunos préstamos de ejemplo para que el tablero no arranque vacío. */
function valesDeEjemplo(): Vale[] {
  const vale = (
    folio: string, almacen: string, emitido: number, entrega: number,
    nombre: string, numero: string, lineas: LineaVale[], devuelto?: number,
  ): Vale => ({
    folio,
    fecha: `${dentroDe(emitido)}T09:30:00`,
    fechaDevolucion: dentroDe(entrega),
    almacen,
    almacenista: 'Oscar Salas',
    empleado: { nombre, numeroEmpleado: numero, actividad: 'Mantenimiento general', motivo: 'Trabajo programado' },
    lineas,
    firma: '',
    devuelto: devuelto === undefined ? undefined : `${dentroDe(devuelto)}T16:00:00`,
  });
  return [
    vale('V-0005', 'Área HYL', -4, -1, 'Ana Torres', '10452', [
      { codigo: 'HER-EXT', nombre: 'Extensión eléctrica', tipo: 'Herramienta', cantidad: 1 },
    ]),
    vale('V-0004', 'Área Midrex', -15, -9, 'Pedro Núñez', '10388', [
      {
        codigo: 'HER-CIN', nombre: 'Cincel', tipo: 'Herramienta', cantidad: 2,
        recepcion: { condicion: 'danado', danadas: 1, notas: 'Uno regresó con la punta despostillada.' },
      },
    ], -8),
    vale('V-0003', 'Colonia de Contratistas (Mittal)', -1, 6, 'Laura Ríos', '10511', [
      { codigo: 'ALT-KEV', nombre: 'Arnés Kevlar', tipo: 'EPP', cantidad: 1, serie: 'ALT-001' },
      { codigo: 'EPP-RET', nombre: 'Retráctil 3 mts', tipo: 'EPP', cantidad: 1 },
    ]),
    vale('V-0002', 'Central Kepler', -2, 5, 'Jorge Salinas', '10297', [
      { codigo: 'HER-GAS', nombre: 'Detector de gases', tipo: 'Herramienta', cantidad: 1 },
      { codigo: 'HER-D45', nombre: 'Discos de corte 4 1/2"', tipo: 'Consumible', cantidad: 5 },
    ]),
    vale('V-0001', 'Central Kepler', -10, -3, 'Carlos Mendoza', '10120', [
      { codigo: 'ALT-POL', nombre: 'Arnés Poliéster', tipo: 'EPP', cantidad: 1, serie: 'ALT-124' },
      { codigo: 'HER-FLX', nombre: 'Flexómetro', tipo: 'Herramienta', cantidad: 1 },
      { codigo: 'HER-MAR', nombre: 'Marro bola', tipo: 'Herramienta', cantidad: 1 },
    ]),
  ];
}

/** Los consumibles se gastan: nunca se devuelven. */
export function seDevuelve(l: LineaVale): boolean {
  return l.tipo !== 'Consumible';
}

/**
 * Saca del inventario lo que dice un vale.
 * Devuelve una copia: no modifica el inventario original.
 */
function sacarDelInventario(inv: Inventarios, vale: Vale): Inventarios {
  const lista = inv[vale.almacen];
  if (!lista) return inv;
  return {
    ...inv,
    [vale.almacen]: lista.map((a) => {
      const lineas = vale.lineas.filter((l) => l.codigo === a.codigo);
      if (lineas.length === 0) return a;
      if (a.piezas) {
        const series = lineas.map((l) => l.serie);
        return { ...a, piezas: a.piezas.map((p) => (series.includes(p.serie) ? { ...p, prestada: true } : p)) };
      }
      const total = lineas.reduce((s, l) => s + l.cantidad, 0);
      return { ...a, stock: a.stock - total };
    }),
  };
}

/**
 * Regresa al inventario lo que se devolvió de un vale (los consumibles no).
 * Lo que llegó con daño no vuelve a estar disponible: la pieza queda
 * "no apta" y las unidades por cantidad pasan a "dañadas".
 */
function regresarAlInventario(inv: Inventarios, vale: Vale): Inventarios {
  const lista = inv[vale.almacen];
  if (!lista) return inv;
  return {
    ...inv,
    [vale.almacen]: lista.map((a) => {
      const lineas = vale.lineas.filter((l) => l.codigo === a.codigo && seDevuelve(l));
      if (lineas.length === 0) return a;
      if (a.piezas) {
        return {
          ...a,
          piezas: a.piezas.map((p) => {
            const l = lineas.find((x) => x.serie === p.serie);
            if (!l) return p;
            return { ...p, prestada: false, estado: l.recepcion?.condicion === 'danado' ? 'no apto' : p.estado };
          }),
        };
      }
      let buenas = 0;
      let danadas = 0;
      for (const l of lineas) {
        const conDano = l.recepcion?.condicion === 'danado' ? Math.min(l.recepcion.danadas ?? l.cantidad, l.cantidad) : 0;
        danadas += conDano;
        buenas += l.cantidad - conDano;
      }
      return { ...a, stock: a.stock + buenas, danados: (a.danados ?? 0) + danadas };
    }),
  };
}

/** Estado inicial de la demo: inventario de ejemplo con los préstamos y devoluciones ya aplicados. */
function datosDeEjemplo(): { inventarios: Inventarios; vales: Vale[] } {
  const vales = valesDeEjemplo();
  const inventarios = [...vales]
    .reverse() // del más antiguo al más reciente
    .reduce((inv, v) => {
      const despues = sacarDelInventario(inv, v);
      return v.devuelto ? regresarAlInventario(despues, v) : despues;
    }, inventariosDeEjemplo());
  return { inventarios, vales };
}

@Injectable({ providedIn: 'root' })
export class AlmacenService {
  /* signal = una "caja" con un valor. Cuando cambia, la pantalla se actualiza sola. */
  readonly inventarios = signal<Inventarios>({});
  readonly vales = signal<Vale[]>([]);

  constructor() {
    const ejemplo = datosDeEjemplo();
    this.inventarios.set(this.leer(CLAVE_INVENTARIOS, ejemplo.inventarios));
    this.vales.set(this.leer(CLAVE_VALES, ejemplo.vales));
  }

  /** El siguiente folio: V-0001, V-0002... (computed se recalcula solo cuando cambian los vales) */
  readonly siguienteFolio = computed(() => 'V-' + String(this.vales().length + 1).padStart(4, '0'));

  /** Los artículos de un almacén. */
  catalogoDe(almacen: string): Articulo[] {
    return this.inventarios()[almacen] ?? [];
  }

  /** Busca un artículo de un almacén por su código (lo que manda el QR o la pistola). */
  buscarPorCodigo(almacen: string, codigo: string): Articulo | undefined {
    const c = codigo.trim().toUpperCase();
    // Se acepta el código del artículo (ALT-KEV) o la serie de una pieza (ALT-024)
    return this.catalogoDe(almacen).find(
      (a) => a.codigo === c || a.piezas?.some((p) => p.serie === c),
    );
  }

  /** Cuántas unidades se pueden entregar ahora mismo. */
  disponibles(a: Articulo): number {
    return a.piezas ? a.piezas.filter((p) => p.estado === 'apto' && !p.prestada).length : a.stock;
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
    return (a.piezas?.filter((p) => p.estado === 'no apto').length ?? 0) + (a.danados ?? 0);
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

  /**
   * Guarda el vale y descuenta existencias de su almacén.
   * update() recibe el valor anterior y devuelve el nuevo
   * (no se modifica el original: se crea una copia).
   */
  registrarVale(vale: Vale): void {
    this.inventarios.update((inv) => sacarDelInventario(inv, vale));
    this.vales.update((lista) => [vale, ...lista]);
    this.guardar();
  }

  /**
   * El trabajador regresó el equipo.
   * recepciones[i] = cómo llegó el renglón i del vale (condición, notas y fotos).
   * Lo que llegó bien vuelve al stock; lo dañado queda apartado.
   * Regresa false si no se pudo guardar en el navegador (por ejemplo, fotos muy pesadas).
   */
  registrarDevolucion(folio: string, recepciones: (Recepcion | undefined)[]): boolean {
    const original = this.vales().find((v) => v.folio === folio);
    if (!original || original.devuelto) return true;
    const vale: Vale = {
      ...original,
      devuelto: new Date().toISOString(),
      lineas: original.lineas.map((l, i) =>
        seDevuelve(l) ? { ...l, recepcion: recepciones[i] ?? { condicion: 'bueno' } } : l,
      ),
    };
    this.inventarios.update((inv) => regresarAlInventario(inv, vale));
    this.vales.update((lista) => lista.map((v) => (v === original ? vale : v)));
    return this.guardar();
  }

  /** Vuelve a los datos de ejemplo (útil antes de la demostración). */
  reiniciar(): void {
    const ejemplo = datosDeEjemplo();
    this.inventarios.set(ejemplo.inventarios);
    this.vales.set(ejemplo.vales);
    this.guardar();
  }

  /* ---------- localStorage: try/catch porque en modo incógnito puede fallar ---------- */
  private leer<T>(clave: string, porDefecto: T): T {
    try {
      const texto = localStorage.getItem(clave);
      return texto ? (JSON.parse(texto) as T) : porDefecto;
    } catch {
      return porDefecto;
    }
  }

  private guardar(): boolean {
    try {
      localStorage.setItem(CLAVE_INVENTARIOS, JSON.stringify(this.inventarios()));
      localStorage.setItem(CLAVE_VALES, JSON.stringify(this.vales()));
      return true;
    } catch {
      /* si no se puede guardar (sin espacio, modo incógnito), los datos siguen en memoria mientras la página esté abierta */
      return false;
    }
  }
}
