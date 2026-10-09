import { AfterViewInit, Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';

/* =====================================================
   COMPONENTE DE FIRMA
   Un <canvas> donde el trabajador firma con el dedo
   (celular) o con el mouse (computadora).

   Usa "pointer events": un solo tipo de evento que
   funciona igual para dedo, mouse y lápiz.

   Uso:  <app-firma-pad (firmaCambio)="miFirma.set($event)" />
   Emite la firma como imagen PNG en base64,
   o '' cuando se borra.
===================================================== */
@Component({
  selector: 'app-firma-pad',
  template: `
    <div class="relative overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white dark:border-white/20">
      <!-- touch-none: evita que el dedo haga scroll de la página mientras firma -->
      <canvas
        #lienzo
        class="block h-56 w-full touch-none cursor-crosshair sm:h-64"
        (pointerdown)="empezar($event)"
        (pointermove)="mover($event)"
        (pointerup)="terminar()"
        (pointerleave)="terminar()"
        (pointercancel)="terminar()"
      ></canvas>

      <!-- Línea y texto guía; desaparecen cuando ya hay trazo -->
      @if (vacio()) {
        <p class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          Firme aquí con el dedo o el mouse
        </p>
      }
      <div class="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-gray-300"></div>
    </div>

    <div class="mt-2 flex justify-end">
      <button
        type="button"
        (click)="limpiar()"
        class="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
      >
        Borrar firma
      </button>
    </div>
  `,
})
export class FirmaPad implements AfterViewInit, OnDestroy {
  /** viewChild = referencia al <canvas #lienzo> del template */
  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');

  /** output = evento que el componente padre puede escuchar */
  readonly firmaCambio = output<string>();

  readonly vacio = signal(true);

  private ctx!: CanvasRenderingContext2D;
  private dibujando = false;
  private observador?: ResizeObserver;

  /** Se ejecuta cuando el canvas ya existe en pantalla. */
  ngAfterViewInit(): void {
    this.ctx = this.lienzo().nativeElement.getContext('2d')!;
    this.ajustarTamano();
    // Si cambia el tamaño (girar el celular), se reajusta el lienzo
    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(this.lienzo().nativeElement);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  /**
   * El canvas tiene dos tamaños: el de CSS (lo que ves) y el interno (los píxeles reales).
   * Se multiplica por devicePixelRatio para que la firma no salga borrosa en celulares.
   */
  private ajustarTamano(): void {
    const canvas = this.lienzo().nativeElement;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width === Math.round(width * escala)) return; // ya estaba ajustado
    canvas.width = Math.round(width * escala);
    canvas.height = Math.round(height * escala);
    this.ctx.scale(escala, escala);
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round'; // puntas redondas = trazo más natural
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1e3a8a'; // azul tinta
    this.limpiar(); // cambiar el tamaño borra el dibujo
  }

  /** Posición del dedo/mouse relativa al canvas. */
  private punto(e: PointerEvent) {
    const r = this.lienzo().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  empezar(e: PointerEvent): void {
    e.preventDefault();
    // Captura: aunque el dedo salga del canvas, se siguen recibiendo sus eventos
    this.lienzo().nativeElement.setPointerCapture(e.pointerId);
    this.dibujando = true;
    const { x, y } = this.punto(e);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  mover(e: PointerEvent): void {
    if (!this.dibujando) return;
    const { x, y } = this.punto(e);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.vacio.set(false);
  }

  terminar(): void {
    if (!this.dibujando) return;
    this.dibujando = false;
    // toDataURL convierte lo dibujado en una imagen PNG en texto (base64)
    this.firmaCambio.emit(this.lienzo().nativeElement.toDataURL('image/png'));
  }

  limpiar(): void {
    const c = this.lienzo().nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.vacio.set(true);
    this.firmaCambio.emit('');
  }
}
