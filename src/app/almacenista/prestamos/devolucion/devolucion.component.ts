// =====================================================================
// devolucion.component.ts
// Formulario para recibir el equipo de un vale. Por cada renglón que se
// devuelve (los consumibles no): cómo llegó y, si se quiere, notas y
// fotos. El equipo de alto valor abre las notas desde el inicio.
// =====================================================================
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { AlmacenService, seDevuelve } from '../../almacen.service';
import { CondicionDevolucion, LineaVale, Recepcion, Vale } from '../../almacen.models';
import { CamaraComponent } from '../../../compartido/camara/camara.component';
import { reducirFoto } from '../../../compartido/camara/fotos';

/** Máximo de fotos por renglón (se guardan en el navegador y pesan). */
const MAX_FOTOS = 4;

/** Lo que se va capturando de un renglón del vale. */
interface Fila {
  indice: number; // posición del renglón en vale.lineas
  linea: LineaVale;
  costoso: boolean;
  condicion: CondicionDevolucion;
  danadas: number;
  notas: string;
  fotos: string[];
  abierto: boolean; // se ven las notas y fotos
}

@Component({
  selector: 'app-devolucion',
  imports: [CamaraComponent],
  templateUrl: './devolucion.component.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class DevolucionComponent {
  private almacen = inject(AlmacenService);

  readonly vale = input.required<Vale>();
  readonly cancelar = output<void>();
  /** recepciones[i] = cómo llegó el renglón i del vale. */
  readonly confirmar = output<(Recepcion | undefined)[]>();

  readonly maxFotos = MAX_FOTOS;

  /** Renglones que se devuelven. linkedSignal: se reinicia si cambia el vale. */
  readonly filas = linkedSignal<Fila[]>(() =>
    this.vale()
      .lineas.map((linea, indice) => ({ linea, indice }))
      .filter(({ linea }) => seDevuelve(linea))
      .map(({ linea, indice }): Fila => {
        const costoso = this.almacen.esCostoso(this.vale().almacen, linea.codigo);
        return { indice, linea, costoso, condicion: 'bueno', danadas: linea.cantidad, notas: '', fotos: [], abierto: costoso };
      }),
  );

  /** Consumibles del vale: se gastaron, no se reciben. */
  readonly consumibles = computed(() => this.vale().lineas.filter((l) => !seDevuelve(l)));

  /** Renglón al que se le está procesando una foto (para mostrar "Procesando…"). */
  readonly procesando = signal<number | null>(null);
  /** Renglón para el que está abierta la cámara (null = cerrada). */
  readonly camaraPara = signal<number | null>(null);
  readonly error = signal('');

  cambiar(indice: number, cambios: Partial<Fila>): void {
    this.filas.update((lista) => lista.map((f) => (f.indice === indice ? { ...f, ...cambios } : f)));
  }

  cambiarDanadas(f: Fila, e: Event): void {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    this.cambiar(f.indice, { danadas: Math.min(Math.max(n || 1, 1), f.linea.cantidad) });
  }

  /** Foto tomada con la cámara en vivo. */
  agregarFoto(indice: number, foto: string): void {
    const f = this.filas().find((x) => x.indice === indice);
    if (f && f.fotos.length < MAX_FOTOS) this.cambiar(indice, { fotos: [...f.fotos, foto] });
  }

  /** Cuántas fotos le caben todavía al renglón que tiene la cámara abierta. */
  espacioCamara(): number {
    const f = this.filas().find((x) => x.indice === this.camaraPara());
    return f ? MAX_FOTOS - f.fotos.length : 0;
  }

  quitarFoto(f: Fila, foto: string): void {
    this.cambiar(f.indice, { fotos: f.fotos.filter((x) => x !== foto) });
  }

  /** Lee las fotos elegidas (cámara o galería) y las reduce antes de guardarlas. */
  async agregarFotos(f: Fila, e: Event): Promise<void> {
    const entrada = e.target as HTMLInputElement;
    const archivos = Array.from(entrada.files ?? []).filter((a) => a.type.startsWith('image/'));
    entrada.value = ''; // permite volver a elegir la misma foto
    const espacio = MAX_FOTOS - f.fotos.length;
    if (!archivos.length || espacio <= 0) return;

    this.error.set(archivos.length > espacio ? `Solo se guardan ${MAX_FOTOS} fotos por artículo.` : '');
    this.procesando.set(f.indice);
    try {
      const nuevas: string[] = [];
      for (const archivo of archivos.slice(0, espacio)) nuevas.push(await reducirFoto(archivo));
      const actual = this.filas().find((x) => x.indice === f.indice);
      if (actual) this.cambiar(f.indice, { fotos: [...actual.fotos, ...nuevas] });
    } catch {
      this.error.set('No se pudo leer una de las fotos. Intenta con otra.');
    } finally {
      this.procesando.set(null);
    }
  }

  enviar(): void {
    const recepciones: (Recepcion | undefined)[] = [];
    for (const f of this.filas()) {
      const danado = f.condicion === 'danado';
      recepciones[f.indice] = {
        condicion: f.condicion,
        danadas: danado && f.linea.cantidad > 1 ? f.danadas : undefined,
        notas: f.notas.trim() || undefined,
        fotos: f.fotos.length ? f.fotos : undefined,
      };
    }
    this.confirmar.emit(recepciones);
  }

  valor(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
}
