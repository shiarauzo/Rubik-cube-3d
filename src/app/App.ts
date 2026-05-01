import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { createCamera, createScene } from '../render/Scene';
import { createOrbit } from '../render/OrbitCam';
import { CubeView } from '../cube/CubeView';
import { CubeModel } from '../cube/CubeModel';
import { MoveEngine } from '../cube/MoveEngine';
import { generateScramble } from '../cube/Scrambler';
import { Solver } from '../solver/Solver';
import { Hud } from '../hud/Hud';
import { Webcam } from '../cv/Webcam';
import { HandTracker } from '../cv/HandTracker';
import { GestureClassifier } from '../cv/gestures/GestureClassifier';
import { GestureMapper } from '../cv/gestures/GestureMapper';
import { GridOverlay } from '../cv/scan/GridOverlay';
import { ScanController } from '../cv/scan/ScanController';
import { bus } from './events';
import type { Mode, Move } from '../types';
import { expandHalfTurns } from '../cube/Notation';

export class App {
  private renderer: Renderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbit: ReturnType<typeof createOrbit>;
  private view: CubeView;
  private model: CubeModel;
  private engine: MoveEngine;
  private solver: Solver;
  private hud: Hud;

  private webcam: Webcam;
  private handTracker: HandTracker;
  private gestureClassifier: GestureClassifier;
  private gestureMapper: GestureMapper;
  private gridOverlay: GridOverlay;
  private scanCtl: ScanController;

  private mode: Mode = 'mouse';
  private cvFrame = 0;
  private pivot: THREE.Group;

  constructor() {
    const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.scene = createScene();
    this.camera = createCamera(this.renderer.aspect);
    this.orbit = createOrbit(this.camera, canvas);

    this.view = new CubeView();
    this.scene.add(this.view.group);
    this.pivot = new THREE.Group();
    this.view.group.add(this.pivot);

    this.model = new CubeModel();
    this.engine = new MoveEngine(this.view, this.model, this.pivot);

    this.solver = new Solver();

    const hudRoot = document.getElementById('hud-root')!;
    this.hud = new Hud(hudRoot, {
      onScramble: () => this.scramble(),
      onReset: () => this.reset(),
      onSolve: () => this.solve(),
      onModeChange: (m) => this.setMode(m),
      onCameraToggle: () => this.toggleCamera(),
      onScanCapture: () => this.scanCtl.capture(),
      onScanRestart: () => this.scanCtl.start(),
    });
    this.hud.setMode('mouse');

    const video = document.getElementById('cv-video') as HTMLVideoElement;
    const overlay = document.getElementById('cv-overlay') as HTMLCanvasElement;
    this.webcam = new Webcam(video);
    this.handTracker = new HandTracker();
    this.gestureClassifier = new GestureClassifier();
    this.gestureMapper = new GestureMapper({
      onMove: (m) => this.engine.queueMove(m),
    });
    this.gridOverlay = new GridOverlay(overlay);
    this.scanCtl = new ScanController(this.webcam, this.gridOverlay, (res) => this.applyScanResult(res));

    this.bindKeys();
    this.bindBus();

    window.addEventListener('resize', () => {
      this.camera.aspect = this.renderer.aspect;
      this.camera.updateProjectionMatrix();
    });
  }

  start(): void {
    this.loop();
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    this.orbit.update();

    if (this.mode === 'gestures' && this.webcam.isOn() && this.handTracker.isReady()) {
      this.cvFrame += 1;
      // Throttle hand detection to ~30 Hz on 60 fps render.
      if (this.cvFrame % 2 === 0) {
        const result = this.handTracker.detect(this.webcam.video, performance.now());
        if (result) {
          const frame = this.gestureClassifier.classify(result, performance.now());
          this.gestureMapper.process(frame);
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  private bindKeys(): void {
    const map: Record<string, Move> = {
      r: 'R', R: "R'",
      u: 'U', U: "U'",
      f: 'F', F: "F'",
      l: 'L', L: "L'",
      d: 'D', D: "D'",
      b: 'B', B: "B'",
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') {
        if (this.mode === 'scan') {
          e.preventDefault();
          this.scanCtl.capture();
        }
        return;
      }
      const move = map[e.key];
      if (move) {
        this.engine.queueMove(move);
      }
    });
  }

  private bindBus(): void {
    bus.on('scan:progress', ({ faceIndex, total }) => {
      const label = this.scanCtl.faceLabel();
      this.hud.setScanProgress(faceIndex, total, `Mostrando: <b>${label}</b>. Pulsa <kbd>Espacio</kbd> o el botón.`);
    });
  }

  private async scramble(): Promise<void> {
    const moves = generateScramble(22);
    bus.emit('cube:scrambled', { moves });
    this.engine.resetCounter();
    for (const m of moves) {
      this.engine.setSilent();
      await this.engine.queueMove(m);
    }
  }

  private reset(): void {
    this.model.reset();
    this.view.repaintFromFacelets(this.model.getFacelets());
    this.engine.resetCounter();
    bus.emit('cube:reset', undefined);
  }

  private async solve(): Promise<void> {
    if (!this.solver.isReady()) {
      bus.emit('toast', { message: 'Solver cargando, espera unos segundos…', kind: 'warn' });
      return;
    }
    if (this.model.isSolved()) {
      bus.emit('toast', { message: 'Ya está resuelto', kind: 'info' });
      return;
    }
    try {
      const facelets = this.model.getFacelets();
      const moves = await this.solver.solve(facelets);
      const expanded = expandHalfTurns(moves as Move[]);
      for (const m of expanded) {
        await this.engine.queueMove(m);
      }
    } catch (err) {
      bus.emit('toast', { message: `Error al resolver: ${(err as Error).message}`, kind: 'error' });
    }
  }

  private async setMode(mode: Mode): Promise<void> {
    if (this.mode === mode) return;
    this.mode = mode;
    this.hud.setMode(mode);
    const cvLayer = document.getElementById('cv-layer')!;
    cvLayer.classList.toggle('active', mode !== 'mouse');
    cvLayer.classList.toggle('scan-mode', mode === 'scan');
    bus.emit('mode:changed', { mode });

    if (mode === 'mouse') {
      this.gridOverlay.clear();
      return;
    }

    if (!this.webcam.isOn()) {
      try {
        await this.webcam.start();
      } catch {
        return;
      }
    }

    if (mode === 'gestures') {
      try {
        await this.handTracker.init();
      } catch {
        /* error already toasted */
      }
    } else if (mode === 'scan') {
      this.scanCtl.start();
    }
  }

  private async toggleCamera(): Promise<void> {
    if (this.webcam.isOn()) {
      this.webcam.stop();
      this.gridOverlay.clear();
      const cvLayer = document.getElementById('cv-layer')!;
      cvLayer.classList.remove('active');
    } else {
      try {
        await this.webcam.start();
        document.getElementById('cv-layer')!.classList.add('active');
      } catch {
        /* error already toasted */
      }
    }
  }

  private applyScanResult(res: { stickers54: import('../types').StickerColor[] }): void {
    try {
      this.model.setFromStickers(res.stickers54);
      this.view.repaintFromFacelets(this.model.getFacelets());
      // re-attach pivot (was inside view.group; group rebuilt? No — repaint reuses cubies)
      bus.emit('toast', { message: 'Escaneo completado, listo para resolver', kind: 'info' });
      this.setMode('mouse');
    } catch (err) {
      bus.emit('toast', { message: `Estado inválido: ${(err as Error).message}`, kind: 'error' });
    }
  }
}
