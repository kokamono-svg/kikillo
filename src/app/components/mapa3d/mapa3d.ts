// =====================================================================
// mapa3d.ts
// Mapa 3D de la RED de almacenes y de sus anaqueles.
//
// Exterior: Central Kepler (principal) surte a Colonia de Contratistas,
// que está dentro de la planta Mittal; de Colonia salen los 4 almacenes
// de área (Midrex, HYL, Laminador, Minas). Las bolitas que viajan por
// los caminos muestran hacia dónde fluye el equipo.
//
// Interior: los anaqueles se arman con el inventario REAL del almacén
// (AlmacenService). Cada nivel guarda un artículo y cada cajita es una
// unidad: de color = disponible, transparente = prestada, naranja = no
// apta o dañada. Si el inventario cambia (préstamo, devolución), el
// mapa se redibuja solo.
// =====================================================================
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { AlmacenService } from '../../almacenista/almacen.service';
import { AccesoAlmacen } from '../../almacenista/acceso-almacen.service';
import { Articulo, TipoArticulo } from '../../almacenista/almacen.models';
import { contieneCodigo } from '../../compartido/codigos';

/** Un almacén dentro de la red: dónde va y qué papel tiene. */
interface Nodo {
  nombre: string;
  corto: string;
  rol: 'principal' | 'distribucion' | 'area';
  descripcion: string;
  x: number;
  z: number;
  /** De qué almacén recibe equipo. */
  surte?: string;
}

/** Un anaquel del interior con hasta 4 artículos (uno por nivel). */
export interface Anaquel {
  codigo: string; // A-01, A-02...
  tipo: TipoArticulo;
  articulos: Articulo[];
  x: number;
  z: number;
}

const KEPLER = 'Central Kepler';
const COLONIA = 'Colonia de Contratistas (Mittal)';

/** La red: Kepler → Colonia (en Mittal) → 4 almacenes de área. */
const RED: Nodo[] = [
  { nombre: KEPLER, corto: 'Kepler', rol: 'principal', descripcion: 'Almacén principal. Surte a Colonia de Contratistas.', x: 0, z: -24 },
  { nombre: COLONIA, corto: 'Colonia de Contratistas', rol: 'distribucion', descripcion: 'Centro de distribución dentro de Mittal. Surte a los 4 almacenes de área.', x: 0, z: 0, surte: KEPLER },
  { nombre: 'Área Midrex', corto: 'Midrex', rol: 'area', descripcion: 'Almacén de área. Lo surte Colonia de Contratistas.', x: -19, z: 13, surte: COLONIA },
  { nombre: 'Área HYL', corto: 'HYL', rol: 'area', descripcion: 'Almacén de área. Lo surte Colonia de Contratistas.', x: -7, z: 21, surte: COLONIA },
  { nombre: 'Área Laminador', corto: 'Laminador', rol: 'area', descripcion: 'Almacén de área. Lo surte Colonia de Contratistas.', x: 7, z: 21, surte: COLONIA },
  { nombre: 'Área Minas', corto: 'Minas', rol: 'area', descripcion: 'Almacén de área. Lo surte Colonia de Contratistas.', x: 19, z: 13, surte: COLONIA },
];

/** Orden de los pasillos del interior y color de cada tipo de artículo. */
const TIPOS: TipoArticulo[] = ['Herramienta', 'EPP', 'Consumible'];
const COLOR_TIPO: Record<TipoArticulo, number> = { Herramienta: 0x3b82f6, EPP: 0x10b981, Consumible: 0x94a3b8 };
const COLOR_NO_APTO = 0xf97316;
const COLOR_EDIFICIO = { principal: 0x1d4ed8, distribucion: 0x059669, area: 0x475569 };

const NIVELES = 4; // artículos por anaquel
const CAJAS_POR_NIVEL = 8; // unidades que se dibujan por artículo (si hay más, se dibujan en proporción)
const SEP_ANAQUEL = 3.6; // distancia entre anaqueles
const SEP_PASILLO = 6; // distancia entre pasillos
import { BotonEscanerComponent } from '../../compartido/escaner/boton-escaner.component';
import { LectorDirective } from '../../compartido/escaner/lector.directive';

