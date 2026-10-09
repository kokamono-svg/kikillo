// =====================================================================
// rh.model.ts
// "Forma" de los datos del módulo de RH. Deben coincidir con el JSON
// que regresa el backend en Flask.
// =====================================================================

/** Clasificación de un artículo del almacén. */
export type TipoArticulo = 'EPP' | 'Herramienta' | 'Equipo' | 'Consumible';

/** Tipos de movimiento que aparecen en el kardex. */
export type TipoMovimiento = 'ENTREGA' | 'DEVOLUCION' | 'REPOSICION' | 'DANO' | 'PERDIDA';

/** Documentos que RH revisa al contratar (solo se marca si se entregaron). */
export interface DocumentosTrabajador {
  identificacion: boolean;
  comprobanteDomicilio: boolean;
  datosBancarios: boolean;
  contratoFirmado: boolean;
  altaImss: boolean;
}

/** Trabajador completo tal como lo devuelve la API. */
export interface Trabajador {
  id: number;
  numeroEmpleado: string;      // Lo genera el sistema, ej. "IMH-00001"
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  curp: string;
  rfc: string;
  nss: string;
  telefono: string;
  puesto: string;
  area: string;
  contrato: string;            // Contrato u orden, ej. "LC-2026-001"
  supervisor: string;
  fechaIngreso: string;        // ISO "2026-09-15"
  tallaRopa: string;
  tallaCalzado: string;
  documentos: DocumentosTrabajador;
  induccionSeguridad: boolean;
  activo: boolean;
  fechaBaja: string | null;
  motivoBaja: string | null;
}

/**
 * Datos que se capturan en el alta. Omit<> toma Trabajador y le QUITA
 * los campos que pone el sistema (id, número, estado de baja).
 */
export type NuevoTrabajador = Omit<
  Trabajador,
  'id' | 'numeroEmpleado' | 'activo' | 'fechaBaja' | 'motivoBaja'
>;

/** Un renglón del kardex: cada entrada o salida de un artículo. */
export interface Movimiento {
  id: number;
  fecha: string;               // ISO con hora: "2026-09-15T09:30:00"
  tipo: TipoMovimiento;
  articuloClave: string;
  descripcion: string;
  tipoArticulo: TipoArticulo;
  idSerie: string | null;      // Solo para equipo controlado por pieza (arnés, bandola...)
  cantidad: number;
  almacen: string;
  folioVale: string | null;
  responsable: string;         // Usuario que registró el movimiento
}

/** Artículo que el trabajador no ha devuelto (nunca incluye consumibles). */
export interface Adeudo {
  articuloClave: string;
  descripcion: string;
  tipoArticulo: TipoArticulo;
  idSerie: string | null;
  cantidadPendiente: number;
  fechaEntrega: string;
  almacen: string;
  folioVale: string | null;
}

/** Renglón dentro de un vale impreso. */
export interface RenglonVale {
  descripcion: string;
  tipoArticulo: TipoArticulo;
  idSerie: string | null;
  cantidad: number;
  estado: string;              // "Bueno", "Pendiente de devolución", etc.
}

export type TipoVale = 'ENTREGA' | 'ADEUDOS';

/** Vale completo para mostrar o imprimir. */
export interface Vale {
  folio: string;
  tipo: TipoVale;
  fecha: string;
  trabajador: Trabajador;
  responsable: string;         // Quién entrega (almacén) o quién emite (RH)
  observaciones: string;
  renglones: RenglonVale[];
}

/** Datos que se envían para registrar una baja. */
export interface SolicitudBaja {
  trabajadorId: number;
  motivo: string;
  fechaBaja: string;
  comentarios: string;
}

export interface RespuestaBaja {
  ok: boolean;
  mensaje: string;
  adeudos?: Adeudo[];
}

/** Números del tablero de RH (GET /api/rh/resumen). */
export interface ResumenRh {
  activos: number;
  inactivos: number;
  altasMes: number;            // ingresaron en los últimos 30 días
  bajasMes: number;            // se dieron de baja en los últimos 30 días
  /** Trabajadores que deben equipo (activos o ya dados de baja). */
  conAdeudos: { trabajador: Trabajador; articulos: number; diasMayor: number }[];
  /** Trabajadores activos con papeles o inducción pendientes. */
  pendientes: { trabajador: Trabajador; faltan: string[] }[];
  /** Personal activo por área, de mayor a menor. */
  porArea: { area: string; total: number }[];
  /** Últimos movimientos de almacén de cualquier trabajador. */
  movimientos: (Movimiento & { trabajadorId: number; trabajador: string })[];
  /** Últimas altas y bajas. */
  recientes: { trabajador: Trabajador; tipo: 'alta' | 'baja'; fecha: string; detalle: string }[];
}
