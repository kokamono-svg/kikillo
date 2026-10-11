// =====================================================================
// lector-camara.component.ts
// Escanea QR o códigos de barras con la cámara (trasera si existe).
//
//   <app-lector-camara titulo="Escanea la credencial" (leido)="..." (cerrar)="..." />
//
// - Normal: lee un código y se cierra.
// - [continuo]="true": sigue abierta para leer varias piezas seguidas
//   (ignora el mismo código si se repite en menos de 2.5 s). Con [aviso]
//   muestra encima de la cámara lo que respondió la página ("agregado",
//   "no existe", "certificación vencida"...).
// Si no se puede usar la cámara en vivo (sin permiso o sin HTTPS), deja
// leer el código desde una foto.
// =====================================================================
import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, output, signal, viewChild } from '@angular/core';
import { Decodificar, avisoLectura, crearDecodificador, leerDeFoto } from './decodificador';

export interface AvisoEscaner {
  texto: string;
  tipo: 'ok' | 'alerta';
}

/** Pausa entre análisis de cuadros (ms): suficiente para no calentar el celular. */
const PAUSA = 120;
/** Tiempo en que se ignora el mismo código en modo continuo (ms). */
const REPETIDO = 2500;

@Component({
  selector: 'app-lector-camara',
  templateUrl: './lector-camara.component.html',
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
  styles: `
    .esquina { position: absolute; width: 2.5rem; height: 2.5rem; border-color: #34d399; }
    .linea {
      position: absolute; left: 8%; right: 8%; top: 50%; height: 2px; border-radius: 9999px;
      background: #34d399; box-shadow: 0 0 12px #34d399; animation: barrido 1.8s ease-in-out infinite alternate;
    }
    @keyframes barrido { from { top: 12%; } to { top: 88%; } }
    @media (prefers-reduced-motion: reduce) { .linea { animation: none; } }
  `,
})
export class LectorCamaraComponent implements AfterViewInit, OnDestroy {
  readonly titulo = input('Escanea el código');
  readonly continuo = input(false);
  /** Aviso de la página tras cada lectura (modo continuo). */
  readonly aviso = input<AvisoEscaner | null>(null);
  readonly leido = output<string>();
  readonly cerrar = output<void>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  readonly estado = signal<'iniciando' | 'lista' | 'error'>('iniciando');
  readonly error = signal('');
  readonly variasCamaras = signal(false);
  readonly hayLinterna = signal(false);
  readonly linterna = signal(false);
  /** Último código leído (se muestra unos segundos). */
  readonly ultimo = signal<string | null>(null);
  readonly cuantos = signal(0);
  readonly leyendoFoto = signal(false);
  /** Respuesta de la página a la última lectura. */
  readonly mensaje = signal<AvisoEscaner | null>(null);

  private flujo: MediaStream | null = null;
  private trasera = true;
  private activo = true;
  private decodificar: Decodificar | null = null;
  private temporizador?: ReturnType<typeof setTimeout>;
  private ocultarUltimo?: ReturnType<typeof setTimeout>;
  private anterior = { texto: '', hora: 0 };
  private ocultarMensaje?: ReturnType<typeof setTimeout>;

  constructor() {
    // Cada aviso nuevo de la página se muestra sobre la cámara (el que ya había al abrir, no)
    let primera = true;
    effect(() => {
      const a = this.aviso();
      if (primera) {
        primera = false;
        return;
      }
      if (!a) return;
      this.mensaje.set(a);
      clearTimeout(this.ocultarMensaje);
      this.ocultarMensaje = setTimeout(() => this.mensaje.set(null), 2500);
    });
  }

  ngAfterViewInit(): void {
    void this.encender();
  }

  ngOnDestroy(): void {
    this.activo = false;
    clearTimeout(this.temporizador);
    clearTimeout(this.ocultarUltimo);
    clearTimeout(this.ocultarMensaje);
    this.apagar();
  }

