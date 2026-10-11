import { Component, computed, effect, inject, signal, untracked, viewChild, ElementRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AlmacenService, diasParaVencer, estadoCertificacion, piezaEntregable } from './almacen.service';
import { Articulo, LineaVale, Pieza, Vale } from './almacen.models';
import { FirmaPad } from './firma-pad/firma-pad';
import { AuthService } from '../auth/auth.service';
import { AccesoAlmacen } from './acceso-almacen.service';
import { ValeImpresoComponent } from './vale-impreso/vale-impreso.component';
import { CLASE_TIPO } from './estado-prestamo';
import { GafeteService, LecturaGafete } from './gafete.service';
import { nombreCompleto } from '../rh/rh.utils';
import { clavesVigentes, cursoVigente, nombreCurso } from '../compartido/cursos';
import { contieneCodigo, limpiarCodigo } from '../compartido/codigos';

/* =====================================================
   NUEVO PRÉSTAMO (admin y almacenista; compras no presta)
   El equipo sale del almacén elegido arriba (el almacenista
   siempre usa el suyo).
   Flujo en 4 pasos:
     1. Empleado → escanear su credencial (o capturar a mano), actividad,
                   motivo y fecha de entrega. Con la credencial se saben sus cursos.
     2. Equipo   → buscar o escanear lo que pide; el equipo que exige curso
                   solo se agrega si el trabajador lo tiene vigente
     3. Firma    → el trabajador firma en el celular
     4. Vale     → se genera con folio, datos, equipo y firma
===================================================== */

/** PIN de supervisor para la demo. En producción se valida en el servidor. */
const PIN_SUPERVISOR = '1234';
import { BotonEscanerComponent } from '../compartido/escaner/boton-escaner.component';
import { LectorDirective } from '../compartido/escaner/lector.directive';

@Component({
  selector: 'app-almacenista',
  imports: [FirmaPad, DatePipe, RouterLink, ValeImpresoComponent, BotonEscanerComponent, LectorDirective],
  templateUrl: './almacenista.component.html',
  styleUrl: './almacenista.component.css',
})
export class AlmacenistaComponent {
  /* inject() pide a Angular la instancia del servicio (la misma para toda la app) */
  readonly almacen = inject(AlmacenService);
  readonly acceso = inject(AccesoAlmacen);
  readonly claseTipo = CLASE_TIPO;

  /* ---------- Datos de la sesión ---------- */
  readonly almacenista = inject(AuthService).usuario()?.nombre ?? '';

  /** Almacén del que sale el equipo ('' = falta elegirlo). */
  readonly almacenElegido = this.acceso.actual;
  readonly pasos = ['Empleado', 'Equipo', 'Firma', 'Vale'];

  /** Fecha de hoy en formato AAAA-MM-DD (para el mínimo del calendario). */
  readonly hoy = this.fechaISO(new Date());

  /* ---------- Estado de la pantalla (signals) ---------- */
  readonly paso = signal(1);

  // Paso 1: equipo
  readonly busqueda = signal('');
  readonly codigoEscaneado = signal('');
  readonly carrito = signal<LineaVale[]>([]);

  // Autorización de supervisor cuando se pasa el límite
  readonly pendiente = signal<{ articulo: Articulo; serie?: string } | null>(null);
  readonly supervisorNombre = signal('');
  readonly supervisorPin = signal('');
  readonly autorizoSupervisor = signal('');
  /** Códigos que el supervisor ya autorizó para exceder el límite en este vale. */
  readonly autorizados = signal<string[]>([]);

  // Paso 2: empleado
  readonly nombre = signal('');
  readonly numeroEmpleado = signal('');

  // Gafete (opcional): al escanearlo se llenan los datos con lo registrado en RH
  private readonly gafetes = inject(GafeteService);
  readonly textoGafete = signal('');
  readonly leyendoGafete = signal(false);
  readonly gafete = signal<LecturaGafete | null>(null);
  readonly inputGafete = viewChild<ElementRef<HTMLInputElement>>('inputGafete');
  readonly nombreCompleto = nombreCompleto;
  readonly nombreCurso = nombreCurso;
  readonly cursoVigente = cursoVigente;