@Component({
  selector: 'app-mapa3d',
  imports: [BotonEscanerComponent, LectorDirective],
  standalone: true,
  templateUrl: './mapa3d.html',
  styleUrl: './mapa3d.css',
})
export class Mapa3d implements OnDestroy {
  readonly almacen = inject(AlmacenService);
  readonly acceso = inject(AccesoAlmacen);

  contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor3d');

  /* ---------- Estado de la pantalla ---------- */
  readonly vista = signal<'exterior' | 'interior'>('exterior');
  readonly almacenActual = signal<string | null>(null);
  readonly anaquelSel = signal<string | null>(null);
  readonly articuloSel = signal<string | null>(null);
  readonly busqueda = signal('');

  readonly colorTipo = COLOR_TIPO;

  /** Los nodos de la red con sus números reales. */
  readonly red = computed(() =>
    RED.map((n) => ({
      ...n,
      acceso: this.acceso.almacenes().includes(n.nombre),
      resumen: this.almacen.resumen(n.nombre),
    })),
  );

  readonly nodoActual = computed(() => this.red().find((n) => n.nombre === this.almacenActual()) ?? null);

  /** Anaqueles del almacén abierto, armados con su inventario. */
  readonly anaqueles = computed<Anaquel[]>(() => {
    const nombre = this.almacenActual();
    return nombre ? armarAnaqueles(this.almacen.catalogoDe(nombre)) : [];
  });

  readonly anaquelActual = computed(() => this.anaqueles().find((a) => a.codigo === this.anaquelSel()) ?? null);

  /** Resultados del buscador del interior: artículo + en qué anaquel está. */
  readonly resultados = computed(() => {
    const t = normalizar(this.busqueda());
    if (!t) return [];
    return this.anaqueles().flatMap((an) =>
      an.articulos
        .filter((a) => normalizar(a.nombre).includes(t) || contieneCodigo(a.codigo, t) || a.piezas?.some((p) => contieneCodigo(p.serie, t)))
        .map((a) => ({ articulo: a, anaquel: an.codigo })),
    );
  });

  /* ---------- Three.js ---------- */
  private escena!: THREE.Scene;
  private camara!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private etiquetas!: CSS2DRenderer;
  private controles!: OrbitControls;
  private listo = false;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private grupoMundo = new THREE.Group();
  private seleccionables: THREE.Object3D[] = [];

  /** Edificios (para resaltarlos al pasar el mouse). */
  private edificios = new Map<string, THREE.MeshStandardMaterial[]>();
  private hover: string | null = null;
  /** Cajitas de cada artículo (para resaltar el seleccionado). */
  private cajasArticulo = new Map<string, THREE.MeshStandardMaterial[]>();
  /** Marco amarillo alrededor del anaquel seleccionado. */
  private marcador?: THREE.Mesh;
  /** Bolitas que viajan por los caminos. */
  private flujo: { obj: THREE.Mesh; de: THREE.Vector3; a: THREE.Vector3; fase: number }[] = [];
  /** A dónde se mueve la cámara (se acerca suave al anaquel elegido). */
  private destino?: THREE.Vector3;

  private frameId = 0;
  private resizeObserver?: ResizeObserver;
  private posicionPointer?: { x: number; y: number };

  constructor() {
    afterNextRender(() => this.inicializar());

    // Si cambia el inventario (préstamo, devolución...), se redibuja lo que se está viendo
    effect(() => {
      this.almacen.inventarios();
      this.almacen.vales();
      untracked(() => this.listo && this.redibujar());
    });

    // El selector de almacén de arriba (admin y compras) abre ese almacén en el mapa
    effect(() => {
      const elegido = this.acceso.actual();
      untracked(() => {
        if (!this.listo || !this.acceso.veTodos()) return;
        if (elegido) this.entrarAlmacen(elegido);
        else this.mostrarExterior();
      });
    });
  }

  // ===================================================================
  // ARRANQUE
  // ===================================================================
  private inicializar(): void {
    const contenedor = this.contenedor().nativeElement;

    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0xeef2f7);
    this.escena.fog = new THREE.Fog(0xeef2f7, 90, 170);

