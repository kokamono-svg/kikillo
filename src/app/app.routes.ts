import { Routes } from '@angular/router';
import { LoginComponent } from './login.component/login.component';
import { SolicitanteComponent } from './solicitante.component/solicitante.component';

export const routes: Routes = [

  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard.component/dashboard.routes').then((m) => m.routes),
  },
  {
    path: '',
    component: LoginComponent
  },
  {
    path: 'rh',
    loadChildren: () => import('./rh/rh.routes').then((m) => m.RH_ROUTES),
  },
  {
path: 'solicitante',
component: SolicitanteComponent,
  },
{
path: '**',
    redirectTo: '',
}

];
