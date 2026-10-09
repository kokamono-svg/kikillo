// =====================================================================
// alta-trabajador.component.ts
// Pantalla de ALTA RÁPIDA. Usa un formulario reactivo (ReactiveForms):
// el formulario se define en TypeScript con sus validaciones, y el HTML
// solo se conecta a él con formControlName.
// El número de empleado NO se captura: lo genera el backend.
// CURP, RFC y documentos ya no se piden al dar de alta.
// =====================================================================
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { RhService } from '../rh.service';
import { COMPANIA, DatosCredencial, NuevoTrabajador, PUESTOS, Trabajador } from '../rh.model';
import { EditorCredencialComponent } from '../compartidos/editor-credencial/editor-credencial.component';
import { hoyIso, nombreCompleto } from '../rh.utils';

// Formatos oficiales
const PATRON_NSS = /^\d{11}$/;
const PATRON_TEL = /^\d{10}$/;

@Component({
  selector: 'app-alta-trabajador',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, EditorCredencialComponent],
  templateUrl: './alta-trabajador.component.html',
})
export class AltaTrabajadorComponent {
  private fb = inject(FormBuilder);
  private rh = inject(RhService);

  guardando = signal(false);
  error = signal<string | null>(null);
  creado = signal<Trabajador | null>(null); // trabajador recién registrado

  // Opciones de las listas desplegables
  puestos = PUESTOS;
  areas = ['Mantenimiento', 'Pailería', 'Eléctrico', 'Almacén', 'Seguridad', 'Administración'];
  tallasRopa = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  tallasCalzado = ['22', '23', '24', '25', '26', '27', '28', '29', '30', '31'];

  /**
   * Definición del formulario. Cada campo: [valor inicial, validaciones].
   * nonNullable: al hacer reset() regresa al valor inicial, no a null.
   */
  form = this.fb.nonNullable.group({
    nombres: ['', [Validators.required, Validators.maxLength(60)]],
    apellidoPaterno: ['', [Validators.required, Validators.maxLength(40)]],
    apellidoMaterno: ['', Validators.maxLength(40)],
    nss: ['', [Validators.required, Validators.pattern(PATRON_NSS)]],
    telefono: ['', Validators.pattern(PATRON_TEL)],
    puesto: ['', Validators.required],
    area: ['', Validators.required],
    contrato: ['', Validators.required],
    supervisor: ['', Validators.required],
    fechaIngreso: [hoyIso(), Validators.required],
    tallaRopa: ['', Validators.required],
    tallaCalzado: ['', Validators.required],
  });

  /** Credencial y cursos (opcional en el alta; se completa después en "Credencial"). */
  credencial = signal<DatosCredencial>(credencialVacia());

  nombreCompleto = nombreCompleto;

  /** ¿Mostrar el error de un campo? Solo si es inválido y ya lo tocaron. */
  invalido(campo: string): boolean {
    const c = this.form.get(campo);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // hace visibles todos los errores
      this.error.set('Revisa los campos marcados en rojo.');
      return;
    }
    this.error.set(null);
    this.guardando.set(true);

    // getRawValue(): todos los valores del formulario como objeto
    const datos: NuevoTrabajador = { ...this.form.getRawValue(), ...this.credencial(), compania: COMPANIA };

    this.rh.crearTrabajador(datos).subscribe({
      next: (t) => {
        this.guardando.set(false);
        this.creado.set(t);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.error.set(e.error?.mensaje ?? 'No se pudo registrar al trabajador.');
      },
    });
  }

  /** Limpia todo para registrar a otra persona. */
  nuevoRegistro(): void {
    this.creado.set(null);
    this.error.set(null);
    this.form.reset();
    this.credencial.set(credencialVacia());
  }
}

function credencialVacia(): DatosCredencial {
  return { numeroTarjeta: '', administrador: '', fechaEmision: hoyIso(), foto: null, cursos: [], reglasOro: false, fpsNivel0: false };
}