    this.camara = new THREE.PerspectiveCamera(50, contenedor.clientWidth / contenedor.clientHeight, 0.1, 500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(contenedor.clientWidth, contenedor.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    contenedor.appendChild(this.renderer.domElement);

    // Etiquetas HTML que flotan sobre los edificios y anaqueles
    this.etiquetas = new CSS2DRenderer();
    this.etiquetas.setSize(contenedor.clientWidth, contenedor.clientHeight);
    Object.assign(this.etiquetas.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    contenedor.appendChild(this.etiquetas.domElement);

    this.controles = new OrbitControls(this.camara, this.renderer.domElement);
    this.controles.enableDamping = true;
    this.controles.maxPolarAngle = Math.PI / 2.15;
    // Si la persona mueve la cámara, deja de seguir al anaquel
    this.controles.addEventListener('start', () => (this.destino = undefined));

    this.escena.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 2.4);
    sol.position.set(25, 45, 25);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50 });
    this.escena.add(sol);
    this.escena.add(this.grupoMundo);

    const lienzo = this.renderer.domElement;
    lienzo.addEventListener('pointerdown', this.onPointerDown);
    lienzo.addEventListener('pointerup', this.onPointerUp);
    lienzo.addEventListener('pointermove', this.onPointerMove);

    this.resizeObserver = new ResizeObserver(() => {
      const ancho = contenedor.clientWidth;
      const alto = contenedor.clientHeight;
      if (!ancho || !alto) return;
      this.camara.aspect = ancho / alto;
      this.camara.updateProjectionMatrix();
      this.renderer.setSize(ancho, alto);
      this.etiquetas.setSize(ancho, alto);
    });
    this.resizeObserver.observe(contenedor);

