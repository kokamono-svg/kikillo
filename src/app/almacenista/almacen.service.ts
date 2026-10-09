import { Injectable, computed, signal } from '@angular/core';
import { Articulo, Vale } from './almacen.models';

/* =====================================================
   SERVICIO DEL ALMACÉN
   Un "service" es una clase que guarda datos y lógica
   que pueden usar varios componentes.
   providedIn: 'root' = Angular crea UNA sola instancia
   para toda la app (todos ven los mismos datos).

   Por ahora los datos son de ejemplo y se guardan en
   localStorage (memoria del navegador). Cuando tengan
   backend, solo se cambia este archivo: los componentes
   no se enteran.
===================================================== */

const CLAVE_CATALOGO = 'imhotep.catalogo';
const CLAVE_VALES = 'imhotep.vales';

/** Catálogo inicial: los 15 artículos de la hoja "Equipo y herramienta para 1 trabajador dentro de Mittal". */
const CATALOGO_INICIAL: Articulo[] = [
  {
    codigo: 'ALT-KEV', nombre: 'Arnés Kevlar', tipo: 'EPP', stock: 0, limite: 1,
    piezas: [
      { serie: 'ALT-001', estado: 'apto', ultimaInspeccion: '2026-09-20', prestada: false },
      { serie: 'ALT-002', estado: 'apto', ultimaInspeccion: '2026-09-20', prestada: false },
      { serie: 'ALT-003', estado: 'no apto', ultimaInspeccion: '2026-08-02', prestada: false },
    ],
  },
  {
    codigo: 'ALT-POL', nombre: 'Arnés Poliéster', tipo: 'EPP', stock: 0, limite: 1,
    piezas: [
      { serie: 'ALT-024', estado: 'apto', ultimaInspeccion: '2026-09-28', prestada: false },
      { serie: 'ALT-025', estado: 'apto', ultimaInspeccion: '2026-09-28', prestada: false },
    ],
  },
  {
    codigo: 'ALT-BAN', nombre: 'Bandola', tipo: 'EPP', stock: 0, limite: 1,
    piezas: [
      { serie: 'BAN-010', estado: 'apto', ultimaInspeccion: '2026-09-15', prestada: false },
      { serie: 'BAN-011', estado: 'no apto', ultimaInspeccion: '2026-07-30', prestada: false },
      { serie: 'BAN-012', estado: 'apto', ultimaInspeccion: '2026-09-15', prestada: false },
    ],
  },
  {
    codigo: 'ALT-GAN', nombre: 'Gancho doble de vida', tipo: 'EPP', stock: 0, limite: 1,
    piezas: [
      { serie: 'GAN-100', estado: 'apto', ultimaInspeccion: '2026-09-10', prestada: false },
      { serie: 'GAN-101', estado: 'apto', ultimaInspeccion: '2026-09-10', prestada: false },
    ],
  },
{codigo: 'HER-MPU',nombre: 'Minipulidor',tipo: 'Herramienta',stock: 0,limite: 1,piezas: [{serie: 'MPU-001',estado: 'apto',ultimaInspeccion: '2026-10-08',prestada: false},{serie: 'MPU-002',estado: 'apto',ultimaInspeccion: '2026-10-08',prestada: false},{serie: 'MPU-003',estado: 'apto',ultimaInspeccion: '2026-10-08',prestada: false }]},
  { codigo: 'HER-FLX', nombre: 'Flexómetro', tipo: 'Herramienta', stock: 20, limite: 1 },
  { codigo: 'HER-GAS', nombre: 'Detector de gases', tipo: 'Herramienta', stock: 3, limite: 1 },
  { codigo: 'EPP-RET', nombre: 'Retráctil 3 mts', tipo: 'EPP', stock: 8, limite: 1 },
  { codigo: 'HER-MAR', nombre: 'Marro bola', tipo: 'Herramienta', stock: 10, limite: 1 },
  { codigo: 'HER-CIN', nombre: 'Cincel', tipo: 'Herramienta', stock: 15, limite: 2 },
  { codigo: 'HER-EXT', nombre: 'Extensión eléctrica', tipo: 'Herramienta', stock: 9, limite: 1 },
  { codigo: 'HER-REF', nombre: 'Reflector o lámpara', tipo: 'Herramienta', stock: 7, limite: 1 },
  { codigo: 'EPP-PET', nombre: 'Peto', tipo: 'EPP', stock: 25, limite: 1 },
  { codigo: 'EPP-POL', nombre: 'Polainas', tipo: 'EPP', stock: 25, limite: 1 },
  { codigo: 'HER-D9', nombre: 'Discos de corte 9"', tipo: 'Herramienta', stock: 80, limite: 5 },
  { codigo: 'HER-D45', nombre: 'Discos de corte 4 1/2"', tipo: 'Herramienta', stock: 120, limite: 10 },
];