  /**
   * Cursos vigentes del trabajador identificado con su credencial.
   * undefined = no se escaneó credencial (datos a mano): el equipo que pide curso no se presta.
   */
  readonly cursosVigentes = computed(() => {
    const t = this.gafete()?.trabajador;
    return t && t.activo ? clavesVigentes(t.cursos) : undefined;
  });
  readonly actividad = signal('');
  readonly motivo = signal('');
  readonly fechaDevolucion = signal(this.fechaISO(this.sumarDias(new Date(), 7)));

  // Paso 3: firma
  readonly firma = signal('');

  // Paso 4: vale generado (o uno abierto desde el historial)
  readonly valeActual = signal<Vale | null>(null);

  // Mensaje corto de aviso (verde = ok, naranja = alerta)
  readonly aviso = signal<{ texto: string; tipo: 'ok' | 'alerta' } | null>(null);

  readonly inputEscaner =
  viewChild<ElementRef<HTMLInputElement>>('inputEscaner');

  constructor() {
    // Si cambian de almacén a medio vale, el carrito ya no corresponde: se empieza de nuevo
    effect(() => {
      this.almacenElegido();
      untracked(() => {
        if (this.paso() === 4) return; // el vale ya emitido se queda en pantalla
        this.carrito.set([]);
        this.autorizados.set([]);
        this.autorizoSupervisor.set('');
        this.paso.set(1);
      });
    });
  }

  /* ---------- Valores calculados ---------- */

  /** Catálogo filtrado por el buscador (ignora acentos y mayúsculas). */
  readonly filtrados = computed(() => {
    const t = this.normalizar(this.busqueda());
    return this.almacen
      .catalogoDe(this.almacenElegido())
      .filter(
        (a) =>
          this.normalizar(a.nombre).includes(t) ||
          contieneCodigo(a.codigo, this.busqueda()) ||
          !!a.piezas?.some((p) => contieneCodigo(p.serie, this.busqueda())),
      );
  });

  readonly totalPiezas = computed(() => this.carrito().reduce((s, l) => s + l.cantidad, 0));

  /** Texto que explica qué falta para avanzar ('' = todo listo). */
  readonly falta = computed(() => {
    switch (this.paso()) {
      case 2:
        return this.carrito().length ? '' : 'Agrega al menos un artículo.';
      case 1:
        if (this.gafete()?.trabajador && !this.gafete()!.trabajador!.activo) return 'El trabajador está dado de baja.';
        if (!this.nombre().trim()) return 'Escanea la credencial o escribe el nombre del trabajador.';
        if (!this.numeroEmpleado().trim()) return 'Escribe el número de empleado.';
        if (!this.actividad().trim()) return 'Indica la actividad que realizará.';
        if (!this.motivo().trim()) return 'Indica para qué ocupa el equipo.';
        if (!this.fechaDevolucion() || this.fechaDevolucion() < this.hoy) return 'Elige una fecha de entrega válida.';
        return '';
      case 3:
        return this.firma() ? '' : 'El trabajador debe firmar.';
      default:
        return '';
    }
  });

  /* =====================================================
     PASO 1: AGREGAR EQUIPO
  ===================================================== */

  /** Cuántas unidades de un artículo ya están en el carrito. */
  enCarrito(codigo: string): number {
    return this.carrito()
      .filter((l) => l.codigo === codigo)
      .reduce((s, l) => s + l.cantidad, 0);
  }

  /** Piezas que se pueden entregar ahora: aptas, sin prestar y que no están ya en el vale. */
  piezasLibres(a: Articulo): Pieza[] {
    // Aptas, sin prestar, con certificación vigente (si aplica) y que no estén ya en el vale
    return (a.piezas ?? []).filter((p) => piezaEntregable(p) && !this.piezaEnCarrito(p.serie));
  }

  /** Piezas de un artículo con la certificación vencida (no se prestan). */
  certificacionesVencidas(a: Articulo): number {
    return (a.piezas ?? []).filter((p) => p.estado === 'apto' && !p.prestada && estadoCertificacion(p) === 'vencida').length;
  }

  readonly estadoCertificacion = estadoCertificacion;
  readonly diasParaVencer = diasParaVencer;

