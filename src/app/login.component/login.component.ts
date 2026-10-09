import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'login.component',
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly usuario = signal('');
  readonly password = signal('');
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly verPassword = signal(false);
  readonly anio = new Date().getFullYear();

  entrar(evento: Event): void {
    evento.preventDefault();
    if (this.cargando()) return;

    if (!this.usuario().trim() || !this.password()) {
      this.error.set('Escribe tu usuario y tu contraseña.');
      return;
    }

    this.cargando.set(true);
    this.error.set('');
    this.auth.iniciarSesion(this.usuario(), this.password()).subscribe({
      next: (u) => this.router.navigateByUrl(this.auth.inicioDe(u.rol)),
      error: (e: unknown) => {
        this.cargando.set(false);
        this.password.set('');
        const status = e instanceof HttpErrorResponse ? e.status : 0;
        this.error.set(
          status === 401 ? 'Usuario o contraseña incorrectos.'
          : status === 429 ? 'Demasiados intentos. Espera unos minutos.'
          : 'No se pudo conectar con el servidor. Intenta de nuevo.'
        );
      },
    });
  }
}
