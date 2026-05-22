import * as THREE from 'three';
import type { Landmark } from './gestures/types';

// MediaPipe hand connections for skeleton (same as HandOverlay)
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [0, 9], [9, 10], [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17],            // palm
];

// Fingertip indices (for magenta highlighting)
const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

// Material colors (neon/cyber style)
const COLORS = {
  jointBase: 0x1a1a2e,
  jointEmissive: 0x00ffff, // cyan
  boneBase: 0x0d0d1a,
  boneEmissive: 0x00ffff,
  fingertipBase: 0x1a1a2e,
  fingertipEmissive: 0xff00ff, // magenta
};

interface HandMeshes {
  joints: THREE.Mesh[];
  bones: THREE.Mesh[];
}

export class Hand3DRenderer {
  private scene: THREE.Scene;
  private leftHand: HandMeshes;
  private rightHand: HandMeshes;

  // Shared geometries
  private jointGeometry: THREE.SphereGeometry;
  private fingertipGeometry: THREE.SphereGeometry;
  private boneGeometry: THREE.CylinderGeometry;

  // Materials
  private jointMaterial: THREE.MeshStandardMaterial;
  private fingertipMaterial: THREE.MeshStandardMaterial;
  private boneMaterial: THREE.MeshStandardMaterial;

  // Group to hold all hand meshes
  private handsGroup: THREE.Group;

  // Animation time for pulse effect
  private startTime: number;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.startTime = performance.now();

    // Create shared geometries
    this.jointGeometry = new THREE.SphereGeometry(0.06, 12, 8);
    this.fingertipGeometry = new THREE.SphereGeometry(0.08, 12, 8);
    this.boneGeometry = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);

    // Create materials with emissive glow
    this.jointMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.jointBase,
      emissive: COLORS.jointEmissive,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
    });

    this.fingertipMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.fingertipBase,
      emissive: COLORS.fingertipEmissive,
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.2,
    });

    this.boneMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.boneBase,
      emissive: COLORS.boneEmissive,
      emissiveIntensity: 0.3,
      metalness: 0.6,
      roughness: 0.3,
    });

    // Create group for all hand meshes
    this.handsGroup = new THREE.Group();
    this.handsGroup.name = 'hand3DGroup';
    this.scene.add(this.handsGroup);

    // Create meshes for both hands
    this.leftHand = this.createHandMeshes();
    this.rightHand = this.createHandMeshes();

    // Initially hide all meshes
    this.hideHand(this.leftHand);
    this.hideHand(this.rightHand);
  }

  private createHandMeshes(): HandMeshes {
    const joints: THREE.Mesh[] = [];
    const bones: THREE.Mesh[] = [];

    // Create 21 joint spheres
    for (let i = 0; i < 21; i++) {
      const isFingertip = FINGERTIP_INDICES.includes(i);
      const geometry = isFingertip ? this.fingertipGeometry : this.jointGeometry;
      const material = isFingertip ? this.fingertipMaterial : this.jointMaterial;

      const joint = new THREE.Mesh(geometry, material);
      joint.visible = false;
      this.handsGroup.add(joint);
      joints.push(joint);
    }

    // Create bones for each connection
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const bone = new THREE.Mesh(this.boneGeometry, this.boneMaterial);
      bone.visible = false;
      this.handsGroup.add(bone);
      bones.push(bone);
    }

    return { joints, bones };
  }

  private hideHand(hand: HandMeshes): void {
    for (const joint of hand.joints) {
      joint.visible = false;
    }
    for (const bone of hand.bones) {
      bone.visible = false;
    }
  }

  private landmarkTo3D(
    landmark: Landmark,
    handedness: 'Left' | 'Right',
  ): THREE.Vector3 {
    // Transform from video coordinates (0-1) to world coordinates
    // x: 0-1 (video) → z: -1.5 to 1.5 (front/back of cube)
    // y: 0-1 (video) → y: -2 to 2 (up/down)
    // handedness determines x offset (left side or right side of cube)

    // Video is mirrored, so flip x
    const videoX = 1 - landmark.x;
    const videoY = landmark.y;
    const videoZ = landmark.z;

    // Map to world coordinates
    // z: maps video x to depth (0-1 → -1.5 to 1.5)
    const worldZ = (videoX - 0.5) * 3;

    // y: maps video y to height (0-1 → 2 to -2, inverted because video y goes down)
    const worldY = (0.5 - videoY) * 4;

    // x: base offset based on handedness, plus small adjustment from depth
    // Left hand on left side of cube (negative x)
    // Right hand on right side of cube (positive x)
    const baseX = handedness === 'Left' ? -2.2 : 2.2;
    // Add depth influence: closer (more negative z in MediaPipe) moves toward cube
    const depthOffset = videoZ * 0.5;
    const worldX = handedness === 'Left'
      ? baseX + depthOffset
      : baseX - depthOffset;

    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  private updateHandMeshes(
    hand: HandMeshes,
    landmarks: Landmark[],
    handedness: 'Left' | 'Right',
  ): void {
    // Update joint positions
    for (let i = 0; i < 21; i++) {
      const pos = this.landmarkTo3D(landmarks[i], handedness);
      hand.joints[i].position.copy(pos);
      hand.joints[i].visible = true;
    }

    // Update bones
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const [startIdx, endIdx] = HAND_CONNECTIONS[i];
      const startPos = hand.joints[startIdx].position;
      const endPos = hand.joints[endIdx].position;

      const bone = hand.bones[i];

      // Position bone at midpoint
      bone.position.lerpVectors(startPos, endPos, 0.5);

      // Scale bone to match distance
      const distance = startPos.distanceTo(endPos);
      bone.scale.set(1, distance, 1);

      // Orient bone to connect the two joints
      bone.lookAt(endPos);
      bone.rotateX(Math.PI / 2);

      bone.visible = true;
    }
  }

  update(landmarksMap: Map<'Left' | 'Right', Landmark[]>): void {
    // Update pulse effect
    const time = (performance.now() - this.startTime) * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);

    // Apply pulse to emissive intensity
    this.jointMaterial.emissiveIntensity = 0.4 + pulse * 0.4;
    this.fingertipMaterial.emissiveIntensity = 0.6 + pulse * 0.4;
    this.boneMaterial.emissiveIntensity = 0.2 + pulse * 0.2;

    // Update or hide left hand
    const leftLandmarks = landmarksMap.get('Left');
    if (leftLandmarks && leftLandmarks.length === 21) {
      this.updateHandMeshes(this.leftHand, leftLandmarks, 'Left');
    } else {
      this.hideHand(this.leftHand);
    }

    // Update or hide right hand
    const rightLandmarks = landmarksMap.get('Right');
    if (rightLandmarks && rightLandmarks.length === 21) {
      this.updateHandMeshes(this.rightHand, rightLandmarks, 'Right');
    } else {
      this.hideHand(this.rightHand);
    }
  }

  dispose(): void {
    // Remove group from scene
    this.scene.remove(this.handsGroup);

    // Dispose geometries
    this.jointGeometry.dispose();
    this.fingertipGeometry.dispose();
    this.boneGeometry.dispose();

    // Dispose materials
    this.jointMaterial.dispose();
    this.fingertipMaterial.dispose();
    this.boneMaterial.dispose();

    // Clear meshes from group
    while (this.handsGroup.children.length > 0) {
      const child = this.handsGroup.children[0];
      this.handsGroup.remove(child);
    }
  }
}
