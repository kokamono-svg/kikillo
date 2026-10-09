import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CerrarSesionComponent } from '../auth/cerrar-sesion/cerrar-sesion.component';

/* ---------- Tipos: describen la forma de los datos ---------- */
type Categoria = 'epp' | 'manual' | 'electrica' | 'medicion' | 'elevacion';

interface Articulo {
  id: string;
  nombre: string;
  categoria: Categoria;
  stock: number;
  prestamo: boolean; // true = se devuelve, false = se entrega al trabajador
  tallas?: string[]; // solo los artículos que llevan talla
}

interface LineaVale {
  clave: string; // id + talla: la misma pieza en dos tallas son dos renglones
  articulo: Articulo;
  cantidad: number;
  talla: string | null;
}
@Component({
  selector: 'app-solicitante.component',
  imports: [CerrarSesionComponent],
  templateUrl: './solicitante.component.html',
  styleUrl: './solicitante.component.css',
})
export class SolicitanteComponent {



  /* ---------- Datos del trabajador (temporales: luego vendrán de tu sesión o API) ---------- */
  readonly trabajador = {
    nombre: inject(AuthService).usuario()?.nombre ?? '',
    nss: '12345678901',
    puesto: 'Técnico mecánico',
  };

  /** Iniciales para el avatar: "Juan Pérez García" → "JP". */
  readonly iniciales = this.trabajador.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  readonly obras = [
    'Planta 1 - Paro programado',
    'Planta 2 - Mantenimiento general',
    'Taller central',
  ];

  readonly fechaHoy = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Fecha mínima del calendario (hoy, en hora local) con formato AAAA-MM-DD
  readonly fechaMinima = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

  /* ---------- Pasos del asistente ---------- */
  readonly pasos = [
    { n: 1, titulo: 'Tus datos' },
    { n: 2, titulo: 'Equipo' },
    { n: 3, titulo: 'Revisar' },
    { n: 4, titulo: 'Enviado' },
  ];

  // Lo que sigue después de enviar (corresponde a los pasos 6 a 9 del proceso de Imhotep)
  readonly siguientes = [
    {
      titulo: 'Almacén prepara tu vale',
      detalle: 'Se genera el vale con tu folio, el artículo, la cantidad, la talla y el estado.',
    },
    {
      titulo: 'Entrega física y revisión',
      detalle: 'Pasa al almacén. Revisan contigo que los artículos coincidan con el vale, y también tallas y estado.',
    },
    {
      titulo: 'Firmas y archivo',
      detalle: 'Firmas que recibes el equipo y te comprometes a cuidarlo. Se guarda una copia en tu expediente.',
    },
    {
      titulo: 'Devolución o reposición',
      detalle: 'Si algo se daña, se desgasta o se pierde, se registra y se genera un nuevo vale.',
    },
  ];

  /* ---------- Catálogo (temporal: luego vendrá de tu API de inventario) ---------- */
  readonly catalogo: Articulo[] = [
    { id: 'casco', nombre: 'Casco de seguridad', categoria: 'epp', stock: 48, prestamo: false },
    { id: 'lentes', nombre: 'Lentes de seguridad', categoria: 'epp', stock: 60, prestamo: false },
    { id: 'guantes', nombre: 'Guantes de protección', categoria: 'epp', stock: 120, prestamo: false, tallas: ['S', 'M', 'L', 'XL'] },
    { id: 'guantes-dielectricos', nombre: 'Guantes dieléctricos clase 2', categoria: 'epp', stock: 4, prestamo: false, tallas: ['M', 'L', 'XL'] },
    { id: 'botas', nombre: 'Botas de seguridad', categoria: 'epp', stock: 36, prestamo: false, tallas: ['25', '26', '27', '28', '29', '30'] },
    { id: 'chaleco', nombre: 'Chaleco de alta visibilidad', categoria: 'epp', stock: 44, prestamo: false, tallas: ['S', 'M', 'L', 'XL'] },
    { id: 'auditiva', nombre: 'Protección auditiva', categoria: 'epp', stock: 30, prestamo: false },
    { id: 'respiratoria', nombre: 'Protección respiratoria', categoria: 'epp', stock: 52, prestamo: false },
    { id: 'arnes', nombre: 'Arnés de seguridad', categoria: 'epp', stock: 3, prestamo: true },
    { id: 'taladro', nombre: 'Taladro percutor Bosch', categoria: 'electrica', stock: 5, prestamo: true },
    { id: 'esmeriladora', nombre: 'Esmeriladora angular 4 1/2"', categoria: 'electrica', stock: 4, prestamo: true },
    { id: 'torque', nombre: 'Llave de torque 1/2"', categoria: 'manual', stock: 2, prestamo: true },
    { id: 'llaves', nombre: 'Juego de llaves combinadas', categoria: 'manual', stock: 14, prestamo: true },
    { id: 'multimetro', nombre: 'Multímetro Fluke 117', categoria: 'medicion', stock: 2, prestamo: true },
    { id: 'vernier', nombre: 'Calibrador vernier', categoria: 'medicion', stock: 6, prestamo: true },
    { id: 'escalera', nombre: 'Escalera telescópica', categoria: 'elevacion', stock: 6, prestamo: true },
    { id: 'polipasto', nombre: 'Polipasto de cadena 1 t', categoria: 'elevacion', stock: 3, prestamo: true },
  ];

