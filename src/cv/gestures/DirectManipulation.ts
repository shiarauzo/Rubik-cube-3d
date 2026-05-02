import * as THREE from 'three';
import type { Face, Move } from '../../types';
import type { CubeView, Cubie } from '../../cube/CubeView';
import type { MoveEngine } from '../../cube/MoveEngine';
import type { HandShape, Handedness, Landmark } from './types';

type GrabPhase = 'IDLE' | 'PINCHING' | 'DRAGGING' | 'RELEASING';

interface LayerSelection {
  face: Face;
  axis: THREE.Vector3;
  cubies: Cubie[];
}

interface GrabState {
  hand: Handedness;
  startNDC: THREE.Vector2;
  layer: LayerSelection;
  currentAngle: number;
}

const FACE_AXIS: Record<Face, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
};

const AXIS_TO_FACES: [THREE.Vector3, Face, Face][] = [
  [new THREE.Vector3(1, 0, 0), 'R', 'L'],
  [new THREE.Vector3(0, 1, 0), 'U', 'D'],
  [new THREE.Vector3(0, 0, 1), 'F', 'B'],
];

const DRAG_THRESHOLD = 0.03;
const ROTATION_SENSITIVITY = 3.5;

export class DirectManipulation {
  private raycaster = new THREE.Raycaster();
  private phase: GrabPhase = 'IDLE';
  private grabState: GrabState | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private view: CubeView,
    private engine: MoveEngine,
    private pivot: THREE.Group,
  ) {}

  processFrame(hands: HandShape[], landmarks: Map<Handedness, Landmark[]>): void {
    const pinchingHand = hands.find((h) => h.shape === 'pinch');

    switch (this.phase) {
      case 'IDLE':
        if (pinchingHand) {
          const lm = landmarks.get(pinchingHand.hand);
          if (lm) this.tryStartGrab(pinchingHand.hand, lm);
        }
        break;

      case 'PINCHING':
        if (!pinchingHand || (this.grabState && pinchingHand.hand !== this.grabState.hand)) {
          this.cancelGrab();
        } else if (this.grabState) {
          const lm = landmarks.get(this.grabState.hand);
          if (lm) this.checkDragStart(lm);
        }
        break;

      case 'DRAGGING':
        if (!pinchingHand || (this.grabState && pinchingHand.hand !== this.grabState.hand)) {
          this.releaseGrab();
        } else if (this.grabState) {
          const lm = landmarks.get(this.grabState.hand);
          if (lm) this.updateDrag(lm);
        }
        break;

      case 'RELEASING':
        // Waiting for animation to complete
        break;
    }
  }

  private toNDC(landmark: Landmark): THREE.Vector2 {
    // Video is mirrored via CSS, flip x for screen mapping
    const screenX = 1 - landmark.x;
    const screenY = landmark.y;
    const ndcX = screenX * 2 - 1;
    const ndcY = -(screenY * 2 - 1);
    return new THREE.Vector2(ndcX, ndcY);
  }

  private getPinchPoint(landmarks: Landmark[]): Landmark {
    const thumb = landmarks[4];
    const index = landmarks[8];
    return {
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
      z: (thumb.z + index.z) / 2,
    };
  }

  private tryStartGrab(hand: Handedness, landmarks: Landmark[]): void {
    const pinchPoint = this.getPinchPoint(landmarks);
    const ndc = this.toNDC(pinchPoint);

    const hit = this.raycastToCube(ndc.x, ndc.y);
    if (!hit) return;

    this.phase = 'PINCHING';
    this.grabState = {
      hand,
      startNDC: ndc.clone(),
      layer: null!,
      currentAngle: 0,
    };
  }

  private checkDragStart(landmarks: Landmark[]): void {
    if (!this.grabState) return;

    const pinchPoint = this.getPinchPoint(landmarks);
    const ndc = this.toNDC(pinchPoint);
    const delta = ndc.clone().sub(this.grabState.startNDC);

    if (delta.length() < DRAG_THRESHOLD) return;

    // Determine layer based on hit and drag direction
    const hit = this.raycastToCube(this.grabState.startNDC.x, this.grabState.startNDC.y);
    if (!hit) {
      this.cancelGrab();
      return;
    }

    const layer = this.determineLayer(hit, delta);
    if (!layer) {
      this.cancelGrab();
      return;
    }

    this.grabState.layer = layer;
    this.phase = 'DRAGGING';

    // Attach layer cubies to pivot
    for (const c of layer.cubies) this.pivot.attach(c.mesh);
    this.pivot.quaternion.identity();
  }

  private raycastToCube(ndcX: number, ndcY: number): THREE.Intersection | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const meshes: THREE.Object3D[] = [];
    for (const cubie of this.view.getAllCubies()) {
      cubie.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshes.push(obj);
      });
    }

    const intersects = this.raycaster.intersectObjects(meshes, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  private determineLayer(hit: THREE.Intersection, dragDir: THREE.Vector2): LayerSelection | null {
    const hitNormal = hit.face?.normal;
    if (!hitNormal) return null;

    // Transform normal to world space
    const worldNormal = hitNormal.clone().transformDirection(hit.object.matrixWorld).normalize();

    // Find which face this normal corresponds to
    let hitFace: Face | null = null;
    let maxDot = -Infinity;
    for (const [face, axis] of Object.entries(FACE_AXIS) as [Face, THREE.Vector3][]) {
      const dot = worldNormal.dot(axis);
      if (dot > maxDot) {
        maxDot = dot;
        hitFace = face;
      }
    }

    if (!hitFace || maxDot < 0.8) return null;

    // Get the cubie's position
    let cubie: Cubie | null = null;
    let parent = hit.object.parent;
    while (parent) {
      for (const c of this.view.getAllCubies()) {
        if (c.mesh === parent) {
          cubie = c;
          break;
        }
      }
      if (cubie) break;
      parent = parent.parent;
    }

    if (!cubie) return null;

    const cubiePos = cubie.mesh.position.clone();

    // Determine rotation axis based on drag direction
    // Project drag direction to 3D: camera right is (1,0,0) in screen, up is (0,1,0)
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    // Drag in 3D space
    const drag3D = cameraRight.clone().multiplyScalar(dragDir.x).add(cameraUp.clone().multiplyScalar(dragDir.y));

    // Rotation axis is perpendicular to both face normal and drag direction
    const faceAxisVec = FACE_AXIS[hitFace].clone();
    const rotationAxis = drag3D.clone().cross(faceAxisVec).normalize();

    // Find which standard axis this is closest to
    let bestAxisIdx = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < AXIS_TO_FACES.length; i++) {
      const dot = Math.abs(rotationAxis.dot(AXIS_TO_FACES[i][0]));
      if (dot > bestDot) {
        bestDot = dot;
        bestAxisIdx = i;
      }
    }

    if (bestAxisIdx < 0 || bestDot < 0.5) return null;

    const [standardAxis, posFace, negFace] = AXIS_TO_FACES[bestAxisIdx];
    const sign = rotationAxis.dot(standardAxis) > 0 ? 1 : -1;
    const actualAxis = standardAxis.clone().multiplyScalar(sign);

    // Determine which layer based on cubie position
    const axisIdx = standardAxis.x !== 0 ? 0 : standardAxis.y !== 0 ? 1 : 2;
    const coord = axisIdx === 0 ? cubiePos.x : axisIdx === 1 ? cubiePos.y : cubiePos.z;
    const roundedCoord = Math.round(coord);

    // Map coordinate to face
    let face: Face;
    if (roundedCoord === 1) {
      face = posFace;
    } else if (roundedCoord === -1) {
      face = negFace;
    } else {
      // Middle layer - use one of the adjacent faces
      // For middle slices, we'll just use the positive face
      face = posFace;
    }

    // Only support outer layers for now (not middle slices)
    if (roundedCoord === 0) return null;

    const cubies = this.view.getLayerCubies(face);
    return { face, axis: actualAxis, cubies };
  }

  private updateDrag(landmarks: Landmark[]): void {
    if (!this.grabState || !this.grabState.layer) return;

    const pinchPoint = this.getPinchPoint(landmarks);
    const ndc = this.toNDC(pinchPoint);
    const delta = ndc.clone().sub(this.grabState.startNDC);

    // Convert drag delta to rotation angle
    const angle = delta.length() * ROTATION_SENSITIVITY;

    // Determine rotation direction based on drag direction relative to axis
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const drag3D = cameraRight.clone().multiplyScalar(delta.x).add(cameraUp.clone().multiplyScalar(delta.y));

    // Cross product to determine rotation direction
    const faceAxis = FACE_AXIS[this.grabState.layer.face];
    const cross = drag3D.clone().cross(faceAxis);
    const direction = cross.dot(this.grabState.layer.axis) > 0 ? 1 : -1;

    this.grabState.currentAngle = angle * direction;

    // Apply rotation to pivot
    this.pivot.quaternion.setFromAxisAngle(this.grabState.layer.axis, this.grabState.currentAngle);
  }

  private cancelGrab(): void {
    if (this.grabState?.layer) {
      // Reparent cubies back without committing
      for (const c of this.grabState.layer.cubies) {
        this.view.group.attach(c.mesh);
      }
      this.pivot.quaternion.identity();
    }
    this.grabState = null;
    this.phase = 'IDLE';
  }

  private async releaseGrab(): Promise<void> {
    if (!this.grabState || !this.grabState.layer) {
      this.phase = 'IDLE';
      return;
    }

    this.phase = 'RELEASING';

    const angle = this.grabState.currentAngle;
    const face = this.grabState.layer.face;
    const cubies = this.grabState.layer.cubies;
    const axis = this.grabState.layer.axis;

    // Determine snap target
    const absAngle = Math.abs(angle);
    let targetAngle: number;
    let move: Move | null = null;

    if (absAngle < Math.PI / 4) {
      // Less than 45 degrees - cancel
      targetAngle = 0;
    } else if (absAngle < (3 * Math.PI) / 4) {
      // 45-135 degrees - single turn
      targetAngle = angle > 0 ? Math.PI / 2 : -Math.PI / 2;
      const suffix = angle > 0 ? "'" : '';
      move = `${face}${suffix}` as Move;
    } else {
      // 135+ degrees - double turn
      targetAngle = angle > 0 ? Math.PI : -Math.PI;
      move = `${face}2` as Move;
    }

    // Animate to target
    await this.animateSnap(axis, angle, targetAngle, cubies);

    // Reparent cubies back
    for (const c of cubies) {
      this.view.group.attach(c.mesh);
      c.mesh.position.x = Math.round(c.mesh.position.x);
      c.mesh.position.y = Math.round(c.mesh.position.y);
      c.mesh.position.z = Math.round(c.mesh.position.z);
    }
    this.pivot.quaternion.identity();
    this.view.snapAll();

    // Commit the move if applicable
    if (move && !this.engine.isBusy()) {
      // We already rotated visually, just update the model
      this.engine.setSilent();
      this.engine.queueMove(move);
    }

    this.grabState = null;
    this.phase = 'IDLE';
  }

  private animateSnap(
    axis: THREE.Vector3,
    fromAngle: number,
    toAngle: number,
    _cubies: Cubie[],
  ): Promise<void> {
    return new Promise((resolve) => {
      const duration = 150;
      const start = performance.now();

      const tick = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(1, elapsed / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad

        const currentAngle = fromAngle + (toAngle - fromAngle) * eased;
        this.pivot.quaternion.setFromAxisAngle(axis, currentAngle);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      tick();
    });
  }
}