  private async encender(): Promise<void> {
    this.apagar();
    clearTimeout(this.temporizador);
    this.estado.set('iniciando');
    this.linterna.set(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fallar(
        window.isSecureContext
          ? 'Este navegador no permite usar la cámara.'
          : 'La cámara en vivo solo funciona si la página se abre con HTTPS. Puedes leer el código desde una foto.',
      );
      return;
    }
    try {
      // Se prepara el lector mientras se enciende la cámara
      const [flujo, decodificar] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.trasera ? 'environment' : 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        }),
        crearDecodificador(),
      ]);
      if (!this.activo) {
        flujo.getTracks().forEach((t) => t.stop());
        return;
      }
      this.flujo = flujo;
      this.decodificar = decodificar;
      const v = this.video().nativeElement;
      v.srcObject = flujo;
      await v.play();
      this.estado.set('lista');
      const pista = flujo.getVideoTracks()[0];
      this.hayLinterna.set(!!(pista?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch);
      const equipos = await navigator.mediaDevices.enumerateDevices();
      this.variasCamaras.set(equipos.filter((d) => d.kind === 'videoinput').length > 1);
      this.ciclo();
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      this.fallar(
        nombre === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Actívalo en el candado junto a la dirección de la página, o lee el código desde una foto.'
          : nombre === 'NotFoundError' || nombre === 'OverconstrainedError'
            ? 'No se encontró una cámara en este equipo.'
            : nombre === 'NotReadableError'
              ? 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.'
              : 'No se pudo encender la cámara.',
      );
    }
  }

  /** Analiza un cuadro, espera un momento y repite mientras la ventana siga abierta. */
  private async ciclo(): Promise<void> {
    if (!this.activo || this.estado() !== 'lista') return;
    const v = this.video().nativeElement;
    if (this.decodificar && v.readyState >= 2 && !document.hidden) {
      const texto = await this.decodificar(v).catch(() => null);
      if (texto?.trim()) this.encontrado(texto.trim());
    }
    if (this.activo) this.temporizador = setTimeout(() => this.ciclo(), PAUSA);
  }

  private encontrado(texto: string): void {
    const ahora = Date.now();
    if (texto === this.anterior.texto && ahora - this.anterior.hora < REPETIDO) {
      this.anterior.hora = ahora; // sigue apuntando al mismo: no se repite
      return;
    }
    this.anterior = { texto, hora: ahora };
    avisoLectura();
    this.leido.emit(texto);
    if (!this.continuo()) {
      this.activo = false;
      this.cerrar.emit();
      return;
    }
    this.cuantos.update((n) => n + 1);
    this.ultimo.set(texto);
    clearTimeout(this.ocultarUltimo);
    this.ocultarUltimo = setTimeout(() => this.ultimo.set(null), 2000);
  }

  private fallar(mensaje: string): void {
    this.apagar();
    this.error.set(mensaje);
    this.estado.set('error');
  }

  private apagar(): void {
    this.flujo?.getTracks().forEach((t) => t.stop());
    this.flujo = null;
  }

  reintentar(): void {
    void this.encender();
  }

  cambiarCamara(): void {
    this.trasera = !this.trasera;
    void this.encender();
  }

  async cambiarLinterna(): Promise<void> {
    const pista = this.flujo?.getVideoTracks()[0];
    if (!pista) return;
    const prender = !this.linterna();
    try {
      await pista.applyConstraints({ advanced: [{ torch: prender } as MediaTrackConstraintSet] });
      this.linterna.set(prender);
    } catch {
      this.hayLinterna.set(false);
    }
  }

  /** Plan B: tomar o elegir una foto del código (funciona aunque no haya HTTPS). */
  async elegirFoto(e: Event): Promise<void> {
    const entrada = e.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo?.type.startsWith('image/')) return;
    this.leyendoFoto.set(true);
    this.error.set('');
    try {
      const texto = (await leerDeFoto(archivo))?.trim();
      if (!texto) {
        this.error.set('No se encontró ningún código en la foto. Acércate, que salga nítido y sin reflejos.');
        this.estado.set('error');
        return;
      }
      this.anterior = { texto: '', hora: 0 };
      this.encontrado(texto);
    } catch {
      this.error.set('No se pudo leer la foto. Intenta con otra.');
      this.estado.set('error');
    } finally {
      this.leyendoFoto.set(false);
    }
  }
}