  /** ¿Esta pieza ya está en el carrito? (para deshabilitar su botón) */
  piezaEnCarrito(serie: string): boolean {
    return this.carrito().some((l) => l.serie === serie);
  }

  /**
   * Agrega un artículo al vale aplicando las reglas del reto:
   *  - equipo por pieza: hay que elegir una pieza "apto" y libre
   *  - no se puede entregar más de lo que hay
   *  - si se supera el límite, se pide autorización de supervisor
   */
  agregar(a: Articulo, serie?: string): void {
    // Regla: equipo que exige curso (arnés, detector de gases...) solo si lo tiene vigente
    const sinCurso = this.almacen.faltaCurso(a, this.cursosVigentes());
    if (sinCurso) {
      this.avisar(sinCurso, 'alerta');
      return;
    }
    // Regla: equipo por pieza necesita la serie exacta
    if (a.piezas && !serie) {
      this.avisar(`${a.nombre}: elige o escanea la pieza (código individual).`, 'alerta');
      return;
    }
    if (serie) {
      const pieza = a.piezas?.find((p) => p.serie === serie);
      if (!pieza || pieza.estado === 'no apto') {
        this.avisar(`${serie} está marcado como NO APTO. No se puede entregar; sepáralo para revisión.`, 'alerta');
        return;
      }
      if (pieza.prestada || this.piezaEnCarrito(serie)) {
        this.avisar(`${serie} ya está asignado.`, 'alerta');
        return;
      }
      // Regla: certificación vencida = no se presta hasta recertificarla
      if (estadoCertificacion(pieza) === 'vencida') {
        this.avisar(`${serie}: su certificación venció el ${pieza.certificacionVence}. No se puede prestar.`, 'alerta');
        return;
      }
    }

    const yaLleva = this.enCarrito(a.codigo);

    // Regla: no entregar más de lo que hay en existencia
    if (!a.piezas && yaLleva + 1 > a.stock) {
      this.avisar(`Sin existencias suficientes de ${a.nombre}.`, 'alerta');
      return;
    }

    // Regla: límite por artículo → se bloquea hasta que el supervisor autorice
    if (yaLleva + 1 > a.limite && !this.autorizados().includes(a.codigo)) {
      this.pendiente.set({ articulo: a, serie });
      return;
    }

    this.meterAlCarrito(a, serie);
  }

