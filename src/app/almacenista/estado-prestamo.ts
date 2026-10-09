import { EstadoPrestamo, TipoArticulo } from './almacen.models';

/** Texto y colores de la etiqueta de estado de un préstamo (mismos colores del dashboard). */
export const ESTADO_PRESTAMO: Record<EstadoPrestamo, { texto: string; etiqueta: string; punto: string }> = {
  activo: {
    texto: 'Prestado',
    etiqueta: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    punto: 'bg-blue-500',
  },
  vencido: {
    texto: 'Vencido',
    etiqueta: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
    punto: 'bg-orange-400',
  },
  devuelto: {
    texto: 'Devuelto',
    etiqueta: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    punto: 'bg-emerald-500',
  },
  entregado: {
    texto: 'Entregado',
    etiqueta: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300',
    punto: 'bg-gray-400',
  },
};

/** Colores de la etiqueta de tipo de artículo. */
export const CLASE_TIPO: Record<TipoArticulo, string> = {
  EPP: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  Herramienta: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  Consumible: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
};
