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
import { HandRotation } from '../cv/gestures/HandRotation';
import { FaceControl } from '../cv/gestures/FaceControl';
import { TwoHandController } from '../cv/gestures/TwoHandController';
import { HandOverlay } from '../cv/HandOverlay';
import { ModeIndicator } from '../cv/ModeIndicator';
import { CameraPermissionModal, type CameraErrorReason } from '../cv/CameraPermissionModal';
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
  private handRotation: HandRotation;
  private faceControl: FaceControl;
  private twoHandController: TwoHandController;
  private handOverlay: HandOverlay;
  private modeIndicator: ModeIndicator;
  private cameraModal: CameraPermissionModal;
  private contactShadow: THREE.Mesh | null = null;

  private mode: Mode = 'mouse';
  private modeTransitioning = false;
  private lastDetectionTime = 0;
  private cvFrame = 0;
  private pivot: THREE.Group;
  private resizeHandler: () => void;

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
    });
    this.hud.setMode('mouse');

    const video = document.getElementById('cv-video') as HTMLVideoElement;
    const overlay = document.getElementById('cv-overlay') as HTMLCanvasElement;
    this.webcam = new Webcam(video);
    this.handTracker = new HandTracker();
    this.gestureClassifier = new GestureClassifier();
    this.handRotation = new HandRotation(this.view);
    this.faceControl = new FaceControl(this.view, this.engine);
    this.twoHandController = new TwoHandController(
      this.handRotation,
      this.faceControl,
      this.solver,
      this.engine,
      this.model,
    );
    this.handOverlay = new HandOverlay(overlay);
    this.modeIndicator = new ModeIndicator(document.getElementById('cv-layer')!);
    this.cameraModal = new CameraPermissionModal();

    // Find contact shadow in scene for AR mode visibility toggle
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === 'contactShadow') {
        this.contactShadow = obj;
      }
    });

    this.bindKeys();

    this.resizeHandler = () => {
      this.camera.aspect = this.renderer.aspect;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.renderer.dispose();
    this.solver.dispose();
    this.handTracker.dispose();
    this.webcam.stop();
  }

  start(): void {
    this.loop();
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);

    // Only update orbit controls in non-AR modes
    if (this.mode !== 'ar') {
      this.orbit.update();
    }

    if (this.mode === 'ar' && this.webcam.isOn() && this.handTracker.isReady()) {
      // Ease the whole-cube orientation toward its target every frame so the
      // mechanical 90° snaps animate smoothly between detection ticks.
      this.handRotation.update();

      const now = performance.now();
      this.cvFrame += 1;
      // Throttle hand detection to ~30 Hz (33ms) regardless of display refresh rate
      if (now - this.lastDetectionTime > 33) {
        this.lastDetectionTime = now;
        const result = this.handTracker.detect(this.webcam.video, now);
        if (import.meta.env.DEV && this.cvFrame % 60 === 0) {
          console.log('[AR] Detection result:', result?.landmarks?.length ?? 0, 'hands');
        }
        if (result) {
          const frame = this.gestureClassifier.classify(result, performance.now());
          // Build landmarks map for direct manipulation
          const landmarksMap = new Map<'Left' | 'Right', import('../cv/gestures/types').Landmark[]>();
          const allLandmarks: import('../cv/gestures/types').Landmark[][] = [];
          const isPinching: boolean[] = [];

          if (result.landmarks && result.handedness) {
            for (let i = 0; i < result.landmarks.length; i++) {
              const hand = result.handedness[i]?.[0]?.categoryName as 'Left' | 'Right' | undefined;
              const lm = result.landmarks[i] as import('../cv/gestures/types').Landmark[];
              if (hand) {
                landmarksMap.set(hand, lm);
              }
              allLandmarks.push(lm);
              // Check if this hand is pinching
              const shape = frame.hands.find(h => h.hand === hand);
              isPinching.push(shape?.shape === 'pinch');
            }
          }

          // Process through TwoHandController (coordinates rotation + manipulation + solver)
          this.twoHandController.processFrame(frame, landmarksMap);

          // Get mode state for visual feedback
          const modeColor = this.twoHandController.getModeColor();
          const solverProgress = this.twoHandController.getSolverProgress();

          // Draw hand overlay with mode colors
          this.handOverlay.draw(allLandmarks, isPinching, modeColor, solverProgress);

          // Update mode indicator
          this.modeIndicator.update(
            this.twoHandController.getState(),
            modeColor,
            this.twoHandController.getModeLabel(),
            solverProgress,
          );
        }
      }
    } else if (this.mode !== 'ar') {
      this.handOverlay.clear();
      this.modeIndicator.hide();
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
      const move = map[e.key];
      if (move) {
        this.engine.queueMove(move);
      }
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
    if (this.mode === mode || this.modeTransitioning) return;
    this.modeTransitioning = true;

    try {
      const prevMode = this.mode;
      this.mode = mode;
      this.hud.setMode(mode);
      const cvLayer = document.getElementById('cv-layer')!;
      cvLayer.classList.toggle('active', mode === 'ar');
      cvLayer.classList.toggle('ar-mode', mode === 'ar');
      bus.emit('mode:changed', { mode });

      // Handle AR mode specifics
      if (mode === 'ar') {
        // Hide contact shadow in AR mode
        if (this.contactShadow) this.contactShadow.visible = false;
        // Disable orbit controls
        this.orbit.enabled = false;
        // Activate the color-based face controls
        this.faceControl.setActive(true);
        // Enable gesture-driven cube rotation (left-hand pinch + drag)
        this.handRotation.setEnabled(true);
      } else if (prevMode === 'ar') {
        // Restore from AR mode
        if (this.contactShadow) this.contactShadow.visible = true;
        this.orbit.enabled = true;
        // Deactivate the face controls
        this.faceControl.setActive(false);
        // Stop accepting rotation gestures (keeps current orientation)
        this.handRotation.setEnabled(false);
      }

      if (mode === 'mouse') {
        return;
      }

      if (!this.webcam.isOn()) {
        try {
          await this.webcam.start();
        } catch (err) {
          console.error('[App] Failed to start webcam:', err);
          const e = err as DOMException;
          let reason: CameraErrorReason = 'unknown';
          if (e.name === 'NotAllowedError') reason = 'denied';
          else if (e.name === 'NotFoundError') reason = 'not-found';

          // Revert to mouse mode
          this.mode = 'mouse';
          this.hud.setMode('mouse');
          const cvLayer = document.getElementById('cv-layer')!;
          cvLayer.classList.remove('active', 'ar-mode');
          if (this.contactShadow) this.contactShadow.visible = true;
          this.orbit.enabled = true;
          this.faceControl.setActive(false);
          this.handRotation.setEnabled(false);

          // Show modal with retry option
          this.cameraModal.show(reason, () => this.setMode('ar'));
          return;
        }
      }

      if (mode === 'ar') {
        try {
          if (import.meta.env.DEV) console.log('[AR] Initializing hand tracker...');
          await this.handTracker.init();
          if (import.meta.env.DEV) console.log('[AR] Hand tracker ready:', this.handTracker.isReady());
        } catch (e) {
          console.error('[AR] Hand tracker init failed:', e);
        }
      }
    } finally {
      this.modeTransitioning = false;
    }
  }

  private async toggleCamera(): Promise<void> {
    if (this.webcam.isOn()) {
      this.webcam.stop();
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
}
