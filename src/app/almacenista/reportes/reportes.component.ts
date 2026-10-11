// =====================================================================
// reportes.component.ts
// Reportes de herramienta y equipo (datos de MySQL, /api/reportes):
//   - Existencias: por almacén y artículo (disponibles, prestadas, no aptas, certificaciones)
//   - Movimientos: entradas, entregas, devoluciones, daños y traspasos en un rango de fechas
//   - Adeudos: equipo prestado que no ha regresado (vencido o no)
// Se filtran por el almacén elegido arriba, se descargan en CSV (Excel) o se imprimen.
// =====================================================================
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AccesoAlmacen } from '../acceso-almacen.service';
import { AuthService } from '../../auth/auth.service';

export interface FilaExistencia {
  almacen: string; clave: string; nombre: string; tipo: string; disponibles: number; prestadas: number; noAptas: number;
  total: number; stockMinimo: number; stockBajo: boolean; certVencidas: number; certPorVencer: number;
}
export interface FilaMovimiento {
  id: number; fecha: string; tipo: string; almacen: string; clave: string; nombre: string; tipoArticulo: string;
  serie: string | null; cantidad: number; trabajador: string; folio: string; responsable: string; notas: string;
}
export interface FilaAdeudo {
  folio: string; fechaEntrega: string; fechaDevolucion: string | null; trabajador: string; numeroEmpleado: string;
  enRh: boolean; activo: boolean; almacen: string; clave: string; nombre: string; serie: string | null; cantidad: number;
  diasPrestado: number; vencido: boolean; diasVencido: number;
}

type Pestana = 'existencias' | 'movimientos' | 'adeudos';

/** Texto de cada tipo de movimiento. */
export const TEXTO_MOVIMIENTO: Record<string, string> = {
  ENTREGA: 'Entrega', DEVOLUCION: 'Devolución', REPOSICION: 'Reposición', DANO: 'Daño', PERDIDA: 'Pérdida',
  ENTRADA: 'Entrada', AJUSTE: 'Ajuste', TRASPASO_SALIDA: 'Traspaso (sale)', TRASPASO_ENTRADA: 'Traspaso (llega)',
};

function haceDias(n: number): string {
  const f = new Date();
  f.setDate(f.getDate() - n);
  return f.toLocaleDateString('en-CA');
}

@Component({
  selector: 'app-reportes',
  imports: [DatePipe],
  templateUrl: './reportes.component.html',
})
export class ReportesComponent {
  readonly acceso = inject(AccesoAlmacen);
  private http = inject(HttpClient);
  private api = `${inject(AuthService).apiUrl}/reportes`;
  readonly textoMovimiento = TEXTO_MOVIMIENTO;
  readonly tiposMovimiento = Object.keys(TEXTO_MOVIMIENTO);

  readonly pestana = signal<Pestana>('existencias');
  readonly desde = signal(haceDias(30));
  readonly hasta = signal(haceDias(0));
  readonly tipo = signal('');
  readonly filtro = signal('');
  readonly soloAlerta = signal(false); // existencias: stock bajo / no aptas · adeudos: vencidos
  readonly cargando = signal(false);
  readonly error = signal('');

  readonly existencias = signal<FilaExistencia[]>([]);
  readonly movimientos = signal<FilaMovimiento[]>([]);
  readonly adeudos = signal<FilaAdeudo[]>([]);

  readonly varios = computed(() => this.acceso.enVista().length > 1);
  readonly titulo = computed(() => this.acceso.actual() || (this.varios() ? 'Todos los almacenes' : this.acceso.almacenes()[0] ?? ''));

  private coincide(textos: (string | null | undefined)[]): boolean {
    const t = this.filtro().trim().toLowerCase();
    return !t || textos.some((x) => (x ?? '').toLowerCase().includes(t));
  }

  readonly existenciasVisibles = computed(() =>
    this.existencias().filter(
      (f) => this.coincide([f.nombre, f.clave, f.almacen]) && (!this.soloAlerta() || f.stockBajo || f.noAptas > 0 || f.certVencidas > 0 || f.certPorVencer > 0),
    ),
  );
  readonly movimientosVisibles = computed(() =>
    this.movimientos().filter((f) => this.coincide([f.nombre, f.clave, f.serie, f.trabajador, f.folio, f.responsable])),
  );
  readonly adeudosVisibles = computed(() =>
    this.adeudos().filter((f) => this.coincide([f.trabajador, f.numeroEmpleado, f.nombre, f.serie, f.folio]) && (!this.soloAlerta() || f.vencido)),
  );

