
import {
  afterNextRender,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild
} from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface Almacen {
  id: number;
  nombre: string;
  descripcion: string;
  color: number;
  x: number;
  z: number;
}

interface Estanteria {
  id: string;
  capacidad: number;
  ocupados: number;
  prestados: number;
}

@Component({
  selector: 'app-mapa3d',
  standalone: true,
  templateUrl: './mapa3d.html',
  styleUrl: './mapa3d.css'
})
export class Mapa3d implements OnDestroy {

  contenedor = viewChild.required<ElementRef<HTMLDivElement>>(
    'contenedor3d'
  );

  vista = signal<'exterior' | 'interior'>('exterior');
  almacenSeleccionado = signal<Almacen | null>(null);
  estanteriaSeleccionada = signal<Estanteria | null>(null);

  almacenes: Almacen[] = [
    {
      id: 1,
      nombre: 'Almacén Principal',
      descripcion: 'Centro principal de distribución e inventario',
      color: 0x2563eb,
      x: 0,
      z: -10
    },
    {
      id: 2,
      nombre: 'Almacén A',
      descripcion: 'Almacén secundario de herramientas',
      color: 0x16a34a,
      x: -13,
      z: 8
    },
    {
      id: 3,
      nombre: 'Almacén B',
      descripcion: 'Almacén secundario de equipos',
      color: 0xd97706,
      x: 0,
      z: 10
    },
    {
      id: 4,
      nombre: 'Almacén C',
      descripcion: 'Almacén secundario de materiales',
      color: 0x9333ea,
      x: 13,
      z: 8
    }
  ];

  private escena!: THREE.Scene;
  private camara!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controles!: OrbitControls;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private grupoMundo = new THREE.Group();
  private seleccionables: THREE.Object3D[] = [];

  private frameId = 0;
  private resizeObserver?: ResizeObserver;
  private posicionPointer?: { x: number; y: number };

  constructor() {
    afterNextRender(() => this.inicializar());
  }

  private inicializar(): void {
    const contenedor = this.contenedor().nativeElement;

    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0xeaf1f8);

    this.camara = new THREE.PerspectiveCamera(
      55,
      contenedor.clientWidth / contenedor.clientHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    );

    this.renderer.setSize(
      contenedor.clientWidth,
      contenedor.clientHeight
    );

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    contenedor.appendChild(this.renderer.domElement);

    this.controles = new OrbitControls(
      this.camara,
      this.renderer.domElement
    );

    this.controles.enableDamping = true;
    this.controles.maxPolarAngle = Math.PI / 2.05;

    const ambiente = new THREE.AmbientLight(0xffffff, 1.8);
    this.escena.add(ambiente);

    const sol = new THREE.DirectionalLight(0xffffff, 2.2);
    sol.position.set(15, 30, 20);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.left = -35;
    sol.shadow.camera.right = 35;
    sol.shadow.camera.top = 35;
    sol.shadow.camera.bottom = -35;
    this.escena.add(sol);

    this.escena.add(this.grupoMundo);

    this.renderer.domElement.addEventListener(
      'pointerdown',
      this.onPointerDown
    );

    this.renderer.domElement.addEventListener(
      'pointerup',
      this.onPointerUp
    );

    this.resizeObserver = new ResizeObserver(() => {
      const ancho = contenedor.clientWidth;
      const alto = contenedor.clientHeight;

      if (!ancho || !alto) return;

      this.camara.aspect = ancho / alto;
      this.camara.updateProjectionMatrix();
      this.renderer.setSize(ancho, alto);
    });

    this.resizeObserver.observe(contenedor);

