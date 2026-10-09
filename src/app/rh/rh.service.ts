// =====================================================================
// rh.service.ts
// Único lugar que habla con el backend (Flask). Las pantallas nunca
// llaman a la API directamente; siempre pasan por aquí.
//
// Mientras usarDatosDePrueba = true, todo funciona con una "base de
// datos" falsa en memoria (al final del archivo) que imita a Flask.
// =====================================================================
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { delay, switchMap } from 'rxjs/operators';
import { Adeudo, DocumentosTrabajador, Movimiento, NuevoTrabajador, ResumenRh, RespuestaBaja, SolicitudBaja, TipoArticulo, TipoMovimiento, Trabajador, Vale, COMPANIA, DatosCredencial } from './rh.model';
import { TEXTO_DOCUMENTO, diasDesde, hoyIso, nombreCompleto, normalizar } from './rh.utils';
import { limpiarCodigo, llaveCodigo, mismoCodigo } from '../compartido/codigos';

@Injectable({ providedIn: 'root' })
export class RhService {
  private http = inject(HttpClient);

  /** URL de la API de Flask. Cámbiala por la del VPS al publicar. */
  private apiUrl = 'http://localhost:5000/api/rh';

  /** true = datos falsos en memoria; false = llama a Flask de verdad. */
  private usarDatosDePrueba = true;

  // ------------------------------------------------------------------
  // TABLERO
  // ------------------------------------------------------------------

  /** Números para el tablero de RH: personal, adeudos, pendientes y movimientos. */
  obtenerResumen(): Observable<ResumenRh> {
    if (this.usarDatosDePrueba) return simular(calcularResumen(), 400);
    return this.http.get<ResumenRh>(`${this.apiUrl}/resumen`);
  }

  // ------------------------------------------------------------------
  // TRABAJADORES
  // ------------------------------------------------------------------

  /** Busca por número de empleado, nombre o CURP. */
  buscarTrabajadores(termino: string): Observable<Trabajador[]> {
    if (this.usarDatosDePrueba) {
      // normalizar(): sin acentos y en minúsculas, igual que la collation de MySQL
      const t = normalizar(termino.trim());
      // Los códigos se comparan sin separadores: IMH00001 o IMH'00001 encuentran a IMH-00001
      const llave = llaveCodigo(termino);
      const r = BD.trabajadores.filter(
        (x) =>
          normalizar([x.numeroEmpleado, x.numeroTarjeta, x.nombres, x.apellidoPaterno, x.apellidoMaterno, x.nss, x.curp].join(' ')).includes(t) ||
          (llave.length > 0 && [x.numeroEmpleado, x.numeroTarjeta, x.nss, x.curp].some((c) => llaveCodigo(c ?? '').includes(llave))),
      );
      return simular(r);
    }
    const params = new HttpParams().set('q', termino.trim());
    return this.http.get<Trabajador[]>(`${this.apiUrl}/trabajadores`, { params });
  }

  /** Trae un trabajador por su id (se usa al abrir una pantalla con ?trabajador=ID). */
  obtenerTrabajador(id: number): Observable<Trabajador> {
    if (this.usarDatosDePrueba) {
      const t = BD.trabajadores.find((x) => x.id === id);
      return t ? simular({ ...t }) : simularError(404, 'Trabajador no encontrado.');
    }
    return this.http.get<Trabajador>(`${this.apiUrl}/trabajadores/${id}`);
  }

