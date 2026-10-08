import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Mapa3d } from './components/mapa3d/mapa3d';

@Component({
  imports: [RouterOutlet,Mapa3d],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('hackathon');
}
