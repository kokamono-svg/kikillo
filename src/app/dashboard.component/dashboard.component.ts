// =====================================================================
// dashboard.component.ts
// Panel general del administrador: lo más importante de TODOS los
// módulos en una sola vista, con accesos directos a cada sección.
// Usa el mismo marco (menú lateral + barra) que Almacén y RH.
// =====================================================================
import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OpcionMenu, PanelLayoutComponent } from '../compartido/panel-layout/panel-layout.component';
import { ICONOS } from '../compartido/panel-layout/iconos';
import { AccesoAlmacen } from '../almacenista/acceso-almacen.service';
import { ALMACENES, AlmacenService } from '../almacenista/almacen.service';
import { ESTADO_PRESTAMO } from '../almacenista/estado-prestamo';
import { RhService } from '../rh/rh.service';

@Component({
  selector: 'app-dashboard',
  imports: [PanelLayoutComponent, RouterLink, DatePipe],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  readonly almacen = inject(AlmacenService);
  private acceso = inject(AccesoAlmacen);
  private router = inject(Router);
  readonly estado = ESTADO_PRESTAMO;
  readonly iconos = ICONOS;
  readonly hoy = new Date();

  /** Menú del panel: en celular salen como pestañas para brincar directo a cada sección. */
  readonly menu: OpcionMenu[] = [
    { ruta: '/dashboard', texto: 'Inicio', icono: ICONOS.inicio, exacto: true },
    { ruta: '/almacen/prestamos', texto: 'Préstamos', icono: ICONOS.flechas },
    { ruta: '/almacen/inventario', texto: 'Inventario', icono: ICONOS.caja },
    { ruta: '/rh', texto: 'Personal', icono: ICONOS.personas },
  ];

  /** Accesos directos a lo que más se usa. */
  readonly accesos = [
    { ruta: '/almacen/nuevo', texto: 'Nuevo préstamo', detalle: 'Entregar equipo con vale y firma', icono: ICONOS.mas, color: 'bg-blue-600 text-white' },
    { ruta: '/almacen/prestamos', texto: 'Devoluciones', detalle: 'Recibir equipo prestado', icono: ICONOS.flechas, color: 'bg-emerald-50 text-emerald-600' },
    { ruta: '/rh/alta', texto: 'Alta de personal', detalle: 'Registrar un trabajador', icono: ICONOS.agregarPersona, color: 'bg-violet-50 text-violet-600' },
    { ruta: '/rh/kardex', texto: 'Kardex', detalle: 'Historial por trabajador', icono: ICONOS.lista, color: 'bg-amber-50 text-amber-600' },
  ];

  /** Saludo según la hora. */
  readonly saludo = (() => {
    const h = this.hoy.getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();

  readonly nombreCorto = computed(() => (this.auth.usuario()?.nombre ?? '').split(' ')[0]);

  /* ---------- Almacén (todos los almacenes) ---------- */
  readonly resumenes = computed(() => ALMACENES.map((a) => this.almacen.resumen(a)));

  readonly total = computed(() =>
    this.resumenes().reduce(
      (t, r) => ({
        unidades: t.unidades + r.unidades,
        disponibles: t.disponibles + r.disponibles,
        prestadas: t.prestadas + r.prestadas,
        vencidos: t.vencidos + r.vencidos,
        stockBajo: t.stockBajo + r.stockBajo.length,
      }),
      { unidades: 0, disponibles: 0, prestadas: 0, vencidos: 0, stockBajo: 0 },
    ),
  );

  readonly vales = computed(() => this.almacen.valesDe(ALMACENES));
  readonly vencidos = computed(() => this.vales().filter((v) => this.almacen.estadoDe(v) === 'vencido'));
  readonly recientes = computed(() => this.vales().slice(0, 5));

  /* ---------- Recursos Humanos (si el backend no responde, el panel sigue funcionando) ---------- */
  readonly rh = toSignal(inject(RhService).obtenerResumen().pipe(catchError(() => of(null))), { initialValue: null });

  porcentaje(parte: number, total: number): number {
    return total ? Math.round((parte / total) * 100) : 0;
  }

  /** Abre el módulo de almacén ya filtrado en ese almacén. */
  verAlmacen(nombre: string): void {
    this.acceso.elegir(nombre);
    this.router.navigateByUrl('/almacen');
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }
}
