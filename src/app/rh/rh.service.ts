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
import {
  Adeudo, Movimiento, NuevoTrabajador, RespuestaBaja, SolicitudBaja,
  TipoArticulo, TipoMovimiento, Trabajador, Vale,
} from './rh.model';

@Injectable({ providedIn: 'root' })
export class RhService {
  private http = inject(HttpClient);

  /** URL de la API de Flask. Cámbiala por la del VPS al publicar. */
  private apiUrl = 'http://localhost:5000/api/rh';

  /** true = datos falsos en memoria; false = llama a Flask de verdad. */
  private usarDatosDePrueba = true;

  // ------------------------------------------------------------------
  // TRABAJADORES
  // ------------------------------------------------------------------

  /** Busca por número de empleado, nombre o CURP. */
  buscarTrabajadores(termino: string): Observable<Trabajador[]> {
    if (this.usarDatosDePrueba) {
      const t = termino.trim().toLowerCase();
      const r = BD.trabajadores.filter((x) =>
        [x.numeroEmpleado, x.nombres, x.apellidoPaterno, x.apellidoMaterno, x.curp]
          .join(' ').toLowerCase().includes(t)
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
      if (BD.trabajadores.some((x) => x.curp === nuevo.curp)) {
        return simularError(409, 'Ya existe un trabajador registrado con esa CURP.');
      }
      const id = Math.max(0, ...BD.trabajadores.map((x) => x.id)) + 1;
      const creado: Trabajador = {
        ...nuevo,
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
  ] as Trabajador[],

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
  ] as MovimientoBD[],

  valesAdeudo: [] as Vale[],
};