  readonly totalExistencias = computed(() =>
    this.existenciasVisibles().reduce(
      (t, f) => ({ disponibles: t.disponibles + f.disponibles, prestadas: t.prestadas + f.prestadas, noAptas: t.noAptas + f.noAptas, total: t.total + f.total }),
      { disponibles: 0, prestadas: 0, noAptas: 0, total: 0 },
    ),
  );
  readonly vencidos = computed(() => this.adeudosVisibles().filter((f) => f.vencido).length);

  constructor() {
    // Se vuelve a pedir el reporte cuando cambia la pestaña, el almacén de arriba o los filtros del servidor
    effect(() => {
      this.pestana();
      this.acceso.actual();
      this.desde();
      this.hasta();
      this.tipo();
      untracked(() => void this.cargar());
    });
  }

  async cargar(): Promise<void> {
    let params = new HttpParams();
    if (this.acceso.actual()) params = params.set('almacen', this.acceso.actual());
    this.cargando.set(true);
    this.error.set('');
    try {
      switch (this.pestana()) {
        case 'existencias':
          this.existencias.set(await firstValueFrom(this.http.get<FilaExistencia[]>(`${this.api}/existencias`, { params })));
          break;
        case 'movimientos':
          params = params.set('desde', this.desde()).set('hasta', this.hasta());
          if (this.tipo()) params = params.set('tipo', this.tipo());
          this.movimientos.set(await firstValueFrom(this.http.get<FilaMovimiento[]>(`${this.api}/movimientos`, { params })));
          break;
        case 'adeudos':
          this.adeudos.set(await firstValueFrom(this.http.get<FilaAdeudo[]>(`${this.api}/adeudos`, { params })));
          break;
      }
    } catch (e) {
      this.error.set(e instanceof HttpErrorResponse ? (e.error?.mensaje ?? 'No se pudo cargar el reporte.') : 'No se pudo cargar el reporte.');
    } finally {
      this.cargando.set(false);
    }
  }

  /** Descarga lo que se ve en pantalla como CSV (abre directo en Excel, con acentos). */
  descargarCsv(): void {
    const filas: (string | number | boolean | null)[][] = [];
    const p = this.pestana();
    if (p === 'existencias') {
      filas.push(['Almacén', 'Clave', 'Artículo', 'Tipo', 'Disponibles', 'Prestadas', 'No aptas', 'Total', 'Stock bajo', 'Cert. vencidas', 'Cert. por vencer']);
      for (const f of this.existenciasVisibles())
        filas.push([f.almacen, f.clave, f.nombre, f.tipo, f.disponibles, f.prestadas, f.noAptas, f.total, f.stockBajo ? 'Sí' : 'No', f.certVencidas, f.certPorVencer]);
    } else if (p === 'movimientos') {
      filas.push(['Fecha', 'Tipo', 'Almacén', 'Clave', 'Artículo', 'Serie', 'Cantidad', 'Trabajador', 'Folio', 'Responsable', 'Notas']);
      for (const f of this.movimientosVisibles())
        filas.push([f.fecha.replace('T', ' '), this.textoMovimiento[f.tipo] ?? f.tipo, f.almacen, f.clave, f.nombre, f.serie, f.cantidad, f.trabajador, f.folio, f.responsable, f.notas]);
    } else {
      filas.push(['Folio', 'Trabajador', 'No. empleado', 'En RH', 'Almacén', 'Clave', 'Artículo', 'Serie', 'Cantidad', 'Entregado', 'Devolver el', 'Días prestado', 'Vencido', 'Días vencido']);
      for (const f of this.adeudosVisibles())
        filas.push([f.folio, f.trabajador, f.numeroEmpleado, f.enRh ? 'Sí' : 'No', f.almacen, f.clave, f.nombre, f.serie, f.cantidad, f.fechaEntrega.slice(0, 10),
          f.fechaDevolucion, f.diasPrestado, f.vencido ? 'Sí' : 'No', f.diasVencido]);
    }
    const csv = filas.map((fila) => fila.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    // BOM al inicio: Excel reconoce los acentos (UTF-8)
    const url = URL.createObjectURL(new Blob([String.fromCodePoint(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-${p}-${haceDias(0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  imprimir(): void {
    window.print();
  }

  corto(almacen: string): string {
    return almacen.replace(/^(Área|Central)\s+/, '').replace(/\s*\(.*\)$/, '');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
