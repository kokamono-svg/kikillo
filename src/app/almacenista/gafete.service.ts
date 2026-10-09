// =====================================================================
// gafete.service.ts
// Lee el QR o código de barras del gafete y busca al trabajador en RH.
//
// Cada empresa graba algo distinto en el gafete, así que se acepta:
//   - el N° de tarjeta de la credencial (lo normal: es lo que guarda su QR)
//   - el número de empleado (IMH-00001, o solo 00001 / 1)
//   - el NSS (11 dígitos) o la CURP (18 caracteres)
//   - una dirección web que traiga alguno de esos datos (…/empleado/IMH-00001)
//   - texto o JSON con varios datos ({"num":"IMH-00001","nombre":"..."})
// Se prueba cada "pedazo" del texto hasta que uno coincida EXACTO con un
// trabajador (no por parecido: un gafete equivocado no debe llenar el vale).
// =====================================================================
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, defaultIfEmpty, filter, from, map, of, take } from 'rxjs';
import { RhService } from '../rh/rh.service';
import { Adeudo, Trabajador } from '../rh/rh.model';
import { limpiarCodigo, llaveCodigo } from '../compartido/codigos';

export interface LecturaGafete {
  /** Lo que mandó el lector, tal cual (para mostrarlo si no se encontró a nadie). */
  leido: string;
  trabajador: Trabajador | null;
  adeudos: Adeudo[];
  /** Si RH no respondió (sin conexión o sin permiso). */
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class GafeteService {
  private rh = inject(RhService);

  leer(texto: string): Observable<LecturaGafete> {
    const leido = texto.trim();
    const candidatos = extraerCandidatos(leido).slice(0, 8);
    const completo = limpiarCodigo(leido);
    if (!candidatos.length) return of({ leido, trabajador: null, adeudos: [] });

    return from(candidatos).pipe(
      // Uno por uno, en orden: el primero que coincida exacto gana
      concatMap((c) => this.rh.buscarTrabajadores(c).pipe(map((lista) => lista.find((t) => coincide(t, c, c === completo)) ?? null))),
      filter((t): t is Trabajador => t !== null),
      take(1),
      concatMap((trabajador) =>
        this.rh.obtenerAdeudos(trabajador.id).pipe(
          catchError(() => of([] as Adeudo[])),
          map((adeudos) => ({ leido, trabajador, adeudos })),
        ),
      ),
      defaultIfEmpty({ leido, trabajador: null, adeudos: [] } as LecturaGafete),
      catchError(() => of({ leido, trabajador: null, adeudos: [], error: 'No se pudo consultar a Recursos Humanos.' })),
    );
  }
}

/**
 * Saca del texto del gafete los "pedazos" que pueden identificar al trabajador.
 * Ej. "https://imhotep.mx/gafete?id=IMH-00001" → ["IMH-00001", ...]
 */
export function extraerCandidatos(texto: string): string[] {
  // Pistola con teclado en inglés y PC en español: el guion llega como apóstrofo
  let t = texto.trim().replace(/'/g, '-');
  const piezas: string[] = [];

  // JSON: se toman todos sus valores
  if (t.startsWith('{')) {
    try {
      piezas.push(...Object.values(JSON.parse(t) as Record<string, unknown>).map(String));
    } catch {
      /* no era JSON: se trata como texto */
    }
  }
  // URL: se toman los valores de ?parametros y los tramos de la ruta (del último al primero)
  try {
    const url = new URL(t);
    piezas.push(...url.searchParams.values(), ...url.pathname.split('/').reverse());
    t = '';
  } catch {
    /* no era URL */
  }
  piezas.push(t);

  const vistos = new Set<string>();
  return piezas
    .flatMap((p) => [p, ...p.split(/[^A-Za-z0-9-]+/)]) // el texto completo y cada palabra
    .map(limpiarCodigo)
    .filter((p) => p.length >= 1 && p.length <= 40 && !vistos.has(p) && vistos.add(p));
}

/**
 * ¿Este pedazo del gafete es EXACTAMENTE de este trabajador?
 * "esTodo" = el pedazo es todo lo que trae el gafete. El número corto sin
 * prefijo (1 = IMH-00001) solo se acepta así: dentro de un texto largo, un
 * "1" suelto puede ser cualquier cosa y llenaría el vale con otra persona.
 */
export function coincide(t: Trabajador, c: string, esTodo: boolean): boolean {
  // Todo se compara sin separadores: IMH-00001 = IMH00001 = IMH'00001
  const llave = llaveCodigo(c);
  if (!llave) return false;
  // 1) N° de tarjeta: es lo que guarda el QR de la credencial (00047659 = 47659)
  const tarjeta = llaveCodigo(t.numeroTarjeta ?? '');
  const soloDigitos = (x: string) => /^[0-9]+$/.test(x);
  if (tarjeta && (llave === tarjeta || (llave.length >= 4 && soloDigitos(llave) && soloDigitos(tarjeta) && Number(llave) === Number(tarjeta)))) return true;
  // 2) Número de empleado
  const num = llaveCodigo(t.numeroEmpleado);
  if (llave === num) return true;
  // 3) Solo dígitos: puede ser el NSS o el número de empleado sin prefijo (00001 = IMH-00001)
  if (soloDigitos(llave)) {
    if (llave === t.nss) return true;
    const digitos = num.replace(/[^0-9]/g, '');
    if (esTodo && digitos && Number(llave) === Number(digitos) && llave.length <= digitos.length) return true;
  }
  // 4) CURP
  return !!t.curp && llave === llaveCodigo(t.curp);
}
