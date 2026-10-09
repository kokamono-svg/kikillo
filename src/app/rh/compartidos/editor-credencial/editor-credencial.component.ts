// =====================================================================
// editor-credencial.component.ts
// Captura los datos de la credencial / kardex de un trabajador:
// N° de tarjeta (lo que guarda el QR), administrador, foto, cursos con
// su ID y vigencia, Reglas de Oro y FPS Nivel 0.
// Lo usan el ALTA y la pantalla CREDENCIAL:
//   <app-editor-credencial [(datos)]="credencial" [tarjetaOpcional]="true" />
// =====================================================================
import { Component, computed, input, model, signal } from '@angular/core';
import { CamaraComponent } from '../../../compartido/camara/camara.component';
import { reducirFoto } from '../../../compartido/camara/fotos';
import { CURSOS, CursoTrabajador, cursoVigente } from '../../../compartido/cursos';
import { DatosCredencial } from '../../rh.model';
import { hoyIso } from '../../rh.utils';
import { limpiarCodigo } from '../../../compartido/codigos';

@Component({
  selector: 'app-editor-credencial',
  imports: [CamaraComponent],
  templateUrl: './editor-credencial.component.html',
  host: { class: 'block' },
})
export class EditorCredencialComponent {
  /** Los datos se editan "en dos sentidos": el padre los ve cambiar al momento. */
  readonly datos = model.required<DatosCredencial>();
  /** En el alta la tarjeta puede ir vacía (el sistema genera una). */
  readonly tarjetaOpcional = input(false);

  readonly catalogo = CURSOS;
  readonly vigente = cursoVigente;
  readonly camara = signal(false);
  readonly errorFoto = signal('');

  /** Cursos que todavía no tiene (para la lista de "agregar"). */
  readonly disponibles = computed(() => CURSOS.filter((c) => !this.datos().cursos.some((x) => x.clave === c.clave)));

  cambiar<K extends keyof DatosCredencial>(campo: K, valor: DatosCredencial[K]): void {
    this.datos.update((d) => ({ ...d, [campo]: valor }));
  }

  /**
   * Mientras se escribe se guarda tal cual (la pistola teclea letra por letra:
   * si se limpiara en cada tecla se perderían los guiones). Se limpia al
   * terminar: Enter o salir del campo. ALT'024 → ALT-024.
   */
  tarjeta(valor: string): void {
    this.cambiar('numeroTarjeta', valor);
  }

  limpiarTarjeta(): void {
    this.cambiar('numeroTarjeta', limpiarCodigo(this.datos().numeroTarjeta));
  }

  /* ---------- Cursos ---------- */
  agregarCurso(clave: string): void {
    if (!clave) return;
    // Vigencia sugerida: un año a partir de hoy
    const f = new Date();
    f.setFullYear(f.getFullYear() + 1);
    const vigencia = f.toLocaleDateString('en-CA');
    this.cambiar('cursos', [...this.datos().cursos, { clave, folio: '', vigencia }]);
  }

  editarCurso(i: number, cambios: Partial<CursoTrabajador>): void {
    this.cambiar(
      'cursos',
      this.datos().cursos.map((c, j) => (j === i ? { ...c, ...cambios } : c)),
    );
  }

  quitarCurso(i: number): void {
    this.cambiar(
      'cursos',
      this.datos().cursos.filter((_, j) => j !== i),
    );
  }

  /* ---------- Foto ---------- */
  async subirFoto(e: Event): Promise<void> {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!archivo) return;
    try {
      this.cambiar('foto', await reducirFoto(archivo));
      this.errorFoto.set('');
    } catch {
      this.errorFoto.set('No se pudo leer la imagen.');
    }
  }

  fotoDeCamara(foto: string): void {
    this.cambiar('foto', foto);
    this.camara.set(false);
  }

  hoy(): string {
    return hoyIso();
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