    this.mostrarExterior();
    this.animar();
  }

  private crearCaja(
    ancho: number,
    alto: number,
    profundidad: number,
    color: number,
    x: number,
    y: number,
    z: number,
    metalness = 0
  ): THREE.Mesh {

    const geometria = new THREE.BoxGeometry(
      ancho, alto, profundidad
    );

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness
    });

    const objeto = new THREE.Mesh(geometria, material);
    objeto.position.set(x, y, z);
    objeto.castShadow = true;
    objeto.receiveShadow = true;

    this.grupoMundo.add(objeto);

    return objeto;
  }

  private limpiarMundo(): void {
    this.seleccionables = [];

    this.grupoMundo.traverse(objeto => {
      if (objeto instanceof THREE.Mesh) {
        objeto.geometry.dispose();

        const materiales = Array.isArray(objeto.material)
          ? objeto.material
          : [objeto.material];

        materiales.forEach(material => material.dispose());
      }
    });

    this.grupoMundo.clear();
  }

  mostrarExterior(): void {
    if (!this.escena) return;

    this.limpiarMundo();

    this.vista.set('exterior');
    this.almacenSeleccionado.set(null);
    this.estanteriaSeleccionada.set(null);

    // Terreno
    this.crearCaja(
      48, 0.3, 42,
      0xcbd5e1,
      0, -0.25, 0
    );

    // Camino central
    this.crearCaja(
      4, 0.04, 28,
      0x64748b,
      0, -0.07, 0
    );

    // Edificios
    for (const almacen of this.almacenes) {
      const principal = almacen.id === 1;

      const ancho = principal ? 11 : 8;
      const alto = principal ? 6 : 4.5;
      const profundidad = principal ? 8 : 6;

      const edificio = this.crearCaja(
        ancho,
        alto,
        profundidad,
        almacen.color,
        almacen.x,
        alto / 2,
        almacen.z
      );

      edificio.userData = {
        tipo: 'almacen',
        id: almacen.id
      };

      this.seleccionables.push(edificio);

      // Techo
      this.crearCaja(
        ancho + 0.7,
        0.45,
        profundidad + 0.7,
        0x334155,
        almacen.x,
        alto + 0.2,
        almacen.z
      );

      // Puerta frontal
      this.crearCaja(
        2.5,
        3,
        0.12,
        0xe2e8f0,
        almacen.x,
        1.5,
        almacen.z + profundidad / 2 + 0.07
      );
    }

    this.camara.position.set(29, 31, 38);
    this.controles.target.set(0, 0, 0);
    this.controles.minDistance = 12;
    this.controles.maxDistance = 90;
    this.controles.update();
  }

  entrarAlmacen(id: number): void {
    if (!this.escena) return;

    const almacen = this.almacenes.find(a => a.id === id);
    if (!almacen) return;

    this.limpiarMundo();

    this.vista.set('interior');
    this.almacenSeleccionado.set(almacen);
    this.estanteriaSeleccionada.set(null);

    // Piso
    this.crearCaja(
      26, 0.3, 23,
      0x94a3b8,
      0, -0.2, 0
    );

    // Líneas de pasillos
    for (let i = 0; i < 3; i++) {
      this.crearCaja(
        23, 0.015, 0.1,
        0xfacc15,
        0, -0.035,
        -8.5 + i * 7
      );
    }

    // 12 estanterías
    for (let fila = 0; fila < 3; fila++) {
      for (let columna = 0; columna < 4; columna++) {

        const numero = fila * 4 + columna + 1;
        const codigo = `EST-${String(numero).padStart(2, '0')}`;

        const x = -8.5 + columna * 5.6;
        const z = -6.5 + fila * 6.5;

        this.crearEstanteria(codigo, x, z);
      }
    }

    this.camara.position.set(19, 22, 25);
    this.controles.target.set(0, 0, 0);
    this.controles.minDistance = 5;
    this.controles.maxDistance = 60;
    this.controles.update();
  }

  private crearEstanteria(
    codigo: string,
    x: number,
    z: number
  ): void {

    const grupo = new THREE.Group();
    grupo.position.set(x, 0, z);

    const materialMetal = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.65,
      roughness: 0.35
    });

    const materialTabla = new THREE.MeshStandardMaterial({
      color: 0xf59e0b
    });

    // Cuatro soportes verticales
    for (const px of [-1.1, 1.1]) {
      for (const pz of [-1.3, 1.3]) {

        const soporte = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 3.8, 0.13),
          materialMetal
        );

        soporte.position.set(px, 1.9, pz);
        grupo.add(soporte);
      }
    }

    // Cuatro niveles horizontales
    for (let nivel = 0; nivel < 4; nivel++) {

      const tabla = new THREE.Mesh(
        new THREE.BoxGeometry(2.35, 0.14, 2.8),
        materialTabla
      );

      tabla.position.y = 0.45 + nivel * 1.05;
      grupo.add(tabla);
    }

    grupo.userData = {
      tipo: 'estanteria',
      id: codigo
    };

    grupo.traverse(objeto => {
      if (objeto instanceof THREE.Mesh) {
        objeto.castShadow = true;
        objeto.receiveShadow = true;
        objeto.userData = {
          tipo: 'estanteria',
          id: codigo
        };
        this.seleccionables.push(objeto);
      }
    });

    this.grupoMundo.add(grupo);
  }

  private onPointerDown = (evento: PointerEvent): void => {
    this.posicionPointer = {
      x: evento.clientX,
      y: evento.clientY
    };
  };

  private onPointerUp = (evento: PointerEvent): void => {
    if (!this.posicionPointer) return;

    const distancia = Math.hypot(
      evento.clientX - this.posicionPointer.x,
      evento.clientY - this.posicionPointer.y
    );

    this.posicionPointer = undefined;

    // Ignorar arrastres de cámara
    if (distancia > 5) return;

    const rect = this.renderer.domElement.getBoundingClientRect();

    this.mouse.x =
      ((evento.clientX - rect.left) / rect.width) * 2 - 1;

    this.mouse.y =
      -((evento.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camara);

    const resultados = this.raycaster.intersectObjects(
      this.seleccionables
    );

    if (resultados.length === 0) return;

    const datos = resultados[0].object.userData;

    if (datos['tipo'] === 'almacen') {
      this.entrarAlmacen(datos['id']);
      return;
    }

    if (datos['tipo'] === 'estanteria') {
      const numero = Number(datos['id'].split('-')[1]);

      this.estanteriaSeleccionada.set({
        id: datos['id'],
        capacidad: 50,
        ocupados: 12 + numero * 2,
        prestados: numero % 5
      });
    }
  };

  private animar = (): void => {
    this.frameId = requestAnimationFrame(this.animar);
    this.controles.update();
    this.renderer.render(this.escena, this.camara);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();

    if (!this.renderer) return;

    this.renderer.domElement.removeEventListener(
      'pointerdown',
      this.onPointerDown
    );

    this.renderer.domElement.removeEventListener(
      'pointerup',
      this.onPointerUp
    );

    this.controles.dispose();
    this.limpiarMundo();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
