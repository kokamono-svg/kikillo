import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Vale } from '../almacen.models';

/** El vale como documento: se ve igual en pantalla y en papel. */
@Component({
  selector: 'app-vale-impreso',
  imports: [DatePipe],
  templateUrl: './vale-impreso.component.html',
  host: { class: 'block' },
})
export class ValeImpresoComponent {
  readonly vale = input.required<Vale>();
}