  /**
   * Alta de trabajador. NO se manda número de empleado: el backend lo
   * genera y lo regresa en la respuesta.
   */
  crearTrabajador(nuevo: NuevoTrabajador): Observable<Trabajador> {
    if (this.usarDatosDePrueba) {
      if (BD.trabajadores.some((x) => x.nss === nuevo.nss)) {
        return simularError(409, 'Ya existe un trabajador registrado con ese NSS.');
      }
      const tarjeta = limpiarCodigo(nuevo.numeroTarjeta) || generarTarjeta();
      if (BD.trabajadores.some((x) => mismoCodigo(x.numeroTarjeta, tarjeta))) {
        return simularError(409, 'Ese número de tarjeta ya pertenece a otro trabajador.');
      }
      const id = Math.max(0, ...BD.trabajadores.map((x) => x.id)) + 1;
      const creado: Trabajador = {
        ...nuevo,
        // Alta rápida: CURP, RFC, papeles e inducción se completan después
        curp: '',
        rfc: '',
        documentos: { identificacion: false, comprobanteDomicilio: false, datosBancarios: false, contratoFirmado: false, altaImss: false },
        induccionSeguridad: false,
        numeroTarjeta: tarjeta,
        compania: nuevo.compania || COMPANIA,
        fechaEmision: nuevo.fechaEmision || hoyIso(),
        id,
        numeroEmpleado: generarNumeroEmpleado(id),
        activo: true,
        fechaBaja: null,
        motivoBaja: null,
      };
      BD.trabajadores.push(creado);
      return simular({ ...creado }, 800);
    }
    return this.http.post<Trabajador>(`${this.apiUrl}/trabajadores`, nuevo);
  }

  /** Guarda los datos de la credencial (tarjeta, foto, cursos...) de un trabajador. */
  actualizarCredencial(id: number, datos: DatosCredencial): Observable<Trabajador> {
    if (this.usarDatosDePrueba) {
      const t = BD.trabajadores.find((x) => x.id === id);
      if (!t) return simularError(404, 'Trabajador no encontrado.');
      const tarjeta = limpiarCodigo(datos.numeroTarjeta);
      if (!tarjeta) return simularError(400, 'El número de tarjeta es obligatorio.');
      if (BD.trabajadores.some((x) => x.id !== id && mismoCodigo(x.numeroTarjeta, tarjeta))) {
        return simularError(409, 'Ese número de tarjeta ya pertenece a otro trabajador.');
      }
      Object.assign(t, { ...datos, numeroTarjeta: tarjeta });
      return simular({ ...t }, 500);
    }
    return this.http.put<Trabajador>(`${this.apiUrl}/trabajadores/${id}/credencial`, datos);
  }

  // ------------------------------------------------------------------
  // ADEUDOS, KARDEX Y VALES
  // ------------------------------------------------------------------

  /** Lo que el trabajador no ha devuelto (sin consumibles). */
  obtenerAdeudos(trabajadorId: number): Observable<Adeudo[]> {
    if (this.usarDatosDePrueba) return simular(calcularAdeudos(trabajadorId), 600);
    return this.http.get<Adeudo[]>(`${this.apiUrl}/trabajadores/${trabajadorId}/adeudos`);
  }

  /** Historial completo de movimientos, del más reciente al más antiguo. */
  obtenerKardex(trabajadorId: number): Observable<Movimiento[]> {
    if (this.usarDatosDePrueba) {
      const lista = BD.movimientos
        .filter((m) => m.trabajadorId === trabajadorId)
        .map(aMovimiento)
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      return simular(lista);
    }
    return this.http.get<Movimiento[]>(`${this.apiUrl}/trabajadores/${trabajadorId}/kardex`);
  }

  /** Vales del trabajador (de entrega y de adeudos). */
  obtenerVales(trabajadorId: number): Observable<Vale[]> {
    if (this.usarDatosDePrueba) return simular(armarVales(trabajadorId));
    return this.http.get<Vale[]>(`${this.apiUrl}/trabajadores/${trabajadorId}/vales`);
  }

