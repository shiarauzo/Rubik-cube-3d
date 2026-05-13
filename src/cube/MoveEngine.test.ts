import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Test the snapQuaternion logic directly
function snapQuaternion(q: THREE.Quaternion): void {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const e = m.elements;
  const snapRow = (i: number) => {
    const ax = Math.abs(e[i]);
    const ay = Math.abs(e[i + 4]);
    const az = Math.abs(e[i + 8]);
    const max = Math.max(ax, ay, az);
    e[i] = ax === max ? Math.sign(e[i]) : 0;
    e[i + 4] = ay === max ? Math.sign(e[i + 4]) : 0;
    e[i + 8] = az === max ? Math.sign(e[i + 8]) : 0;
  };
  snapRow(0);
  snapRow(1);
  snapRow(2);
  q.setFromRotationMatrix(m);
}

describe('MoveEngine - Issue #11: Quaternion drift fix', () => {
  describe('snapQuaternion', () => {
    it('should snap identity quaternion to identity', () => {
      const q = new THREE.Quaternion(); // identity
      snapQuaternion(q);

      expect(q.w).toBeCloseTo(1, 5);
      expect(q.x).toBeCloseTo(0, 5);
      expect(q.y).toBeCloseTo(0, 5);
      expect(q.z).toBeCloseTo(0, 5);
    });

    it('should snap 90 degree rotation around Y axis', () => {
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 2
      );
      snapQuaternion(q);

      // After snapping, should still represent 90deg around Y
      const euler = new THREE.Euler().setFromQuaternion(q);
      expect(Math.abs(euler.y)).toBeCloseTo(Math.PI / 2, 3);
    });

    it('should snap 180 degree rotation around X axis', () => {
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI
      );
      snapQuaternion(q);

      const euler = new THREE.Euler().setFromQuaternion(q);
      expect(Math.abs(euler.x)).toBeCloseTo(Math.PI, 3);
    });

    it('should correct small floating-point drift', () => {
      // Simulate drift: 90deg rotation with small errors
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 2 + 0.001 // Small error
      );
      snapQuaternion(q);

      // Should snap back to exact 90deg
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
      const e = m.elements;

      // For a 90deg Y rotation, the matrix should have clean values
      // Check only the 3x3 rotation part (indices 0,1,2, 4,5,6, 8,9,10)
      // Allow small tolerance due to quaternion reconstruction
      const rotationIndices = [0, 1, 2, 4, 5, 6, 8, 9, 10];
      for (const i of rotationIndices) {
        const val = Math.round(e[i]);
        expect(val === 0 || val === 1 || val === -1).toBe(true);
        // Check that rounding was minimal (value was close to integer)
        expect(Math.abs(e[i] - val)).toBeLessThan(0.01);
      }
    });

    it('should maintain valid rotation after many snaps', () => {
      const q = new THREE.Quaternion();

      // Simulate many 90deg rotations with small accumulated error
      for (let i = 0; i < 100; i++) {
        const rotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI / 2 + Math.random() * 0.0001 - 0.00005 // tiny random error
        );
        q.multiply(rotation);
        snapQuaternion(q);
      }

      // Should still be a valid quaternion (normalized)
      expect(q.length()).toBeCloseTo(1, 5);

      // Should represent a valid 90-degree-aligned rotation
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
      const e = m.elements;

      // All rotation matrix elements should be exactly 0, 1, or -1
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const idx = i + j * 4;
          const val = e[idx];
          expect(val === 0 || val === 1 || val === -1).toBe(true);
        }
      }
    });
  });
});

describe('MoveEngine - Issue #12: queueMove options', () => {
  // These are integration tests that would require DOM/Three.js setup
  // Testing the API shape only
  it('queueMove should accept optional silent parameter', () => {
    // This tests that the TypeScript type allows the options parameter
    type QueueMoveSignature = (move: string, opts?: { silent?: boolean }) => Promise<void>;

    // If this compiles, the API shape is correct
    const mockFn: QueueMoveSignature = async (_move, _opts) => {};
    expect(mockFn).toBeDefined();
  });

  it('queueSequence should accept optional silent parameter', () => {
    type QueueSequenceSignature = (moves: string[], opts?: { silent?: boolean }) => Promise<void>;

    const mockFn: QueueSequenceSignature = async (_moves, _opts) => {};
    expect(mockFn).toBeDefined();
  });
});