    this.listo = true;
    // El almacenista entra directo a su almacén; admin/compras, a lo que eligió arriba
    const inicial = this.acceso.actual();
    if (inicial) this.entrarAlmacen(inicial);
    else this.mostrarExterior();
    this.animar();
  }

  // ===================================================================
  // NAVEGACIÓN (la usan el HTML y los clics en el 3D)
  // ===================================================================

  /** Abrir un almacén desde el mapa o la lista. */
  abrir(nombre: string): void {
    if (!this.acceso.almacenes().includes(nombre)) return;
    // Admin y compras: se sincroniza con el selector de arriba (el effect entra al almacén)
    if (this.acceso.veTodos()) this.acceso.elegir(nombre);
    else this.entrarAlmacen(nombre);
  }

  /** Regresar a la vista de la red. */
  volver(): void {
    if (this.acceso.veTodos()) this.acceso.elegir('');
    else this.mostrarExterior();
  }

  elegirAnaquel(codigo: string | null, articulo: string | null = null): void {
    this.anaquelSel.set(codigo);
    this.articuloSel.set(articulo);
    this.actualizarSeleccion(true);
  }

  // ===================================================================
  // VISTA EXTERIOR: LA RED
  // ===================================================================
  mostrarExterior(moverCamara = true): void {
    if (!this.escena) return;
    this.limpiarMundo();
    this.vista.set('exterior');
    this.almacenActual.set(null);
    this.anaquelSel.set(null);
    this.articuloSel.set(null);
    this.busqueda.set('');

    // Terreno general y planta Mittal (zona verde con cerca)
    this.caja(110, 0.4, 100, 0xe2e8f0, 0, -0.2, 2, { sombra: false });
    this.caja(56, 0.06, 40, 0xdcebe1, 0, 0.03, 12, { sombra: false });
    this.cerca(-28, 28, -8, 32, 6);
    this.etiqueta('Planta Mittal', 19, 0.2, 29, 'zona');

    // Caminos: Kepler → Colonia → cada almacén de área
    for (const n of RED) {
      if (!n.surte) continue;
      const origen = RED.find((o) => o.nombre === n.surte)!;
      this.camino(origen.x, origen.z, n.x, n.z, n.rol === 'distribucion' ? 2.6 : 1.8);
    }

    for (const nodo of this.red()) this.edificio(nodo);

    // Árboles alrededor (solo ambientación)
    for (const [x, z] of [[-14, -26], [14, -22], [-34, 4], [34, 2], [-36, 24], [36, 26], [-12, -14], [12, -16], [-30, -14], [30, -12], [0, 36], [-20, 38], [22, 38]]) {
      this.arbol(x, z);
    }

    if (moverCamara) this.ponerCamara(new THREE.Vector3(34, 40, 52), new THREE.Vector3(0, 0, 2), 20, 120);
  }

  private edificio(nodo: ReturnType<Mapa3d['red']>[number]): void {
    const tam = { principal: [13, 6.5, 9], distribucion: [11, 5.5, 8], area: [7.5, 4, 6] }[nodo.rol];
    const [ancho, alto, fondo] = tam;
    const r = nodo.resumen;
    // Franja del techo: naranja = vencidos, ámbar = stock bajo, verde = todo bien
    const estado = r.vencidos ? COLOR_NO_APTO : r.stockBajo.length ? 0xf59e0b : 0x22c55e;
    const color = nodo.acceso ? COLOR_EDIFICIO[nodo.rol] : 0x94a3b8;

    const grupo = new THREE.Group();
    grupo.position.set(nodo.x, 0, nodo.z);
    const materiales: THREE.MeshStandardMaterial[] = [];
    const parte = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
      const m = this.malla(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }), x, y, z, grupo);
      m.userData = { tipo: 'almacen', id: nodo.nombre };
      materiales.push(m.material as THREE.MeshStandardMaterial);
      if (nodo.acceso) this.seleccionables.push(m);
      return m;
    };

    parte(ancho, alto, fondo, color, 0, alto / 2, 0); // cuerpo
    parte(ancho + 0.6, 0.35, fondo + 0.6, 0x1e293b, 0, alto + 0.17, 0); // techo
    parte(ancho + 0.62, 0.12, 0.5, estado, 0, alto + 0.4, 0); // franja de estado
    parte(ancho * 0.32, alto * 0.55, 0.12, 0xe2e8f0, 0, (alto * 0.55) / 2, fondo / 2 + 0.07); // cortina
    parte(ancho * 0.9, 0.25, 1.4, 0x64748b, 0, 0.12, fondo / 2 + 0.7); // andén de carga

    this.grupoMundo.add(grupo);
    this.edificios.set(nodo.nombre, materiales);

    const rol = { principal: 'Principal', distribucion: 'Distribución', area: 'Área' }[nodo.rol];
    const datos = nodo.acceso
      ? `${r.disponibles} disp.${r.vencidos ? ` · ${r.vencidos} vencido${r.vencidos === 1 ? '' : 's'}` : ''}`
      : 'Sin acceso';
    this.etiqueta(nodo.corto, nodo.x, alto + 2.2, nodo.z, 'edificio', `${rol} · ${datos}`, !nodo.acceso);
  }

  /** Camino plano entre dos puntos + bolitas que viajan en el sentido del surtido. */
  private camino(x1: number, z1: number, x2: number, z2: number, ancho: number): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const largo = Math.hypot(dx, dz);
    const angulo = -Math.atan2(dz, dx);
    const centro = [(x1 + x2) / 2, (z1 + z2) / 2];

    const via = this.caja(largo, 0.05, ancho, 0x475569, centro[0], 0.08, centro[1], { sombra: false });
    via.rotation.y = angulo;
    const linea = this.caja(largo, 0.02, 0.12, 0xfacc15, centro[0], 0.12, centro[1], { sombra: false });
    linea.rotation.y = angulo;

    const de = new THREE.Vector3(x1, 0.45, z1);
    const a = new THREE.Vector3(x2, 0.45, z2);
    const material = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    for (let i = 0; i < 4; i++) {
      const bolita = this.malla(new THREE.SphereGeometry(0.32, 12, 12), material, 0, 0, 0);
      bolita.castShadow = false;
      this.flujo.push({ obj: bolita, de, a, fase: i / 4 });
    }
  }

  private cerca(x1: number, x2: number, z1: number, z2: number, puerta: number): void {
    const color = 0x94a3b8;
    const alto = 0.9;
    // Lado norte con puerta en el centro (por donde entra el camino desde Kepler)
    const tramo = (x2 - x1 - puerta) / 2;
    this.caja(tramo, alto, 0.2, color, x1 + tramo / 2, alto / 2, z1);
    this.caja(tramo, alto, 0.2, color, x2 - tramo / 2, alto / 2, z1);
    this.caja(x2 - x1, alto, 0.2, color, (x1 + x2) / 2, alto / 2, z2);
    this.caja(0.2, alto, z2 - z1, color, x1, alto / 2, (z1 + z2) / 2);
    this.caja(0.2, alto, z2 - z1, color, x2, alto / 2, (z1 + z2) / 2);
  }

  private arbol(x: number, z: number): void {
    this.malla(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x92400e }), x, 0.7, z);
    this.malla(new THREE.ConeGeometry(1.5, 3.4, 10), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.9 }), x, 3, z);
  }

  // ===================================================================
  // VISTA INTERIOR: ANAQUELES CON EL INVENTARIO REAL
  // ===================================================================
  entrarAlmacen(nombre: string, moverCamara = true): void {
    if (!this.escena || !this.acceso.almacenes().includes(nombre)) return;
    const mismo = this.almacenActual() === nombre && this.vista() === 'interior';
    this.limpiarMundo();
    this.vista.set('interior');
    this.almacenActual.set(nombre);
    if (!mismo) {
      this.anaquelSel.set(null);
      this.articuloSel.set(null);
      this.busqueda.set('');
    }

    const anaqueles = this.anaqueles();
    const filas = Math.max(1, new Set(anaqueles.map((a) => a.tipo)).size);
    const porFila = Math.max(1, ...TIPOS.map((t) => anaqueles.filter((a) => a.tipo === t).length));
    const ancho = Math.max(porFila * SEP_ANAQUEL + 8, 18);
    const fondo = filas * SEP_PASILLO + 4;

    // Piso, muros bajos y marcas de pasillo
    this.caja(ancho, 0.3, fondo, 0xcbd5e1, 0, -0.15, 0, { sombra: false });
    this.caja(ancho, 1.2, 0.25, 0x94a3b8, 0, 0.6, -fondo / 2);
    this.caja(0.25, 1.2, fondo, 0x94a3b8, -ancho / 2, 0.6, 0);
    this.caja(0.25, 1.2, fondo, 0x94a3b8, ancho / 2, 0.6, 0);
    const puerta = 5;
    this.caja((ancho - puerta) / 2, 1.2, 0.25, 0x94a3b8, -(ancho + puerta) / 4, 0.6, fondo / 2);
    this.caja((ancho - puerta) / 2, 1.2, 0.25, 0x94a3b8, (ancho + puerta) / 4, 0.6, fondo / 2);

    TIPOS.filter((t) => anaqueles.some((a) => a.tipo === t)).forEach((tipo) => {
      const z = anaqueles.find((a) => a.tipo === tipo)!.z;
      // Línea amarilla al frente del pasillo y su nombre junto al muro izquierdo
      this.caja(ancho - 2, 0.02, 0.12, 0xfacc15, 0, 0.01, z + SEP_PASILLO / 2, { sombra: false });
      this.etiqueta(tipo, -ancho / 2 + 2.2, 0.3, z, 'pasillo');
    });

    for (const an of anaqueles) this.anaquel(an);

    if (!anaqueles.length) this.etiqueta('Este almacén no tiene artículos', 0, 1, 0, 'pasillo');

    this.marcador = this.malla(
      new THREE.BoxGeometry(3.1, 4.5, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.22, depthWrite: false }),
      0, 2.2, 0,
    );
    this.marcador.castShadow = false;
    this.actualizarSeleccion(false);

    if (moverCamara) {
      const lado = Math.max(ancho, fondo);
      this.ponerCamara(new THREE.Vector3(lado * 0.3, lado * 0.62, fondo / 2 + lado * 0.42), new THREE.Vector3(0, 0.5, 0), 4, 80);
    }
  }

  private anaquel(an: Anaquel): void {
    const grupo = new THREE.Group();
    grupo.position.set(an.x, 0, an.z);
    const metal = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
    const tabla = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 });
    const marcar = (m: THREE.Mesh) => {
      m.userData = { tipo: 'anaquel', id: an.codigo };
      this.seleccionables.push(m);
    };

    for (const px of [-1.35, 1.35]) for (const pz of [-0.6, 0.6]) marcar(this.malla(new THREE.BoxGeometry(0.1, 4.3, 0.1), metal, px, 2.15, pz, grupo));

    an.articulos.forEach((art, nivel) => {
      const y = 0.35 + nivel * 1.0;
      marcar(this.malla(new THREE.BoxGeometry(2.8, 0.08, 1.25), tabla, 0, y, 0, grupo));
      this.cajas(art, y + 0.04, grupo, an.codigo);
    });
    // Niveles vacíos (el último anaquel de un pasillo puede no llenarse)
    for (let nivel = an.articulos.length; nivel < NIVELES; nivel++) {
      marcar(this.malla(new THREE.BoxGeometry(2.8, 0.08, 1.25), tabla, 0, 0.35 + nivel * 1.0, 0, grupo));
    }

    this.grupoMundo.add(grupo);
    this.etiqueta(an.codigo, an.x, 4.9, an.z, 'anaquel', `${an.articulos.length} artículo${an.articulos.length === 1 ? '' : 's'}`);
  }

  /** Dibuja las unidades de un artículo sobre su nivel: disponibles, prestadas y no aptas. */
  private cajas(art: Articulo, y: number, grupo: THREE.Group, anaquel: string): void {
    const color = COLOR_TIPO[art.tipo];
    const disp = this.almacen.disponibles(art);
    const prest = this.almacen.prestadas(this.almacenActual()!, art);
    const malas = this.almacen.noAptas(art);
    const [cDisp, cPrest, cMalas] = repartir([disp, prest, malas], CAJAS_POR_NIVEL);

    const lista: { estado: 'disp' | 'prest' | 'mala' }[] = [
      ...Array.from({ length: cDisp }, () => ({ estado: 'disp' as const })),
      ...Array.from({ length: cPrest }, () => ({ estado: 'prest' as const })),
      ...Array.from({ length: cMalas }, () => ({ estado: 'mala' as const })),
    ];
    const materiales: THREE.MeshStandardMaterial[] = [];
    const ancho = 0.27;
    const inicio = -((lista.length - 1) * (ancho + 0.05)) / 2;

    lista.forEach((c, i) => {
      const material = new THREE.MeshStandardMaterial({
        color: c.estado === 'mala' ? COLOR_NO_APTO : color,
        transparent: c.estado === 'prest',
        opacity: c.estado === 'prest' ? 0.18 : 1,
        roughness: 0.55,
      });
      const caja = this.malla(new THREE.BoxGeometry(ancho, 0.5, 0.8), material, inicio + i * (ancho + 0.05), y + 0.25, 0, grupo);
      caja.userData = { tipo: 'articulo', id: anaquel, codigo: art.codigo };
      this.seleccionables.push(caja);
      if (c.estado === 'prest') {
        // Contorno para que la unidad prestada se vea como "hueco"
        const borde = new THREE.LineSegments(new THREE.EdgesGeometry(caja.geometry), new THREE.LineBasicMaterial({ color: 0x64748b }));
        caja.add(borde);
        caja.castShadow = false;
      } else {
        materiales.push(material);
      }
    });
    this.cajasArticulo.set(art.codigo, materiales);
  }

  /** Mueve el marco amarillo y resalta las cajitas del artículo elegido. */
  private actualizarSeleccion(moverCamara: boolean): void {
    const an = this.anaquelActual();
    if (this.marcador) {
      this.marcador.visible = !!an;
      if (an) this.marcador.position.set(an.x, 2.2, an.z);
    }
    for (const [codigo, materiales] of this.cajasArticulo) {
      const activo = codigo === this.articuloSel();
      for (const m of materiales) m.emissive.setHex(activo ? 0xfacc15 : 0x000000);
    }
    if (an && moverCamara) this.destino = new THREE.Vector3(an.x, 1.5, an.z);
  }

  // ===================================================================
  // UTILIDADES DE DIBUJO
  // ===================================================================
  private malla(geometria: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, padre: THREE.Object3D = this.grupoMundo): THREE.Mesh {
    const m = new THREE.Mesh(geometria, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    padre.add(m);
    return m;
  }

  private caja(w: number, h: number, d: number, color: number, x: number, y: number, z: number, op: { sombra?: boolean } = {}): THREE.Mesh {
    const m = this.malla(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }), x, y, z);
    if (op.sombra === false) m.castShadow = false;
    return m;
  }

  /** Etiqueta HTML flotante (se ve nítida a cualquier zoom). */
  private etiqueta(texto: string, x: number, y: number, z: number, tipo: 'edificio' | 'anaquel' | 'pasillo' | 'zona', detalle = '', apagada = false): void {
    const el = document.createElement('div');
    const clases = {
      edificio: 'rounded-xl bg-white/95 px-3 py-1.5 text-center shadow-lg ring-1 ring-black/5',
      anaquel: 'rounded-lg bg-gray-900/85 px-2 py-0.5 text-center text-white shadow',
      pasillo: 'rounded-md bg-orange-400 px-2 py-0.5 text-[11px] font-bold tracking-wide text-orange-950 uppercase shadow',
      zona: 'rounded-full bg-emerald-700/90 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase shadow',
    };
    el.className = `${clases[tipo]} select-none whitespace-nowrap font-sans ${apagada ? 'opacity-60' : ''}`;
    const titulo = document.createElement('p');
    titulo.textContent = texto;
    titulo.className = tipo === 'edificio' ? 'text-sm font-bold text-gray-900' : tipo === 'anaquel' ? 'font-mono text-xs font-bold' : '';
    el.appendChild(titulo);
    const angosto = this.contenedor().nativeElement.clientWidth < 640;
    if (detalle && !(angosto && tipo === 'edificio')) {
      const sub = document.createElement('p');
      sub.textContent = detalle;
      sub.className = tipo === 'edificio' ? 'text-[11px] text-gray-500' : 'text-[10px] text-gray-300';
      el.appendChild(sub);
    }
    const obj = new CSS2DObject(el);
    obj.position.set(x, y, z);
    this.grupoMundo.add(obj);
  }

  private ponerCamara(posicion: THREE.Vector3, objetivo: THREE.Vector3, min: number, max: number): void {
    this.destino = undefined;
    const aspecto = this.camara.aspect;
    const alejar = aspecto < 1.2 ? Math.min(1.2 / aspecto, 2.3) : 1;
    this.camara.position.copy(posicion.clone().sub(objetivo).multiplyScalar(alejar).add(objetivo));
    this.controles.target.copy(objetivo);
    this.controles.minDistance = min;
    this.controles.maxDistance = max;
    this.controles.update();
  }

  /** Vuelve a pintar la vista actual sin mover la cámara (cuando cambian los datos). */
  private redibujar(): void {
    const actual = this.almacenActual();
    if (this.vista() === 'interior' && actual) this.entrarAlmacen(actual, false);
    else this.mostrarExterior(false);
  }

  private limpiarMundo(): void {
    this.seleccionables = [];
    this.edificios.clear();
    this.cajasArticulo.clear();
    this.flujo = [];
    this.marcador = undefined;
    this.hover = null;
    this.grupoMundo.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
      }
    });
    this.grupoMundo.clear(); // las etiquetas HTML se quitan solas al salir de la escena
  }

  // ===================================================================
  // MOUSE / TOQUE
  // ===================================================================
  private tocado(evento: PointerEvent): THREE.Intersection | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((evento.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((evento.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camara);
    return this.raycaster.intersectObjects(this.seleccionables, false)[0];
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.posicionPointer = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.posicionPointer) return;
    const distancia = Math.hypot(e.clientX - this.posicionPointer.x, e.clientY - this.posicionPointer.y);
    this.posicionPointer = undefined;
    if (distancia > 6) return; // fue un arrastre de cámara, no un clic

    const datos = this.tocado(e)?.object.userData;
    if (!datos) {
      if (this.vista() === 'interior') this.elegirAnaquel(null);
      return;
    }
    if (datos['tipo'] === 'almacen') this.abrir(datos['id']);
    else if (datos['tipo'] === 'anaquel') this.elegirAnaquel(datos['id']);
    else if (datos['tipo'] === 'articulo') this.elegirAnaquel(datos['id'], datos['codigo']);
  };

  /** Manita al pasar sobre algo que se puede tocar y brillo en el edificio. */
  private onPointerMove = (e: PointerEvent): void => {
    if (e.buttons) return; // arrastrando la cámara
    const datos = this.tocado(e)?.object.userData;
    this.renderer.domElement.style.cursor = datos ? 'pointer' : 'grab';
    const id = datos?.['tipo'] === 'almacen' ? (datos['id'] as string) : null;
    if (id === this.hover) return;
    if (this.hover) this.edificios.get(this.hover)?.forEach((m) => m.emissive.setHex(0x000000));
    if (id) this.edificios.get(id)?.forEach((m) => m.emissive.setHex(0x1e3a8a));
    this.hover = id;
  };

  private animar = (): void => {
    this.frameId = requestAnimationFrame(this.animar);
    // Bolitas recorriendo los caminos
    const t = performance.now() / 4000;
    for (const f of this.flujo) f.obj.position.lerpVectors(f.de, f.a, (t + f.fase) % 1);
    // Acercamiento suave al anaquel elegido
    if (this.destino) {
      this.controles.target.lerp(this.destino, 0.08);
      if (this.controles.target.distanceTo(this.destino) < 0.02) this.destino = undefined;
    }
    this.controles.update();
    this.renderer.render(this.escena, this.camara);
    this.etiquetas.render(this.escena, this.camara);
  };

  // ===================================================================
  // PARA EL HTML
  // ===================================================================
  disponibles(a: Articulo): number {
    return this.almacen.disponibles(a);
  }

  prestadas(a: Articulo): number {
    return this.almacen.prestadas(this.almacenActual() ?? '', a);
  }

  noAptas(a: Articulo): number {
    return this.almacen.noAptas(a);
  }

  hex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    if (!this.renderer) return;
    const lienzo = this.renderer.domElement;
    lienzo.removeEventListener('pointerdown', this.onPointerDown);
    lienzo.removeEventListener('pointerup', this.onPointerUp);
    lienzo.removeEventListener('pointermove', this.onPointerMove);
    this.controles.dispose();
    this.limpiarMundo();
    this.renderer.dispose();
    lienzo.remove();
    this.etiquetas.domElement.remove();
  }
}