  /** Genera (y guarda) un vale con lo que el trabajador debe en este momento. */
  generarValeAdeudos(trabajadorId: number, emitidoPor: string): Observable<Vale> {
    if (this.usarDatosDePrueba) {
      const t = BD.trabajadores.find((x) => x.id === trabajadorId);
      const adeudos = calcularAdeudos(trabajadorId);
      if (!t) return simularError(404, 'Trabajador no encontrado.');
      if (adeudos.length === 0) return simularError(409, 'El trabajador no tiene adeudos.');
      const vale: Vale = {
        folio: `ADE-${String(BD.valesAdeudo.length + 1).padStart(4, '0')}`,
        tipo: 'ADEUDOS',
        fecha: new Date().toISOString(),
        trabajador: { ...t },
        responsable: emitidoPor,
        observaciones: 'Artículos pendientes de devolución al almacén.',
        renglones: adeudos.map((a) => ({
          descripcion: a.descripcion,
          tipoArticulo: a.tipoArticulo,
          idSerie: a.idSerie,
          cantidad: a.cantidadPendiente,
          estado: 'Pendiente',
        })),
      };
      BD.valesAdeudo.push(vale);
      return simular(vale, 700);
    }
    return this.http.post<Vale>(`${this.apiUrl}/trabajadores/${trabajadorId}/vales/adeudos`, { emitidoPor });
  }

  // ------------------------------------------------------------------
  // BAJA
  // ------------------------------------------------------------------

  /** Registra la baja. El backend vuelve a revisar adeudos (409 si hay). */
  darDeBaja(solicitud: SolicitudBaja): Observable<RespuestaBaja> {
    if (this.usarDatosDePrueba) {
      const adeudos = calcularAdeudos(solicitud.trabajadorId);
      if (adeudos.length > 0) {
        return simularError(409, 'El trabajador tiene adeudos pendientes.', { adeudos });
      }
      const t = BD.trabajadores.find((x) => x.id === solicitud.trabajadorId);
      if (t) {
        t.activo = false;
        t.fechaBaja = solicitud.fechaBaja;
        t.motivoBaja = solicitud.motivo;
      }
      return simular({ ok: true, mensaje: 'Baja registrada correctamente.' }, 700);
    }
    return this.http.post<RespuestaBaja>(`${this.apiUrl}/bajas`, solicitud);
  }
}

// =====================================================================
// A PARTIR DE AQUÍ: SOLO DATOS DE PRUEBA (imitan lo que haría Flask)
// =====================================================================

/** Número de tarjeta de 8 dígitos que no use nadie (en el backend lo genera la BD). */
function generarTarjeta(): string {
  let n: string;
  do {
    n = String(10000000 + Math.floor(Math.random() * 89999999));
  } while (BD.trabajadores.some((x) => x.numeroTarjeta === n));
  return n;
}

/** Envuelve un valor en un Observable con retraso, como si viniera de la red. */
function simular<T>(valor: T, ms = 500): Observable<T> {
  return of(valor).pipe(delay(ms));
}

/** Imita una respuesta de error de Flask (404, 409...). */
function simularError(status: number, mensaje: string, extra: object = {}): Observable<never> {
  return timer(500).pipe(
    switchMap(() => throwError(() => new HttpErrorResponse({ status, error: { ok: false, mensaje, ...extra } })))
  );
}

/** El mismo formato que usa el backend: "IMH-" + id con 5 dígitos. */
function generarNumeroEmpleado(id: number): string {
  return `IMH-${String(id).padStart(5, '0')}`;
}

interface ArticuloBD { clave: string; descripcion: string; tipo: TipoArticulo }
interface MovimientoBD {
  id: number; trabajadorId: number; fecha: string; tipo: TipoMovimiento; clave: string;
  idSerie: string | null; cantidad: number; almacen: string; folioVale: string | null; responsable: string;
}

/** Convierte un movimiento interno al formato que devuelve la API. */
function aMovimiento(m: MovimientoBD): Movimiento {
  const a = BD.articulos.find((x) => x.clave === m.clave)!;
  return {
    id: m.id, fecha: m.fecha, tipo: m.tipo, articuloClave: m.clave, descripcion: a.descripcion,
    tipoArticulo: a.tipo, idSerie: m.idSerie, cantidad: m.cantidad, almacen: m.almacen,
    folioVale: m.folioVale, responsable: m.responsable,
  };
}

/**
 * Regla de adeudos (la misma que la consulta SQL del backend):
 * por cada artículo (y cada pieza con ID), lo entregado + repuesto
 * menos lo devuelto. Los consumibles se ignoran.
 */
