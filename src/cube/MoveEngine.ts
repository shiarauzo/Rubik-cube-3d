import * as THREE from 'three';
import type { Face, Move } from '../types';
import { CubeModel } from './CubeModel';
import { CubeView, type Cubie } from './CubeView';
import { easeInOutQuart } from '../util/math';
import { bus } from '../app/events';

const FACE_AXIS: Record<Face, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
};

const ANIM_MS = 240;

interface QueuedMove {
  move: Move;
  resolve: () => void;
}

export class MoveEngine {
  private queue: QueuedMove[] = [];
  private running = false;
  private moveCount = 0;
  private silentNextApply = false;

  constructor(
    private readonly view: CubeView,
    private readonly model: CubeModel,
    private readonly pivot: THREE.Group,
  ) {}

  resetCounter(): void {
    this.moveCount = 0;
  }

  /** When the next applyMove is processed, do not emit move:applied. */
  setSilent(): void {
    this.silentNextApply = true;
  }

  queueMove(move: Move): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ move, resolve });
      if (!this.running) this.runNext();
    });
  }

  async queueSequence(moves: Move[]): Promise<void> {
    for (const m of moves) await this.queueMove(m);
  }

  isBusy(): boolean {
    return this.running;
  }

  pendingCount(): number {
    return this.queue.length;
  }

  private async runNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.running = false;
      return;
    }
    this.running = true;
    await this.animate(item.move);
    item.resolve();
    this.runNext();
  }

  private async animate(move: Move): Promise<void> {
    const face = move[0] as Face;
    const suffix = move.slice(1);
    let angle = -Math.PI / 2;
    if (suffix === "'") angle = +Math.PI / 2;
    else if (suffix === '2') angle = -Math.PI;

    // Sign correction: angle around face axis (outward) = standard CW for plain face.
    // The rotation in three.js with axis = outward normal and negative angle gives
    // a clockwise rotation when viewed from outside that face.
    const axis = FACE_AXIS[face].clone().normalize();

    const cubies = this.view.getLayerCubies(face);
    // Reparent layer cubies to the pivot.
    for (const c of cubies) this.pivot.attach(c.mesh);
    this.pivot.quaternion.identity();

    const start = performance.now();
    const duration = suffix === '2' ? ANIM_MS * 1.35 : ANIM_MS;
    const fromQ = new THREE.Quaternion();
    const toQ = new THREE.Quaternion().setFromAxisAngle(axis, angle);

    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        const eased = easeInOutQuart(t);
        const q = new THREE.Quaternion().slerpQuaternions(fromQ, toQ, eased);
        this.pivot.quaternion.copy(q);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });

    // Bake: reparent each cubie back to root, applying the pivot transform.
    for (const c of cubies) this.snapBack(c);
    this.pivot.quaternion.identity();
    this.view.snapAll();

    // Update logical model
    this.model.applyMove(move);

    if (this.silentNextApply) {
      this.silentNextApply = false;
    } else {
      this.moveCount += 1;
      bus.emit('move:applied', { move, total: this.moveCount });
      if (this.model.isSolved()) bus.emit('cube:solved', undefined);
    }
  }

  private snapBack(cubie: Cubie): void {
    const root = this.pivot.parent!;
    root.attach(cubie.mesh);
    // Round position to lattice
    cubie.mesh.position.x = Math.round(cubie.mesh.position.x);
    cubie.mesh.position.y = Math.round(cubie.mesh.position.y);
    cubie.mesh.position.z = Math.round(cubie.mesh.position.z);
  }
}
