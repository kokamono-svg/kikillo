// =====================================================================
// pwa.service.ts
// La app instalable (PWA):
//   - puedeInstalar: Android/Chrome/Edge ofrecen instalarla → instalar()
//   - esIphone: en iPhone se instala desde Compartir → "Agregar a inicio"
//   - versionNueva: se publicó una versión nueva → actualizar()
//   - enLinea: false = el celular se quedó sin señal
// =====================================================================
import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/** Evento que da el navegador para mostrar el "¿Instalar app?" cuando el usuario quiera. */
interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaService {
  private evento: EventoInstalar | null = null;

  /** Ya está abierta como app instalada (sin barra del navegador). */
  readonly instalada = signal(
    matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  readonly puedeInstalar = signal(false);
  readonly esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) && !this.instalada();
  readonly versionNueva = signal(false);
  readonly enLinea = signal(navigator.onLine);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // se muestra con nuestro botón, no con el aviso automático
      this.evento = e as EventoInstalar;
      this.puedeInstalar.set(true);
    });
    window.addEventListener('online', () => this.enLinea.set(true));
    window.addEventListener('offline', () => this.enLinea.set(false));
    window.addEventListener('appinstalled', () => {
      this.evento = null;
      this.puedeInstalar.set(false);
      this.instalada.set(true);
    });

    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      sw.versionUpdates.pipe(filter((v) => v.type === 'VERSION_READY')).subscribe(() => this.versionNueva.set(true));
      // Revisa cada 30 min si hay versión nueva (la app puede quedarse abierta todo el turno)
      setInterval(() => void sw.checkForUpdate().catch(() => undefined), 30 * 60 * 1000);
    }
  }

  async instalar(): Promise<void> {
    if (!this.evento) return;
    await this.evento.prompt();
    const { outcome } = await this.evento.userChoice;
    if (outcome === 'accepted') this.puedeInstalar.set(false);
    this.evento = null;
  }

  actualizar(): void {
    document.location.reload();
  }
}
