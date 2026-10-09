/* =====================================================
   MODELOS DEL ALMACÉN
   Aquí solo se describe la "forma" de los datos.
   No hay lógica: son contratos que TypeScript revisa
   para que no guardes un dato con un campo mal escrito.
===================================================== */

/** EPP = equipo de protección personal (se entrega). Herramienta = se presta y se devuelve. */
export type TipoArticulo = 'EPP' | 'Herramienta';

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
}

/** Un renglón del vale: qué artículo, cuántos y (si aplica) qué pieza exacta. */
export interface LineaVale {
  codigo: string;
  nombre: string;
  tipo: TipoArticulo;
  cantidad: number;
  serie?: string; // solo en equipo por pieza
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
}
