// =====================================================================
// alta-trabajador.component.ts
// Pantalla de ALTA. Usa un formulario reactivo (ReactiveForms): el
// formulario se define en TypeScript con sus validaciones, y el HTML
// solo se conecta a él con formControlName.
// El número de empleado NO se captura: lo genera el backend.
// =====================================================================
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { RhService } from '../rh.service';
import { NuevoTrabajador, Trabajador } from '../rh.model';
import { hoyIso, nombreCompleto } from '../rh.utils';

// Formatos oficiales (la "i" al final ignora mayúsculas/minúsculas)
const PATRON_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i;
const PATRON_RFC = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/i;
const PATRON_NSS = /^\d{11}$/;
const PATRON_TEL = /^\d{10}$/;

@Component({
  selector: 'app-alta-trabajador',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './alta-trabajador.component.html',
})
export class AltaTrabajadorComponent {
  private fb = inject(FormBuilder);
  private rh = inject(RhService);

  guardando = signal(false);
  error = signal<string | null>(null);
  creado = signal<Trabajador | null>(null); // trabajador recién registrado

  // Opciones de las listas desplegables
  areas = ['Mantenimiento', 'Pailería', 'Eléctrico', 'Almacén', 'Seguridad', 'Administración'];
  tallasRopa = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  tallasCalzado = ['22', '23', '24', '25', '26', '27', '28', '29', '30', '31'];

  /** Lista de documentos para pintar las casillas con un @for. */
  documentos = [
    { clave: 'identificacion', texto: 'Identificación oficial' },
    { clave: 'comprobanteDomicilio', texto: 'Comprobante de domicilio' },
    { clave: 'datosBancarios', texto: 'Datos bancarios' },
    { clave: 'contratoFirmado', texto: 'Contrato firmado' },
    { clave: 'altaImss', texto: 'Alta en el IMSS' },
  ];

  /**
   * Definición del formulario. Cada campo: [valor inicial, validaciones].
   * nonNullable: al hacer reset() regresa al valor inicial, no a null.
   */
  form = this.fb.nonNullable.group({
    nombres: ['', [Validators.required, Validators.maxLength(60)]],
    apellidoPaterno: ['', [Validators.required, Validators.maxLength(40)]],
    apellidoMaterno: ['', Validators.maxLength(40)],
    curp: ['', [Validators.required, Validators.pattern(PATRON_CURP)]],
    rfc: ['', [Validators.required, Validators.pattern(PATRON_RFC)]],
    nss: ['', [Validators.required, Validators.pattern(PATRON_NSS)]],
    telefono: ['', Validators.pattern(PATRON_TEL)],
    puesto: ['', Validators.required],
    area: ['', Validators.required],
    contrato: ['', Validators.required],
    supervisor: ['', Validators.required],
    fechaIngreso: [hoyIso(), Validators.required],
    tallaRopa: ['', Validators.required],
    tallaCalzado: ['', Validators.required],
    // Subgrupo: las 5 casillas de documentos
    documentos: this.fb.nonNullable.group({
      identificacion: false,
      comprobanteDomicilio: false,
      datosBancarios: false,
      contratoFirmado: false,
      altaImss: false,
    }),
    induccionSeguridad: false,
  });

  nombreCompleto = nombreCompleto;

  /** ¿Mostrar el error de un campo? Solo si es inválido y ya lo tocaron. */
  invalido(campo: string): boolean {
    const c = this.form.get(campo);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  /** Convierte a mayúsculas CURP y RFC mientras se escriben. */
  aMayusculas(campo: 'curp' | 'rfc'): void {
    const c = this.form.controls[campo];
    c.setValue(c.value.toUpperCase(), { emitEvent: false });
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
    const datos: NuevoTrabajador = this.form.getRawValue();

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
  }

  /** Cuántos documentos están marcados (para el contador). */
  documentosEntregados(): number {
    return Object.values(this.form.controls.documentos.value).filter(Boolean).length;
  }
}