  /** Mete el artículo al carrito sin revisar reglas (ya se revisaron). */
  private meterAlCarrito(a: Articulo, serie?: string): void {
    this.carrito.update((lista) => {
      // Los artículos por cantidad suman en el mismo renglón; las piezas van cada una en su renglón
      const existente = !serie && lista.find((l) => l.codigo === a.codigo);
      if (existente) {
        return lista.map((l) => (l === existente ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...lista, { codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, cantidad: 1, serie }];
    });
    // Certificación por vencer: se presta, pero se avisa
    const pieza = serie ? a.piezas?.find((p) => p.serie === serie) : undefined;
    if (pieza && estadoCertificacion(pieza) === 'por-vencer') {
      const dias = diasParaVencer(pieza);
      this.avisar(
        `${serie} agregado. Ojo: su certificación vence ${dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`} (${pieza.certificacionVence}).`,
        'alerta',
      );
      return;
    }
    this.avisar(`${a.nombre}${serie ? ' · ' + serie : ''} agregado.`, 'ok');
  }

  /**
   * Lectura de QR / pistola lectora.
   * La pistola funciona como un teclado: escribe el código y manda Enter.
   * Por eso basta con un input que reaccione al Enter.
   * enfocar = false cuando lee la cámara (en celular no debe abrirse el teclado).
   */
  escanear(enfocar = true): void {
    // ALT'024, alt 024 o ALT024: todos se leen como ALT-024
    const codigo = limpiarCodigo(this.codigoEscaneado());
    this.codigoEscaneado.set('');
    if (!codigo) return;
    const a = this.almacen.buscarPorCodigo(this.almacenElegido(), codigo);
    if (!a) {
      this.avisar(`El código ${codigo} no existe en el catálogo.`, 'alerta');
      return;
    }
    if (enfocar) this.inputEscaner()?.nativeElement.focus();
    // Si el código es la serie de una pieza, se agrega esa pieza exacta
    this.agregar(a, this.almacen.piezaPorCodigo(a, codigo)?.serie);
  }

  /** Código leído con la cámara o con la pistola fuera del campo. */
  leerCodigo(texto: string, enfocar = true): void {
    this.codigoEscaneado.set(texto);
    this.escanear(enfocar);
  }

  /**
   * Busca en RH al dueño del gafete y llena nombre y número de empleado.
   * siNoEsGafete: aviso que se muestra si no es un gafete (se usa desde el paso 1).
   */
  leerGafete(texto = this.textoGafete(), siNoEsGafete = ''): void {
    if (!texto.trim() || this.leyendoGafete()) return;
    this.textoGafete.set('');
    this.leyendoGafete.set(true);
    this.gafetes.leer(texto).subscribe((r) => {
      this.leyendoGafete.set(false);
      const t = r.trabajador;
      if (!t) {
        if (siNoEsGafete) {
          this.avisar(siNoEsGafete, 'alerta');
        } else {
          this.gafete.set(r);
        }
        return;
      }
      this.gafete.set(r);
      if (!t.activo) {
        // Dado de baja: no se llenan sus datos para no prestarle por error
        this.avisar(`${nombreCompleto(t)} está dado de baja. No se le puede prestar equipo.`, 'alerta');
        return;
      }
      this.nombre.set(nombreCompleto(t));
      this.numeroEmpleado.set(t.numeroEmpleado);
      // Un solo aviso: si se quitó equipo del vale, eso es lo importante
      const quitados = this.revisarCarrito(false);
      if (quitados) {
        this.avisar(`${nombreCompleto(t)}: se quitaron ${quitados} artículo(s) del vale porque requieren un curso que no tiene.`, 'alerta');
      } else {
        this.avisar(`Credencial de ${nombreCompleto(t)}: datos listos.`, 'ok');
      }
      this.inputGafete()?.nativeElement.focus();
    });
  }

  /** Quita lo que llenó el gafete para capturar a mano. */
  quitarGafete(): void {
    this.gafete.set(null);
    this.nombre.set('');
    this.numeroEmpleado.set('');
    this.revisarCarrito();
  }

  /** Saca del vale lo que el trabajador actual ya no puede llevar (por curso). Regresa cuántos quitó. */
  private revisarCarrito(avisar = true): number {
    const catalogo = this.almacen.catalogoDe(this.almacenElegido());
    const antes = this.carrito().length;
    this.carrito.update((lista) =>
      lista.filter((l) => {
        const a = catalogo.find((x) => x.codigo === l.codigo);
        return !a || !this.almacen.faltaCurso(a, this.cursosVigentes());
      }),
    );
    const quitados = antes - this.carrito().length;
    if (quitados && avisar) this.avisar(`Se quitaron ${quitados} artículo(s) que requieren un curso que este trabajador no tiene.`, 'alerta');
    return quitados;
  }

  /** Motivo por el que no se le puede prestar este artículo ('' = sí se puede). */
  bloqueoPorCurso(a: Articulo): string {
    return this.almacen.faltaCurso(a, this.cursosVigentes());
  }

  /** Suma o resta 1 a un renglón (solo artículos por cantidad). */
  cambiarCantidad(linea: LineaVale, cambio: number): void {
    if (cambio > 0) {
      const a = this.almacen.catalogoDe(this.almacenElegido()).find((x) => x.codigo === linea.codigo);
      if (a) this.agregar(a);
      return;
    }
    if (linea.cantidad <= 1) {
      this.quitar(linea);
      return;
    }
    this.carrito.update((lista) => lista.map((l) => (l === linea ? { ...l, cantidad: l.cantidad - 1 } : l)));
  }

  quitar(linea: LineaVale): void {
    this.carrito.update((lista) => lista.filter((l) => l !== linea));
  }

  /* ---------- Autorización de supervisor ---------- */

  autorizar(): void {
    const p = this.pendiente();
    if (!p) return;
    if (!this.supervisorNombre().trim() || this.supervisorPin() !== PIN_SUPERVISOR) {
      this.avisar('Nombre o PIN de supervisor incorrecto.', 'alerta');
      return;
    }
    this.autorizoSupervisor.set(this.supervisorNombre().trim());
    this.autorizados.update((l) => [...l, p.articulo.codigo]);
    this.pendiente.set(null);
    this.supervisorPin.set('');
    this.agregar(p.articulo, p.serie); // se vuelve a intentar, ahora autorizado
  }

  cancelarAutorizacion(): void {
    this.pendiente.set(null);
    this.supervisorPin.set('');
  }

  /* =====================================================
     NAVEGACIÓN ENTRE PASOS
  ===================================================== */

  siguiente(): void {
    if (this.falta()) {
      this.avisar(this.falta(), 'alerta');
      return;
    }
    if (this.paso() === 3) {
      void this.emitirVale();
      return;
    }
    this.paso.update((p) => p + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  anterior(): void {
    if (this.paso() > 1) this.paso.update((p) => p - 1);
  }

  /** true mientras el servidor guarda el vale (evita mandarlo dos veces). */
  readonly guardando = signal(false);

  /** Crea el vale con todos los datos, lo guarda en el servidor y muestra el paso 4. */
  private async emitirVale(): Promise<void> {
    if (this.guardando()) return;
    const vale: Vale = {
      folio: '', // lo asigna el servidor (V-0001...)
      fecha: new Date().toISOString(),
      fechaDevolucion: this.fechaDevolucion(),
      almacen: this.almacenElegido(),
      almacenista: this.almacenista,
      empleado: {
        nombre: this.nombre().trim(),
        numeroEmpleado: this.numeroEmpleado().trim(),
        actividad: this.actividad().trim(),
        motivo: this.motivo().trim(),
        cursos: this.cursosVigentes(),
      },
      lineas: this.carrito(),
      firma: this.firma(),
      autorizoSupervisor: this.autorizoSupervisor() || undefined,
    };
    // El servidor valida otra vez (stock, piezas, cursos, certificación) antes de descontar
    const t = this.gafete()?.trabajador;
    this.guardando.set(true);
    const r = await this.almacen.registrarVale(vale, t?.activo ? t.id : undefined);
    this.guardando.set(false);
    if ('error' in r) {
      this.avisar(r.error, 'alerta');
      return;
    }
    this.valeActual.set(r.vale);
    this.paso.set(4);
    this.avisar(`Vale ${r.vale.folio} generado.`, 'ok');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Limpia todo para atender al siguiente trabajador. */
  nuevoVale(): void {
    this.carrito.set([]);
    this.nombre.set('');
    this.numeroEmpleado.set('');
    this.gafete.set(null);
    this.textoGafete.set('');
    this.actividad.set('');
    this.motivo.set('');
    this.fechaDevolucion.set(this.fechaISO(this.sumarDias(new Date(), 7)));
    this.firma.set('');
    this.autorizados.set([]);
    this.autorizoSupervisor.set('');
    this.supervisorNombre.set('');
    this.valeActual.set(null);
    this.paso.set(1);
  }

  /** Abre el diálogo de impresión del navegador (desde ahí se puede "Guardar como PDF"). */
  imprimir(): void {
    window.print();
  }

  /* =====================================================
     UTILIDADES
  ===================================================== */

  private temporizador?: ReturnType<typeof setTimeout>;

  /** Muestra un aviso que se oculta solo después de 3.5 s. */
  avisar(texto: string, tipo: 'ok' | 'alerta'): void {
    this.aviso.set({ texto, tipo });
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.aviso.set(null), 3500);
  }

  /** Quita acentos y pasa a minúsculas para que "flexometro" encuentre "Flexómetro". */
  private normalizar(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  private sumarDias(f: Date, dias: number): Date {
    const r = new Date(f);
    r.setDate(r.getDate() + dias);
    return r;
  }

  /** Date → 'AAAA-MM-DD' en hora local (toISOString usaría hora UTC y podría dar el día siguiente). */
  private fechaISO(f: Date): string {
    const m = String(f.getMonth() + 1).padStart(2, '0');
    const d = String(f.getDate()).padStart(2, '0');
    return `${f.getFullYear()}-${m}-${d}`;
  }

  /** Para leer el valor de un input en el template: valor($event) */
  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
