/* =====================================================
   MODELOS DEL ALMACÉN
   Aquí solo se describe la "forma" de los datos.
   No hay lógica: son contratos que TypeScript revisa
   para que no guardes un dato con un campo mal escrito.
===================================================== */

/**
 * EPP = equipo de protección personal. Herramienta = se presta y se devuelve.
 * Consumible = se gasta con el uso (discos de corte...): se entrega y NUNCA se devuelve.
 */
export type TipoArticulo = 'EPP' | 'Herramienta' | 'Consumible';

/** Estado de una pieza individual (arnés, bandola, gancho): si es "no apto" NO se puede entregar. */
export type EstadoPieza = 'apto' | 'no apto';

/**
 * Pieza identificada por código único.
 * El reto pide que el equipo de alturas se controle POR PIEZA,
 * no solo por cantidad, para saber qué arnés exacto tiene cada quien.
 */
export interface Pieza {
  serie: string; // código único, ej. ALT-024
  estado: EstadoPieza;
  ultimaInspeccion: string; // fecha AAAA-MM-DD
  prestada: boolean; // true = ya la tiene alguien
}

/** Un artículo del catálogo del almacén. */
export interface Articulo {
  codigo: string; // lo que lee el QR o la pistola lectora
  nombre: string;
  tipo: TipoArticulo;
  stock: number; // existencias (para los que se controlan por cantidad)
  limite: number; // máximo por vale; si se supera, lo autoriza un supervisor
  piezas?: Pieza[]; // solo existe en el equipo que se controla por pieza
  costoso?: boolean; // equipo de alto valor: al devolverlo se sugiere revisar y dejar notas o fotos
  danados?: number; // unidades devueltas con daño (solo por cantidad): no se pueden prestar
}

/** Cómo regresó el equipo. */
export type CondicionDevolucion = 'bueno' | 'danado';

/** Lo que anota el almacenista al recibir un renglón del vale. Notas y fotos son opcionales. */
export interface Recepcion {
  condicion: CondicionDevolucion;
  danadas?: number; // cuántas unidades del renglón regresaron con daño (si lleva más de una)
  notas?: string;
  fotos?: string[]; // imágenes en base64 (data:image/jpeg...), ya reducidas de tamaño
}

/** Un renglón del vale: qué artículo, cuántos y (si aplica) qué pieza exacta. */
export interface LineaVale {
  codigo: string;
  nombre: string;
  tipo: TipoArticulo;
  cantidad: number;
  serie?: string; // solo en equipo por pieza
  recepcion?: Recepcion; // se llena al registrar la devolución (nunca en consumibles)
}

/** Datos del trabajador que captura el almacenista. */
export interface DatosEmpleado {
  nombre: string;
  numeroEmpleado: string;
  actividad: string; // qué trabajo va a realizar
  motivo: string; // para qué necesita la herramienta
}

/** El vale completo que se genera al final. */
export interface Vale {
  folio: string; // V-0001, V-0002...
  fecha: string; // fecha y hora ISO en que se emitió
  fechaDevolucion: string; // fecha estimada de entrega (AAAA-MM-DD)
  almacen: string;
  almacenista: string;
  empleado: DatosEmpleado;
  lineas: LineaVale[];
  firma: string; // imagen de la firma en base64 (data:image/png...)
  autorizoSupervisor?: string; // nombre del supervisor si hubo que autorizar un límite
  devuelto?: string; // fecha y hora ISO en que se regresó el equipo (vacío = sigue prestado)
}

/**
 * Estado de un préstamo: activo, vencido (pasó su fecha), devuelto,
 * o entregado (el vale solo llevaba consumibles: no hay nada que regresar).
 */
export type EstadoPrestamo = 'activo' | 'vencido' | 'devuelto' | 'entregado';

/** Números de un almacén para el tablero. */
export interface ResumenAlmacen {
  almacen: string;
  unidades: number; // todo lo que tiene el almacén (disponible + prestado + no apto)
  disponibles: number;
  prestadas: number;
  noAptas: number;
  activos: number; // préstamos en tiempo
  vencidos: number; // préstamos que ya pasaron su fecha de entrega
  stockBajo: Articulo[];
}