  // Texto, icono y colores de cada categoría (las clases van completas para que Tailwind las detecte)
  readonly estilos: Record<Categoria, { etiqueta: string; icono: string; caja: string }> = {
    epp: {
      etiqueta: 'EPP',
      icono: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
      caja: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    manual: {
      etiqueta: 'Herramienta manual',
      icono: 'M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z',
      caja: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    },
    electrica: {
      etiqueta: 'Herramienta eléctrica',
      icono: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
      caja: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    },
    medicion: {
      etiqueta: 'Equipo de medición',
      icono: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
      caja: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    },
    elevacion: {
      etiqueta: 'Equipo de elevación',
      icono: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
      caja: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    },
  };

  readonly categorias: { id: 'todos' | Categoria; nombre: string }[] = [
    { id: 'todos', nombre: 'Todo' },
    { id: 'epp', nombre: 'EPP' },
    { id: 'manual', nombre: 'Manual' },
    { id: 'electrica', nombre: 'Eléctrica' },
    { id: 'medicion', nombre: 'Medición' },
    { id: 'elevacion', nombre: 'Elevación' },
  ];

  /* ---------- Estado (signals): cada cambio actualiza la pantalla solo ---------- */
  readonly paso = signal(1);
  readonly obra = signal('');
  readonly confirmaInduccion = signal(false);

  readonly busqueda = signal('');
  readonly categoriaActiva = signal<'todos' | Categoria>('todos');
  readonly tallasElegidas = signal<Record<string, string>>({});
  readonly carrito = signal<LineaVale[]>([]);
  readonly resumenAbierto = signal(false);

  readonly fechaDevolucion = signal('');
  readonly notas = signal('');
  readonly folio = signal('');

  /* ---------- Valores calculados: se recalculan solos cuando cambia el estado ---------- */
  readonly articulosFiltrados = computed(() => {
    const texto = this.normalizar(this.busqueda().trim());
    const cat = this.categoriaActiva();
    return this.catalogo.filter(
      (a) => (cat === 'todos' || a.categoria === cat) && this.normalizar(a.nombre).includes(texto),
    );
  });

  readonly totalArticulos = computed(() =>
    this.carrito().reduce((suma, l) => suma + l.cantidad, 0),
  );

  readonly requierePrestamo = computed(() => this.carrito().some((l) => l.articulo.prestamo));

  // Mensaje que explica por qué todavía no se puede continuar ('' = ya se puede)
  readonly ayuda = computed(() => {
    switch (this.paso()) {
      case 1:
        if (!this.obra()) return 'Elige la obra donde trabajas.';
        if (!this.confirmaInduccion()) return 'Confirma tu alta e inducción de seguridad.';
        return '';
      case 2:
        return this.carrito().length === 0 ? 'Agrega al menos un artículo a tu vale.' : '';
      case 3:
        return this.requierePrestamo() && !this.fechaDevolucion()
          ? 'Indica cuándo devolverás las herramientas.'
          : '';
      default:
        return '';
    }
  });

  readonly puedeAvanzar = computed(() => this.ayuda() === '');

  readonly fechaDevolucionTexto = computed(() => {
    const f = this.fechaDevolucion();
    return f
      ? new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
  });

  /* ---------- Funciones del catálogo y del vale ---------- */
  cantidadEnVale(id: string): number {
    return this.carrito()
      .filter((l) => l.articulo.id === id)
      .reduce((suma, l) => suma + l.cantidad, 0);
  }

  elegirTalla(id: string, talla: string): void {
    this.tallasElegidas.update((t) => ({ ...t, [id]: talla }));
  }

  puedeAgregar(a: Articulo): boolean {
    if (a.stock === 0 || this.cantidadEnVale(a.id) >= a.stock) return false;
    return !a.tallas || !!this.tallasElegidas()[a.id];
  }

  textoBoton(a: Articulo): string {
    if (a.stock === 0) return 'Agotado';
    if (this.cantidadEnVale(a.id) >= a.stock) return 'Ya pediste todo el stock';
    if (a.tallas && !this.tallasElegidas()[a.id]) return 'Elige una talla';
    return 'Agregar al vale';
  }

  agregar(a: Articulo): void {
    if (!this.puedeAgregar(a)) return;
    const talla = a.tallas ? this.tallasElegidas()[a.id] : null;
    const clave = `${a.id}-${talla ?? 'unica'}`;

    this.carrito.update((lineas) => {
      const existe = lineas.some((l) => l.clave === clave);
      return existe
        ? lineas.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + 1 } : l))
        : [...lineas, { clave, articulo: a, cantidad: 1, talla }];
    });
  }

  cambiarCantidad(clave: string, cambio: number): void {
    this.carrito.update((lineas) =>
      lineas.map((l) => {
        if (l.clave !== clave) return l;
        const nueva = l.cantidad + cambio;
        const dentroDelStock = cambio < 0 || this.cantidadEnVale(l.articulo.id) < l.articulo.stock;
        return nueva >= 1 && dentroDelStock ? { ...l, cantidad: nueva } : l;
      }),
    );
  }

  quitar(clave: string): void {
    this.carrito.update((lineas) => lineas.filter((l) => l.clave !== clave));
    if (this.carrito().length === 0) this.resumenAbierto.set(false);
  }

  /* ---------- Navegación entre pasos ---------- */
  estadoPaso(n: number): 'hecho' | 'activo' | 'pendiente' {
    const actual = this.paso();
    if (n < actual || (n === 4 && actual === 4)) return 'hecho';
    return n === actual ? 'activo' : 'pendiente';
  }

  clasePaso(n: number): string {
    switch (this.estadoPaso(n)) {
      case 'hecho':
        return 'bg-emerald-500 text-white';
      case 'activo':
        return 'bg-blue-600 text-white ring-4 ring-blue-600/20';
      default:
        return 'border border-gray-300 bg-white text-gray-400 dark:border-white/15 dark:bg-neutral-900';
    }
  }

  irAPaso(n: number): void {
    this.paso.set(n);
    this.subir();
  }

  anterior(): void {
    if (this.paso() > 1) this.irAPaso(this.paso() - 1);
  }

  siguiente(): void {
    if (!this.puedeAvanzar()) return;
    if (this.paso() === 3) {
      this.enviar();
    } else {
      this.irAPaso(this.paso() + 1);
    }
  }

  enviar(): void {
    // Folio temporal de ejemplo: el definitivo lo asignará tu servidor
    const numero = Math.floor(1000 + Math.random() * 9000);
    this.folio.set(`VE-${new Date().getFullYear()}-${numero}`);
    this.resumenAbierto.set(false);
    this.irAPaso(4);
  }

  reiniciar(): void {
    this.carrito.set([]);
    this.tallasElegidas.set({});
    this.busqueda.set('');
    this.categoriaActiva.set('todos');
    this.fechaDevolucion.set('');
    this.notas.set('');
    this.folio.set('');
    this.irAPaso(2);
  }

  @HostListener('document:keydown.escape')
  cerrarResumen(): void {
    this.resumenAbierto.set(false);
  }

  /* ---------- Utilidades privadas ---------- */
  // Quita acentos y mayúsculas para que "multimetro" encuentre "Multímetro"
  private normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private subir(): void {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }
}
