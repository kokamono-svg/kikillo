// =====================================================================
// credencial-pagina.component.ts
// RH → Credencial: buscar al trabajador, editar su tarjeta, foto y
// cursos (kardex) con vista previa en vivo, guardar e imprimir.
// Se puede abrir directo con ?trabajador=ID (desde el alta).
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RhService } from '../rh.service';
import { DatosCredencial, Trabajador } from '../rh.model';
import { nombreCompleto } from '../rh.utils';
import { BuscadorTrabajadorComponent } from '../compartidos/buscador-trabajador/buscador-trabajador.component';
import { CredencialComponent } from '../compartidos/credencial/credencial.component';
import { EditorCredencialComponent } from '../compartidos/editor-credencial/editor-credencial.component';

@Component({
  selector: 'app-credencial-pagina',
  imports: [BuscadorTrabajadorComponent, CredencialComponent, EditorCredencialComponent],
  templateUrl: './credencial-pagina.component.html',
})
export class CredencialPaginaComponent implements OnInit {
  private rh = inject(RhService);
  private ruta = inject(ActivatedRoute);

  readonly trabajador = signal<Trabajador | null>(null);
  readonly datos = signal<DatosCredencial | null>(null);
  readonly guardando = signal(false);
  readonly mensaje = signal<{ texto: string; tipo: 'ok' | 'error' } | null>(null);

  /** Vista previa: el trabajador con lo que se está editando (se ve al momento). */
  readonly vista = computed<Trabajador | null>(() => {
    const t = this.trabajador();
    const d = this.datos();
    return t && d ? { ...t, ...d } : null;
  });

  /** ¿Hay cambios sin guardar? */
  readonly cambios = computed(() => {
    const t = this.trabajador();
    const d = this.datos();
    return !!t && !!d && JSON.stringify(d) !== JSON.stringify(extraer(t));
  });

  readonly nombreCompleto = nombreCompleto;

  ngOnInit(): void {
    const id = Number(this.ruta.snapshot.queryParamMap.get('trabajador'));
    if (id) this.rh.obtenerTrabajador(id).subscribe((t) => this.seleccionar(t));
  }

  seleccionar(t: Trabajador): void {
    this.trabajador.set(t);
    this.datos.set(extraer(t));
    this.mensaje.set(null);
  }

  guardar(): void {
    const t = this.trabajador();
    const d = this.datos();
    if (!t || !d || this.guardando()) return;
    if (!d.numeroTarjeta.trim()) {
      this.mensaje.set({ texto: 'El número de tarjeta es obligatorio: es lo que guarda el QR.', tipo: 'error' });
      return;
    }
    this.guardando.set(true);
    this.rh.actualizarCredencial(t.id, d).subscribe({
      next: (nuevo) => {
        this.guardando.set(false);
        this.seleccionar(nuevo);
        this.mensaje.set({ texto: 'Credencial guardada.', tipo: 'ok' });
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.mensaje.set({ texto: e.error?.mensaje ?? 'No se pudo guardar.', tipo: 'error' });
      },
    });
  }

  imprimir(): void {
    window.print();
  }
}

/** Solo los datos de la credencial de un trabajador. */
function extraer(t: Trabajador): DatosCredencial {
  return {
    numeroTarjeta: t.numeroTarjeta,
    administrador: t.administrador,
    fechaEmision: t.fechaEmision,
    foto: t.foto,
    cursos: t.cursos.map((c) => ({ ...c })),
    reglasOro: t.reglasOro,
    fpsNivel0: t.fpsNivel0,
  };
}
