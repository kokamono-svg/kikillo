// =====================================================================
// cursos.ts
// Cursos de seguridad que puede tener un trabajador (van en su credencial
// / kardex) y que el almacén revisa antes de prestar ciertos artículos.
// Ej.: un arnés solo se presta a quien tiene "Trabajos en altura" vigente.
// =====================================================================

export interface CursoCatalogo {
  clave: string;
  nombre: string;
}

/** Catálogo de cursos. La clave es la que se guarda; el nombre, el que se imprime. */
export const CURSOS: CursoCatalogo[] = [
  { clave: 'INDUCCION', nombre: 'Inducción de seguridad' },
  { clave: 'BASICO', nombre: 'Curso básico de seguridad - Externo' },
  { clave: 'ALTURAS', nombre: 'Trabajos en altura' },
  { clave: 'CONFINADOS', nombre: 'Espacios confinados' },
  { clave: 'CALIENTE', nombre: 'Trabajos en caliente (corte y soldadura)' },
  { clave: 'LOTO', nombre: 'Bloqueo y etiquetado (LOTO)' },
  { clave: 'IZAJE', nombre: 'Maniobras e izaje' },
];

/** Un curso que tomó el trabajador. */
export interface CursoTrabajador {
  clave: string; // del catálogo
  folio: string; // "ID" del curso en la credencial, ej. 132743
  vigencia: string; // AAAA-MM-DD: hasta cuándo es válido
}

export function nombreCurso(clave: string): string {
  return CURSOS.find((c) => c.clave === clave)?.nombre ?? clave;
}

/** Hoy en AAAA-MM-DD con hora local. */
function hoy(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** ¿Sigue vigente? (vence al terminar el día de su vigencia) */
export function cursoVigente(c: CursoTrabajador): boolean {
  return !!c.vigencia && c.vigencia >= hoy();
}

/** Sin la inducción vigente no se le entrega EPP ni inicia actividades. */
export const CURSO_INDUCCION = 'INDUCCION';

/** ¿Tiene la inducción de seguridad vigente? */
export function tieneInduccion(cursos: CursoTrabajador[] | undefined): boolean {
  return clavesVigentes(cursos).includes(CURSO_INDUCCION);
}

/** Claves de los cursos vigentes de un trabajador. */
export function clavesVigentes(cursos: CursoTrabajador[] | undefined): string[] {
  return (cursos ?? []).filter(cursoVigente).map((c) => c.clave);
}