@Injectable({ providedIn: 'root' })
export class AlmacenService {
  /* signal = una "caja" con un valor. Cuando cambia, la pantalla se actualiza sola. */
  readonly catalogo = signal<Articulo[]>(this.leer(CLAVE_CATALOGO, CATALOGO_INICIAL));
  readonly vales = signal<Vale[]>(this.leer(CLAVE_VALES, []));

  /** El siguiente folio: V-0001, V-0002... (computed se recalcula solo cuando cambian los vales) */
  readonly siguienteFolio = computed(() => 'V-' + String(this.vales().length + 1).padStart(4, '0'));

  /** Busca un artículo por su código (lo que manda el QR o la pistola). */
  buscarPorCodigo(codigo: string): Articulo | undefined {
    const c = codigo.trim().toUpperCase();
    // Se acepta el código del artículo (ALT-KEV) o la serie de una pieza (ALT-024)
    return this.catalogo().find(
      (a) => a.codigo === c || a.piezas?.some((p) => p.serie === c),
    );
  }

  /** Cuántas unidades se pueden entregar ahora mismo. */
  disponibles(a: Articulo): number {
    return a.piezas ? a.piezas.filter((p) => p.estado === 'apto' && !p.prestada).length : a.stock;
  }

  /**
   * Guarda el vale y descuenta existencias.
   * update() recibe el valor anterior y devuelve el nuevo
   * (no se modifica el original: se crea una copia).
   */
  registrarVale(vale: Vale): void {
    this.catalogo.update((lista) =>
      lista.map((a) => {
        const lineas = vale.lineas.filter((l) => l.codigo === a.codigo);
        if (lineas.length === 0) return a;
        if (a.piezas) {
          const series = lineas.map((l) => l.serie);
          return { ...a, piezas: a.piezas.map((p) => (series.includes(p.serie) ? { ...p, prestada: true } : p)) };
        }
        const total = lineas.reduce((s, l) => s + l.cantidad, 0);
        return { ...a, stock: a.stock - total };
      }),
    );
    this.vales.update((lista) => [vale, ...lista]);
    this.guardar();
  }

  /** Vuelve a los datos de ejemplo (útil antes de la demostración). */
  reiniciar(): void {
    this.catalogo.set(structuredClone(CATALOGO_INICIAL));
    this.vales.set([]);
    this.guardar();
  }

  /* ---------- localStorage: try/catch porque en modo incógnito puede fallar ---------- */
  private leer<T>(clave: string, porDefecto: T): T {
    try {
      const texto = localStorage.getItem(clave);
      return texto ? (JSON.parse(texto) as T) : structuredClone(porDefecto);
    } catch {
      return structuredClone(porDefecto);
    }
  }

  private guardar(): void {
    try {
      localStorage.setItem(CLAVE_CATALOGO, JSON.stringify(this.catalogo()));
      localStorage.setItem(CLAVE_VALES, JSON.stringify(this.vales()));
    } catch {
      /* si no se puede guardar, los datos siguen en memoria mientras la página esté abierta */
    }
  }
}
