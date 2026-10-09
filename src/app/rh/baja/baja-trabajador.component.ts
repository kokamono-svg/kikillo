// =====================================================================
// baja-trabajador.component.ts
// Pantalla de BAJA. Es el componente "padre": guarda el estado y habla
// con el servicio. Los hijos (buscador, tarjeta, tabla, modal) solo
// muestran datos y avisan eventos.
// =====================================================================
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RhService } from '../rh.service';
import { Adeudo, SolicitudBaja, Trabajador } from '../rh.model';
import { hoyIso, nombreCompleto } from '../rh.utils';
import { BuscadorTrabajadorComponent } from '../compartidos/buscador-trabajador/buscador-trabajador.component';
import { TarjetaTrabajadorComponent } from '../compartidos/tarjeta-trabajador/tarjeta-trabajador.component';
import { TablaAdeudosComponent } from '../compartidos/tabla-adeudos/tabla-adeudos.component';
import { ModalConfirmacionComponent } from '../compartidos/modal-confirmacion/modal-confirmacion.component';

@Component({
  selector: 'app-baja-trabajador',
  standalone: true,
  imports: [FormsModule, RouterLink, BuscadorTrabajadorComponent, TarjetaTrabajadorComponent, TablaAdeudosComponent, ModalConfirmacionComponent],
  templateUrl: './baja-trabajador.component.html',
})
export class BajaTrabajadorComponent implements OnInit {
  private rh = inject(RhService);
  private ruta = inject(ActivatedRoute);

  /** Referencia al componente hijo <app-modal-confirmacion #modal>. */
  modal = viewChild.required<ModalConfirmacionComponent>('modal');

  // ----- Estado -----
  trabajador = signal<Trabajador | null>(null);
  adeudos = signal<Adeudo[]>([]);
  validando = signal(false);
  procesando = signal(false);
  error = signal<string | null>(null);
  exito = signal<string | null>(null);

  // ----- Formulario (enlazado con ngModel) -----
  motivo = '';
  fechaBaja = hoyIso();
  comentarios = '';
  confirmado = false;
  motivos = ['Renuncia voluntaria', 'Término de contrato', 'Despido', 'Jubilación', 'Abandono de trabajo', 'Otro'];

  tieneAdeudos = computed(() => this.adeudos().length > 0);

  /** Paso del indicador: 1 buscar, 2 validar, 3 registrar, 4 terminado. */
  pasoActual = computed(() => {
    const t = this.trabajador();
    if (!t) return 1;
    if (this.exito()) return 4;
    if (t.activo && !this.validando() && !this.tieneAdeudos()) return 3;
    return 2;
  });
  pasos = ['Buscar trabajador', 'Validar adeudos', 'Registrar baja'];

  nombreCompleto = nombreCompleto;

  /** Si se llega con /rh/baja?trabajador=5, carga a ese trabajador. */
  ngOnInit(): void {
    const id = Number(this.ruta.snapshot.queryParamMap.get('trabajador'));
    if (id) this.rh.obtenerTrabajador(id).subscribe((t) => this.seleccionar(t));
  }

  /** El buscador avisó que eligieron a alguien. */
  seleccionar(t: Trabajador): void {
    this.trabajador.set(t);
    this.error.set(null);
    this.exito.set(null);
    this.motivo = '';
    this.fechaBaja = hoyIso();
    this.comentarios = '';
    this.confirmado = false;
    this.adeudos.set([]);
    if (t.activo) this.validarAdeudos();
  }

  /** Consulta en la BD lo que no ha devuelto. */
  validarAdeudos(): void {
    const t = this.trabajador();
    if (!t) return;
    this.validando.set(true);
    this.rh.obtenerAdeudos(t.id).subscribe({
      next: (lista) => { this.adeudos.set(lista); this.validando.set(false); },
      error: () => { this.error.set('No se pudieron consultar los adeudos.'); this.validando.set(false); },
    });
  }

  puedeDarDeBaja(): boolean {
    const t = this.trabajador();
    return !!t && t.activo && !this.validando() && !this.tieneAdeudos() && !!this.motivo && !!this.fechaBaja && this.confirmado;
  }

  /** El modal avisó que el usuario confirmó. */
  confirmarBaja(): void {
    const t = this.trabajador();
    if (!t) return;
    const solicitud: SolicitudBaja = { trabajadorId: t.id, motivo: this.motivo, fechaBaja: this.fechaBaja, comentarios: this.comentarios.trim() };

    this.procesando.set(true);
    this.rh.darDeBaja(solicitud).subscribe({
      next: (r) => {
        this.procesando.set(false);
        this.modal().cerrar();
        this.trabajador.set({ ...t, activo: false, fechaBaja: this.fechaBaja, motivoBaja: this.motivo });
        this.exito.set(r.mensaje);
      },
      error: (e: HttpErrorResponse) => {
        this.procesando.set(false);
        this.modal().cerrar();
        if (e.status === 409 && e.error?.adeudos) {
          // El backend encontró adeudos nuevos: se muestran
          this.adeudos.set(e.error.adeudos);
          this.error.set('No se puede dar de baja: el trabajador tiene adeudos pendientes.');
        } else {
          this.error.set(e.error?.mensaje ?? 'Ocurrió un error al registrar la baja.');
        }
      },
    });
  }

  reiniciar(): void {
    this.trabajador.set(null);
    this.adeudos.set([]);
    this.error.set(null);
    this.exito.set(null);
  }
}
