// =====================================================================
// rh.utils.ts
// Funciones pequeñas que usan varias pantallas. Al tenerlas aquí no se
// repiten en cada componente.
// =====================================================================
import { TipoMovimiento, Trabajador } from './rh.model';

/** "Juan" + "Pérez" + "García" -> "Juan Pérez García". */
export function nombreCompleto(t: Trabajador): string {
  return [t.nombres, t.apellidoPaterno, t.apellidoMaterno].filter(Boolean).join(' ');
}

/** Iniciales para el avatar: primera letra del nombre y del apellido paterno. */
export function iniciales(t: Trabajador): string {
  return ((t.nombres[0] ?? '') + (t.apellidoPaterno[0] ?? '')).toUpperCase();
}

/**
 * Texto listo para comparar en búsquedas: sin acentos y en minúsculas.
 * normalize('NFD') separa "é" en "e" + acento, y el replace quita los acentos.
 * Así "PEREZ", "pérez" y "Pérez" quedan iguales.
 */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Días que han pasado desde una fecha ISO hasta hoy. */
export function diasDesde(fechaIso: string): number {
  const ms = Date.now() - new Date(fechaIso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000)); // 86 400 000 ms = 1 día
}

/** Fecha de hoy como "AAAA-MM-DD" (el formato de <input type="date">). */
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Texto y colores de cada tipo de movimiento del kardex. */
export const ESTILO_MOVIMIENTO: Record<TipoMovimiento, { texto: string; clases: string; signo: string }> = {
  ENTREGA:    { texto: 'Entrega',    clases: 'bg-blue-50 text-blue-700 ring-blue-600/20',          signo: '+' },
  DEVOLUCION: { texto: 'Devolución', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', signo: '−' },
  REPOSICION: { texto: 'Reposición', clases: 'bg-slate-100 text-slate-700 ring-slate-500/20',      signo: '+' },
  DANO:       { texto: 'Daño',       clases: 'bg-orange-50 text-orange-700 ring-orange-600/20',    signo: '' },
  PERDIDA:    { texto: 'Pérdida',    clases: 'bg-red-50 text-red-700 ring-red-600/20',             signo: '' },
};
