// =====================================================================
// auth.service.ts
// Sesión del usuario: iniciar sesión, cerrar sesión y saber su rol.
//
// IMPORTANTE: lo que se revisa aquí (y en los guards) solo sirve para
// no mostrar pantallas a quien no le tocan. La seguridad real está en
// el backend: cada endpoint de Flask valida el token y el rol.
//
// El login se valida en Flask (POST /api/auth/login) contra la tabla
// usuario de la BD. Para correr la app hay que levantar el backend:
//     cd backend && python app.py
// =====================================================================
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type Rol = 'admin' | 'rh' | 'almacenista' | 'comprador' | 'solicitante';

export interface Usuario {
  usuario: string;
  nombre: string;
  rol: Rol;
  /** Almacén asignado (solo almacenista): solo ve y presta lo de ese almacén. */
  almacen?: string;
}

interface Sesion {
  token: string;
  usuario: Usuario;
  /** Fecha de expiración en milisegundos (Date.now()). */
  expira: number;
}

/** Respuesta de POST /api/auth/login */
interface RespuestaLogin {
  token: string;
  usuario: Usuario;
  expiraEnSegundos: number;
}

const CLAVE_SESION = 'imhotep.sesion';

/** Pantalla de inicio de cada rol. */
const INICIO: Record<Rol, string> = {
  admin: '/dashboard',
  rh: '/rh',
  almacenista: '/almacen',
  comprador: '/almacen/stock', // Compras entra directo al stock de cada almacén
  solicitante: '/solicitante',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  /** URL de la API de Flask. Cámbiala por la del VPS al publicar. */
  readonly apiUrl = 'http://localhost:5000/api';

  private sesion = signal<Sesion | null>(this.leerSesion());

  /** El usuario con sesión activa, o null. */
  readonly usuario = computed(() => this.sesion()?.usuario ?? null);

  /** Token para mandar en el encabezado Authorization (o null). */
  token(): string | null {
    const s = this.sesion();
    if (s && s.expira <= Date.now()) {
      this.limpiar(); // la sesión caducó
      return null;
    }
    return s?.token ?? null;
  }

  estaAutenticado(): boolean {
    return this.token() !== null;
  }

  tieneRol(...roles: Rol[]): boolean {
    const u = this.usuario();
    return this.estaAutenticado() && !!u && roles.includes(u.rol);
  }

  inicioDe(rol: Rol): string {
    return INICIO[rol];
  }

  iniciarSesion(usuario: string, password: string): Observable<Usuario> {
    return this.http.post<RespuestaLogin>(`${this.apiUrl}/auth/login`, { usuario: usuario.trim(), password }).pipe(
      map((r) => {
        const sesion: Sesion = { token: r.token, usuario: r.usuario, expira: Date.now() + r.expiraEnSegundos * 1000 };
        this.guardar(sesion);
        return r.usuario;
      })
    );
  }

  cerrarSesion(): void {
    this.limpiar();
    this.router.navigateByUrl('/');
  }

  // ------------------------------------------------------------------
  // sessionStorage: la sesión se borra al cerrar la pestaña
  // ------------------------------------------------------------------
  private guardar(s: Sesion): void {
    this.sesion.set(s);
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    } catch {
      /* sin almacenamiento: la sesión vive solo en memoria */
    }
  }

  private limpiar(): void {
    this.sesion.set(null);
    try {
      sessionStorage.removeItem(CLAVE_SESION);
    } catch {
      /* nada que borrar */
    }
  }

  private leerSesion(): Sesion | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(CLAVE_SESION) ?? 'null') as Sesion | null;
      return s && s.token && s.usuario && s.expira > Date.now() ? s : null;
    } catch {
      return null;
    }
  }
}
