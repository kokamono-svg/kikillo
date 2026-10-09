// =====================================================================
// codigos.ts
// Una sola regla para TODOS los códigos de la app (series, códigos de
// artículo, N° de tarjeta, número de empleado), se escriban a mano o
// los mande la pistola lectora.
//
// Problema típico: la pistola está configurada con teclado en inglés y
// la PC en español. La tecla del "-" en inglés escribe "'" en español,
// así que ALT-024 llega como ALT'024. Igual pasa con espacios, "_", "´"...
//
//   limpiarCodigo("alt'024 ")  → "ALT-024"   (lo que se guarda y se muestra)
//   llaveCodigo("ALT'024")     → "ALT024"    (lo que se compara)
//   mismoCodigo("ALT024", "alt-024") → true
// =====================================================================

/** Marca temporal para que la Ñ no pierda su tilde al quitar acentos. */
const MARCA_ENE = String.fromCharCode(0xe000); // carácter de uso privado: nunca viene en un código
/** Acentos que quedan sueltos después de normalize('NFD'). */
const ACENTOS = /[\u0300-\u036f]/g;

/** Código listo para guardar: mayúsculas y cualquier separador convertido en "-". */
export function limpiarCodigo(texto: string): string {
  return texto
    .toUpperCase()
    .replaceAll('Ñ', MARCA_ENE)
    .normalize('NFD')
    .replace(ACENTOS, '') // sin acentos: É → E
    .replaceAll(MARCA_ENE, 'Ñ')
    .split(/[^A-Z0-9Ñ]/) // ' ´ ` espacio _ / . etc. son separadores
    .filter(Boolean)
    .join('-');
}

/** Llave para comparar: solo letras y números (los separadores no importan). */
export function llaveCodigo(texto: string): string {
  return limpiarCodigo(texto).replaceAll('-', '');
}

/** ¿Son el mismo código aunque se hayan escrito con distintos separadores? */
export function mismoCodigo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const llave = llaveCodigo(a);
  return llave !== '' && llave === llaveCodigo(b);
}

/** ¿El código contiene lo que se busca? (para buscadores: "mpu'00" encuentra HER-MPU-001) */
export function contieneCodigo(codigo: string, busqueda: string): boolean {
  const b = llaveCodigo(busqueda);
  return b !== '' && llaveCodigo(codigo).includes(b);
}
