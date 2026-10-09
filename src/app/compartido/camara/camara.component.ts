// =====================================================================
// camara.component.ts
// Cámara en vivo a pantalla completa (celular) o en ventana (PC) para
// tomar fotos sin salir de la página. Usa la cámara trasera si existe.
//
//   <app-camara [restantes]="4" (foto)="guardar($event)" (cerrar)="..." />
//
// Si el navegador no deja usar la cámara (sin permiso, sin HTTPS, sin
// cámara), ofrece elegir una foto del dispositivo.
// =====================================================================
import { AfterViewInit, Component, ElementRef, OnDestroy, input, output, signal, viewChild } from '@angular/core';
import { fotoDesdeVideo, reducirFoto } from './fotos';

@Component({
  selector: 'app-camara',
  templateUrl: './camara.component.html',
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
})
export class CamaraComponent implements AfterViewInit, OnDestroy {
  /** Cuántas fotos se pueden tomar en esta sesión. Al llegar al límite se cierra sola. */
  readonly restantes = input(4);
  /** Límite fijo de esta sesión (restantes() cambia mientras el padre guarda las fotos). */
  limite = 0;
  readonly foto = output<string>();
  readonly cerrar = output<void>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  readonly estado = signal<'iniciando' | 'lista' | 'error'>('iniciando');
  readonly error = signal('');
  /** Cuántas fotos se tomaron en esta sesión. */
  readonly tomadas = signal(0);
  /** Destello blanco al tomar la foto. */
  readonly destello = signal(false);
  /** true = el equipo tiene más de una cámara (se muestra el botón para cambiar). */
  readonly variasCamaras = signal(false);

  private flujo: MediaStream | null = null;
  private trasera = true;

  ngAfterViewInit(): void {
    this.limite = this.restantes();
    this.encender();
  }

  ngOnDestroy(): void {
    this.apagar();
  }

  private async encender(): Promise<void> {
    this.apagar();
    this.estado.set('iniciando');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fallar(
        window.isSecureContext
          ? 'Este navegador no permite usar la cámara.'
          : 'La cámara solo funciona si la página se abre con HTTPS.',
      );
      return;
    }
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.trasera ? 'environment' : 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const v = this.video().nativeElement;
      v.srcObject = this.flujo;
      await v.play();
      this.estado.set('lista');
      // La lista de cámaras solo trae datos completos después de dar permiso
      const equipos = await navigator.mediaDevices.enumerateDevices();
      this.variasCamaras.set(equipos.filter((d) => d.kind === 'videoinput').length > 1);
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      this.fallar(
        nombre === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Actívalo en el candado junto a la dirección de la página y vuelve a intentar.'
          : nombre === 'NotFoundError' || nombre === 'OverconstrainedError'
            ? 'No se encontró una cámara en este equipo.'
            : nombre === 'NotReadableError'
              ? 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.'
              : 'No se pudo encender la cámara.',
      );
    }
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
    this.encender();
  }

  cambiarCamara(): void {
    this.trasera = !this.trasera;
    this.encender();
  }

  tomar(): void {
    const v = this.video().nativeElement;
    if (this.estado() !== 'lista' || !v.videoWidth) return;
    this.foto.emit(fotoDesdeVideo(v));
    this.tomadas.update((n) => n + 1);
    this.destello.set(true);
    setTimeout(() => this.destello.set(false), 150);
    if (this.tomadas() >= this.limite) this.cerrar.emit();
  }

  /** Plan B: elegir una foto del dispositivo (en celular, el sistema también ofrece la cámara). */
  async elegirArchivo(e: Event): Promise<void> {
    const entrada = e.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo?.type.startsWith('image/')) return;
    try {
      this.foto.emit(await reducirFoto(archivo));
      this.cerrar.emit();
    } catch {
      this.error.set('No se pudo leer la foto. Intenta con otra.');
    }
  }
}
