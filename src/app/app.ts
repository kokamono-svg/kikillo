import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaService } from './compartido/pwa/pwa.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  /** Avisa cuando se publicó una versión nueva de la app (PWA). */
  readonly pwa = inject(PwaService);
}