function calcularAdeudos(trabajadorId: number): Adeudo[] {
  const grupos = new Map<string, Adeudo>();
  const movs = BD.movimientos
    .filter((m) => m.trabajadorId === trabajadorId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (const m of movs) {
    const mov = aMovimiento(m);
    if (mov.tipoArticulo === 'Consumible') continue; // los consumibles no son adeudo
    const llave = `${m.clave}|${m.idSerie ?? ''}`;
    if (!grupos.has(llave)) {
      grupos.set(llave, {
        articuloClave: m.clave, descripcion: mov.descripcion, tipoArticulo: mov.tipoArticulo,
        idSerie: m.idSerie, cantidadPendiente: 0, fechaEntrega: m.fecha, almacen: m.almacen, folioVale: m.folioVale,
      });
    }
    const g = grupos.get(llave)!;
    if (m.tipo === 'ENTREGA' || m.tipo === 'REPOSICION') g.cantidadPendiente += m.cantidad;
    if (m.tipo === 'DEVOLUCION') g.cantidadPendiente -= m.cantidad;
  }
  return [...grupos.values()].filter((g) => g.cantidadPendiente > 0);
}

/** Arma los vales de entrega agrupando movimientos por folio, y agrega los de adeudos. */
function armarVales(trabajadorId: number): Vale[] {
  const t = BD.trabajadores.find((x) => x.id === trabajadorId);
  if (!t) return [];
  const porFolio = new Map<string, MovimientoBD[]>();
  for (const m of BD.movimientos) {
    if (m.trabajadorId !== trabajadorId || m.tipo !== 'ENTREGA' || !m.folioVale) continue;
    porFolio.set(m.folioVale, [...(porFolio.get(m.folioVale) ?? []), m]);
  }
  const entregas: Vale[] = [...porFolio.entries()].map(([folio, movs]) => ({
    folio,
    tipo: 'ENTREGA',
    fecha: movs[0].fecha,
    trabajador: { ...t },
    responsable: movs[0].responsable,
    observaciones: 'Equipo para trabajos dentro de Mittal.',
    renglones: movs.map((m) => {
      const mov = aMovimiento(m);
      return { descripcion: mov.descripcion, tipoArticulo: mov.tipoArticulo, idSerie: m.idSerie, cantidad: m.cantidad, estado: 'Bueno' };
    }),
  }));
  const adeudos = BD.valesAdeudo.filter((v) => v.trabajador.id === trabajadorId);
  return [...entregas, ...adeudos].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Fecha de hace n días como "AAAA-MM-DD". */
function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Arma el tablero con la "base de datos" en memoria (lo mismo que haría GET /api/rh/resumen). */
function calcularResumen(): ResumenRh {
  const hace30 = haceDias(30);
  const activos = BD.trabajadores.filter((t) => t.activo);
  const inactivos = BD.trabajadores.filter((t) => !t.activo);

  const conAdeudos = BD.trabajadores
    .map((t) => ({ t, adeudos: calcularAdeudos(t.id) }))
    .filter((x) => x.adeudos.length > 0)
    .map(({ t, adeudos }) => ({
      trabajador: { ...t },
      articulos: adeudos.reduce((s, a) => s + a.cantidadPendiente, 0),
      diasMayor: Math.max(...adeudos.map((a) => diasDesde(a.fechaEntrega))),
    }))
    .sort((a, b) => b.diasMayor - a.diasMayor);

  const pendientes = activos
    .map((t) => {
      const faltan = (Object.keys(TEXTO_DOCUMENTO) as (keyof DocumentosTrabajador)[])
        .filter((k) => !t.documentos[k])
        .map((k) => TEXTO_DOCUMENTO[k]);
      if (!t.induccionSeguridad) faltan.push('Inducción de seguridad');
      return { trabajador: { ...t }, faltan };
    })
    .filter((p) => p.faltan.length > 0);

  const areas = new Map<string, number>();
  for (const t of activos) areas.set(t.area, (areas.get(t.area) ?? 0) + 1);

  const nombres = new Map(BD.trabajadores.map((t) => [t.id, nombreCompleto(t)]));
  const movimientos = [...BD.movimientos]
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .slice(0, 8)
    .map((m) => ({ ...aMovimiento(m), trabajadorId: m.trabajadorId, trabajador: nombres.get(m.trabajadorId) ?? '' }));

  const recientes = [
    ...BD.trabajadores.map((t) => ({ trabajador: { ...t }, tipo: 'alta' as const, fecha: t.fechaIngreso, detalle: t.puesto })),
    ...inactivos
      .filter((t) => t.fechaBaja)
      .map((t) => ({ trabajador: { ...t }, tipo: 'baja' as const, fecha: t.fechaBaja!, detalle: t.motivoBaja ?? '' })),
  ]
    .filter((r) => r.fecha <= hoyIso())
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 6);

  return {
    activos: activos.length,
    inactivos: inactivos.length,
    altasMes: activos.filter((t) => t.fechaIngreso >= hace30).length,
    bajasMes: inactivos.filter((t) => (t.fechaBaja ?? '') >= hace30).length,
    conAdeudos,
    pendientes,
    porArea: [...areas.entries()].map(([area, total]) => ({ area, total })).sort((a, b) => b.total - a.total),
    movimientos,
    recientes,
  };
}

/** Credencial y cursos de los trabajadores de prueba (por id). */
const CREDENCIALES: Record<number, Omit<DatosCredencial, never> & { compania: string }> = {
  1: credencial('10000101', '2026-09-10', [['BASICO', '130101', '2027-09-10'], ['ALTURAS', '130102', '2027-03-15'], ['CONFINADOS', '130103', '2027-03-15']]),
  2: credencial('10000102', '2026-08-01', [['BASICO', '130201', '2027-08-01'], ['CALIENTE', '130202', '2027-02-01']]),
  3: credencial('10000103', '2025-01-20', [['BASICO', '120301', '2026-01-20']]),
  4: credencial('10000104', '2026-10-01', [], false),
  5: credencial('10000105', '2026-09-22', [['BASICO', '130501', '2027-09-22'], ['ALTURAS', '130502', '2027-09-22']]),
  6: credencial('10000106', '2026-07-14', [['BASICO', '130601', '2027-07-14'], ['ALTURAS', '130602', '2026-08-30'], ['LOTO', '130603', '2027-07-14']]),
  7: credencial('10000107', '2026-03-02', [['BASICO', '130701', '2027-03-02']]),
  8: credencial('10000108', '2026-05-18', [['BASICO', '130801', '2027-05-18'], ['ALTURAS', '130802', '2027-05-18'], ['CONFINADOS', '130803', '2027-05-18']]),
};

function credencial(tarjeta: string, emision: string, cursos: [string, string, string][], reglas = true) {
  return {
    numeroTarjeta: tarjeta,
    compania: COMPANIA,
    administrador: 'Adriana González',
    fechaEmision: emision,
    foto: null,
    cursos: cursos.map(([clave, folio, vigencia]) => ({ clave, folio, vigencia })),
    reglasOro: reglas,
    fpsNivel0: reglas,
  };
}

const DOCS_COMPLETOS = { identificacion: true, comprobanteDomicilio: true, datosBancarios: true, contratoFirmado: true, altaImss: true };

/** "Base de datos" en memoria. Se reinicia al recargar la página. */
const BD = {
  articulos: [
    { clave: 'ARN-KEV', descripcion: 'Arnés Kevlar', tipo: 'EPP' },
    { clave: 'ARN-POL', descripcion: 'Arnés Poliéster', tipo: 'EPP' },
    { clave: 'BAN-001', descripcion: 'Bandola', tipo: 'EPP' },
    { clave: 'MIN-001', descripcion: 'Minipulidor', tipo: 'Herramienta' },
    { clave: 'FLX-001', descripcion: 'Flexómetro', tipo: 'Herramienta' },
    { clave: 'DET-GAS', descripcion: 'Detector de gases', tipo: 'Equipo' },
    { clave: 'RET-3M', descripcion: 'Retráctil 3 m', tipo: 'EPP' },
    { clave: 'MAR-BOL', descripcion: 'Marro bola', tipo: 'Herramienta' },
    { clave: 'CIN-001', descripcion: 'Cincel', tipo: 'Herramienta' },
    { clave: 'EXT-ELE', descripcion: 'Extensión eléctrica', tipo: 'Herramienta' },
    { clave: 'REF-LAM', descripcion: 'Reflector o lámpara', tipo: 'Herramienta' },
    { clave: 'PET-001', descripcion: 'Peto', tipo: 'EPP' },
    { clave: 'POL-001', descripcion: 'Polainas', tipo: 'EPP' },
    { clave: 'DIS-9', descripcion: 'Disco de corte 9"', tipo: 'Consumible' },
    { clave: 'DIS-45', descripcion: 'Disco de corte 4 1/2"', tipo: 'Consumible' },
    { clave: 'GUA-CAR', descripcion: 'Guantes de carnaza', tipo: 'Consumible' },
  ] as ArticuloBD[],

  trabajadores: [
    {
      id: 1, numeroEmpleado: 'IMH-00001', nombres: 'Juan', apellidoPaterno: 'Pérez', apellidoMaterno: 'García',
      curp: 'PEGJ900101HJCRRN01', rfc: 'PEGJ900101AB1', nss: '12345678901', telefono: '3312345678',
      puesto: 'Técnico electromecánico', area: 'Mantenimiento', contrato: 'LC-2026-001', supervisor: 'R. Martínez',
      fechaIngreso: '2026-09-10', tallaRopa: 'M', tallaCalzado: '27', documentos: DOCS_COMPLETOS,
      induccionSeguridad: true, activo: true, fechaBaja: null, motivoBaja: null,
    },
    {
      id: 2, numeroEmpleado: 'IMH-00002', nombres: 'María Fernanda', apellidoPaterno: 'Ruiz', apellidoMaterno: 'Lozano',
      curp: 'RULM950312MJCZZR02', rfc: 'RULM950312XY2', nss: '98765432109', telefono: '3398765432',
      puesto: 'Soldadora', area: 'Pailería', contrato: 'LC-2026-004', supervisor: 'R. Martínez',
      fechaIngreso: '2026-08-01', tallaRopa: 'S', tallaCalzado: '24', documentos: DOCS_COMPLETOS,
      induccionSeguridad: true, activo: true, fechaBaja: null, motivoBaja: null,
    },
    {
      id: 3, numeroEmpleado: 'IMH-00003', nombres: 'Carlos', apellidoPaterno: 'Ramírez', apellidoMaterno: 'Ortega',
      curp: 'RAOC880720HJCMRR03', rfc: 'RAOC880720QW3', nss: '45678912301', telefono: '3345678912',
      puesto: 'Ayudante general', area: 'Almacén', contrato: 'LC-2025-019', supervisor: 'J. Torres',
      fechaIngreso: '2025-01-20', tallaRopa: 'L', tallaCalzado: '28', documentos: DOCS_COMPLETOS,
      induccionSeguridad: true, activo: false, fechaBaja: '2026-06-30', motivoBaja: 'Término de contrato',
    },
    {
      id: 4, numeroEmpleado: 'IMH-00004', nombres: 'Luis Alberto', apellidoPaterno: 'Hernández', apellidoMaterno: 'Mora',
      curp: 'HEML980214HJCRRS04', rfc: 'HEML980214AB4', nss: '23456789012', telefono: '3311223344',
      puesto: 'Pailero', area: 'Pailería', contrato: 'LC-2026-007', supervisor: 'J. Torres',
      fechaIngreso: '2026-10-01', tallaRopa: 'L', tallaCalzado: '27',
      documentos: { ...DOCS_COMPLETOS, contratoFirmado: false, altaImss: false },
      induccionSeguridad: false, activo: true, fechaBaja: null, motivoBaja: null,
    },
    {
      id: 5, numeroEmpleado: 'IMH-00005', nombres: 'Ana Sofía', apellidoPaterno: 'Torres', apellidoMaterno: 'Vega',
      curp: 'TOVA990505MJCRGN05', rfc: 'TOVA990505CD5', nss: '34567890123', telefono: '3322334455',
      puesto: 'Técnica en alturas', area: 'Mantenimiento', contrato: 'LC-2026-006', supervisor: 'R. Martínez',
      fechaIngreso: '2026-09-22', tallaRopa: 'S', tallaCalzado: '23', documentos: DOCS_COMPLETOS,
      induccionSeguridad: true, activo: true, fechaBaja: null, motivoBaja: null,
    },
    {
      id: 6, numeroEmpleado: 'IMH-00006', nombres: 'Roberto', apellidoPaterno: 'Vega', apellidoMaterno: 'Lara',
      curp: 'VELR850909HJCGRB06', rfc: 'VELR850909EF6', nss: '45678901234', telefono: '3333445566',
      puesto: 'Electricista', area: 'Eléctrico', contrato: 'LC-2026-002', supervisor: 'J. Torres',
      fechaIngreso: '2026-07-14', tallaRopa: 'XL', tallaCalzado: '29',
      documentos: { ...DOCS_COMPLETOS, datosBancarios: false },
      induccionSeguridad: true, activo: true, fechaBaja: null, motivoBaja: null,
    },
    {
      id: 7, numeroEmpleado: 'IMH-00007', nombres: 'Pedro', apellidoPaterno: 'Núñez', apellidoMaterno: 'Salas',
      curp: 'NUSP900303HJCXLD07', rfc: 'NUSP900303GH7', nss: '56789012345', telefono: '3344556677',
      puesto: 'Ayudante general', area: 'Almacén', contrato: 'LC-2026-003', supervisor: 'J. Torres',
      fechaIngreso: '2026-03-02', tallaRopa: 'M', tallaCalzado: '26', documentos: DOCS_COMPLETOS,
      induccionSeguridad: true, activo: false, fechaBaja: '2026-10-03', motivoBaja: 'Renuncia voluntaria',
    },
    {
      id: 8, numeroEmpleado: 'IMH-00008', nombres: 'Laura', apellidoPaterno: 'Ríos', apellidoMaterno: 'Medina',
      curp: 'RIML920618MJCSDR08', rfc: 'RIML920618IJ8', nss: '67890123456', telefono: '3355667788',
      puesto: 'Supervisora de seguridad', area: 'Mantenimiento', contrato: 'LC-2026-005', supervisor: 'R. Martínez',
      fechaIngreso: '2026-05-18', tallaRopa: 'M', tallaCalzado: '24', documentos: DOCS_COMPLETOS,
      induccionSeguridad: true, activo: true, fechaBaja: null, motivoBaja: null,
    },
  ].map((t) => ({ ...t, ...CREDENCIALES[t.id] })) as Trabajador[],

  movimientos: [
    // Juan: vale 0001 (como el ejemplo impreso). Debe arnés, bandola, minipulidor y detector.
    { id: 1, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'ARN-KEV', idSerie: 'ALT-011', cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 2, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'BAN-001', idSerie: 'ALT-031', cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 3, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'MIN-001', idSerie: 'HER-102', cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 4, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'DET-GAS', idSerie: 'EQ-007', cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 5, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'FLX-001', idSerie: null, cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 6, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'DIS-45', idSerie: null, cantidad: 4, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 7, trabajadorId: 1, fecha: '2026-09-15T08:30:00', tipo: 'ENTREGA', clave: 'GUA-CAR', idSerie: null, cantidad: 2, almacen: 'Contratistas (Mittal)', folioVale: '0001', responsable: 'Oscar Salas' },
    { id: 8, trabajadorId: 1, fecha: '2026-09-29T16:10:00', tipo: 'DEVOLUCION', clave: 'FLX-001', idSerie: null, cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: null, responsable: 'Oscar Salas' },
    { id: 9, trabajadorId: 1, fecha: '2026-10-02T07:45:00', tipo: 'DANO', clave: 'MIN-001', idSerie: 'HER-102', cantidad: 1, almacen: 'Contratistas (Mittal)', folioVale: null, responsable: 'Oscar Salas' },
    // María: recibió y devolvió todo. Los consumibles no cuentan.
    { id: 10, trabajadorId: 2, fecha: '2026-08-04T09:00:00', tipo: 'ENTREGA', clave: 'ARN-POL', idSerie: 'ALT-024', cantidad: 1, almacen: 'Midrex', folioVale: '0002', responsable: 'Ana López' },
    { id: 11, trabajadorId: 2, fecha: '2026-08-04T09:00:00', tipo: 'ENTREGA', clave: 'MAR-BOL', idSerie: null, cantidad: 1, almacen: 'Midrex', folioVale: '0002', responsable: 'Ana López' },
    { id: 12, trabajadorId: 2, fecha: '2026-08-04T09:00:00', tipo: 'ENTREGA', clave: 'GUA-CAR', idSerie: null, cantidad: 3, almacen: 'Midrex', folioVale: '0002', responsable: 'Ana López' },
    { id: 13, trabajadorId: 2, fecha: '2026-09-30T15:20:00', tipo: 'DEVOLUCION', clave: 'ARN-POL', idSerie: 'ALT-024', cantidad: 1, almacen: 'Midrex', folioVale: null, responsable: 'Ana López' },
    { id: 14, trabajadorId: 2, fecha: '2026-09-30T15:20:00', tipo: 'DEVOLUCION', clave: 'MAR-BOL', idSerie: null, cantidad: 1, almacen: 'Midrex', folioVale: null, responsable: 'Ana López' },
    // Ana Sofía: debe un arnés.
    { id: 15, trabajadorId: 5, fecha: '2026-09-23T07:50:00', tipo: 'ENTREGA', clave: 'ARN-POL', idSerie: 'ALT-055', cantidad: 1, almacen: 'Central Kepler', folioVale: '0003', responsable: 'Oscar Salas' },
    { id: 16, trabajadorId: 5, fecha: '2026-09-23T07:50:00', tipo: 'ENTREGA', clave: 'DIS-9', idSerie: null, cantidad: 3, almacen: 'Central Kepler', folioVale: '0003', responsable: 'Oscar Salas' },
    // Roberto: devolvió el reflector, debe la extensión.
    { id: 17, trabajadorId: 6, fecha: '2026-08-10T08:15:00', tipo: 'ENTREGA', clave: 'EXT-ELE', idSerie: null, cantidad: 1, almacen: 'HYL', folioVale: '0004', responsable: 'Ana López' },
    { id: 18, trabajadorId: 6, fecha: '2026-08-10T08:15:00', tipo: 'ENTREGA', clave: 'REF-LAM', idSerie: null, cantidad: 1, almacen: 'HYL', folioVale: '0004', responsable: 'Ana López' },
    { id: 19, trabajadorId: 6, fecha: '2026-09-01T17:30:00', tipo: 'DEVOLUCION', clave: 'REF-LAM', idSerie: null, cantidad: 1, almacen: 'HYL', folioVale: null, responsable: 'Ana López' },
    // Laura: todo devuelto.
    { id: 20, trabajadorId: 8, fecha: '2026-10-06T09:10:00', tipo: 'ENTREGA', clave: 'FLX-001', idSerie: null, cantidad: 1, almacen: 'Midrex', folioVale: '0005', responsable: 'Ana López' },
    { id: 21, trabajadorId: 8, fecha: '2026-10-07T14:00:00', tipo: 'DEVOLUCION', clave: 'FLX-001', idSerie: null, cantidad: 1, almacen: 'Midrex', folioVale: null, responsable: 'Ana López' },
  ] as MovimientoBD[],

  valesAdeudo: [] as Vale[],
};