// =====================================================================
// FUNCIONES PURAS (sin Three.js)
// =====================================================================

/** Acomoda los artículos en anaqueles: un pasillo por tipo, 4 artículos por anaquel. */
export function armarAnaqueles(articulos: Articulo[]): Anaquel[] {
  const resultado: Anaquel[] = [];
  const tipos = TIPOS.filter((t) => articulos.some((a) => a.tipo === t));
  tipos.forEach((tipo, fila) => {
    const deTipo = articulos.filter((a) => a.tipo === tipo);
    const cuantos = Math.ceil(deTipo.length / NIVELES);
    for (let i = 0; i < cuantos; i++) {
      resultado.push({
        codigo: 'A-' + String(resultado.length + 1).padStart(2, '0'),
        tipo,
        articulos: deTipo.slice(i * NIVELES, (i + 1) * NIVELES),
        x: (i - (cuantos - 1) / 2) * SEP_ANAQUEL,
        z: (fila - (tipos.length - 1) / 2) * SEP_PASILLO,
      });
    }
  });
  return resultado;
}

/**
 * Reparte "cupo" cajitas en proporción a cada cantidad, sin que una
 * cantidad mayor a 0 se quede sin cajita. Ej.: [120, 3, 0] en 8 → [7, 1, 0].
 */
export function repartir(cantidades: number[], cupo: number): number[] {
  const total = cantidades.reduce((s, c) => s + c, 0);
  if (total <= cupo) return cantidades;
  // Cada cantidad mayor a 0 tiene al menos 1 cajita; el resto se reparte en proporción
  const base: number[] = cantidades.map((c) => (c > 0 ? 1 : 0));
  const libres = cupo - base.reduce((s, c) => s + c, 0);
  const sobrante = total - base.reduce((s, c) => s + c, 0);
  const extra = cantidades.map((c) => (c > 0 ? ((c - 1) * libres) / sobrante : 0));
  const enteros = extra.map(Math.floor);
  // Las cajitas que faltan van a quien tenga la parte decimal más grande (nunca a una cantidad en 0)
  extra
    .map((e, i) => ({ i, resto: e - enteros[i] }))
    .filter(({ i }) => cantidades[i] > 0)
    .sort((a, b) => b.resto - a.resto)
    .slice(0, libres - enteros.reduce((s, c) => s + c, 0))
    .forEach(({ i }) => enteros[i]++);
  return base.map((b, i) => b + enteros[i]);
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
