import { describe, it, expect } from 'vitest';
import { GestureClassifier } from './GestureClassifier';
import type { Landmark } from './types';

// Helper to create mock landmarks
function createMockLandmarks(config: {
  thumbExtended?: boolean;
  indexExtended?: boolean;
  middleExtended?: boolean;
  ringExtended?: boolean;
  pinkyExtended?: boolean;
  thumbY?: number; // relative to wrist
}): Landmark[] {
  const wristY = 0.5;
  const landmarks: Landmark[] = [];

  // Create 21 landmarks (MediaPipe hand model)
  for (let i = 0; i < 21; i++) {
    landmarks.push({ x: 0.5, y: wristY, z: 0 });
  }

  // Wrist (0)
  landmarks[0] = { x: 0.5, y: wristY, z: 0 };

  // Thumb: CMC(1), MCP(2), IP(3), TIP(4)
  if (config.thumbExtended) {
    landmarks[1] = { x: 0.4, y: wristY, z: 0 };
    landmarks[2] = { x: 0.35, y: wristY - 0.05, z: 0 };
    landmarks[3] = { x: 0.3, y: wristY - 0.1, z: 0 };
    landmarks[4] = { x: 0.25, y: wristY + (config.thumbY ?? -0.15), z: 0 };
  } else {
    landmarks[1] = { x: 0.45, y: wristY, z: 0 };
    landmarks[2] = { x: 0.48, y: wristY - 0.02, z: 0 };
    landmarks[3] = { x: 0.5, y: wristY - 0.03, z: 0 };
    landmarks[4] = { x: 0.52, y: wristY - 0.02, z: 0 };
  }

  // Index: MCP(5), PIP(6), DIP(7), TIP(8)
  const setFinger = (mcpIdx: number, extended: boolean) => {
    const baseY = wristY - 0.1;
    if (extended) {
      landmarks[mcpIdx] = { x: 0.5, y: baseY, z: 0 };
      landmarks[mcpIdx + 1] = { x: 0.5, y: baseY - 0.08, z: 0 };
      landmarks[mcpIdx + 2] = { x: 0.5, y: baseY - 0.14, z: 0 };
      landmarks[mcpIdx + 3] = { x: 0.5, y: baseY - 0.2, z: 0 };
    } else {
      landmarks[mcpIdx] = { x: 0.5, y: baseY, z: 0 };
      landmarks[mcpIdx + 1] = { x: 0.5, y: baseY - 0.03, z: 0 };
      landmarks[mcpIdx + 2] = { x: 0.5, y: baseY - 0.02, z: 0 };
      landmarks[mcpIdx + 3] = { x: 0.5, y: baseY - 0.01, z: 0 };
    }
  };

  setFinger(5, config.indexExtended ?? false);   // Index
  setFinger(9, config.middleExtended ?? false);  // Middle
  setFinger(13, config.ringExtended ?? false);   // Ring
  setFinger(17, config.pinkyExtended ?? false);  // Pinky

  return landmarks;
}

describe('GestureClassifier', () => {
  const classifier = new GestureClassifier();

  describe('Issue #4: thumb-up/thumb-down detection', () => {
    it('should detect thumbUp when thumb is extended upward and other fingers curled', () => {
      const landmarks = createMockLandmarks({
        thumbExtended: true,
        thumbY: -0.15, // Above wrist (y decreases upward)
        indexExtended: false,
        middleExtended: false,
        ringExtended: false,
        pinkyExtended: false,
      });

      const mockResult = {
        landmarks: [landmarks],
        handedness: [[{ categoryName: 'Right' }]],
      };

      const frame = classifier.classify(mockResult as any, Date.now());
      expect(frame.hands).toHaveLength(1);
      expect(frame.hands[0].shape).toBe('thumbUp');
    });

    it('should detect thumbDown when thumb is extended downward and other fingers curled', () => {
      const landmarks = createMockLandmarks({
        thumbExtended: true,
        thumbY: 0.15, // Below wrist (y increases downward)
        indexExtended: false,
        middleExtended: false,
        ringExtended: false,
        pinkyExtended: false,
      });

      const mockResult = {
        landmarks: [landmarks],
        handedness: [[{ categoryName: 'Right' }]],
      };

      const frame = classifier.classify(mockResult as any, Date.now());
      expect(frame.hands).toHaveLength(1);
      expect(frame.hands[0].shape).toBe('thumbDown');
    });

    it('should detect fist when all fingers including thumb are curled', () => {
      const landmarks = createMockLandmarks({
        thumbExtended: false,
        indexExtended: false,
        middleExtended: false,
        ringExtended: false,
        pinkyExtended: false,
      });

      const mockResult = {
        landmarks: [landmarks],
        handedness: [[{ categoryName: 'Right' }]],
      };

      const frame = classifier.classify(mockResult as any, Date.now());
      expect(frame.hands).toHaveLength(1);
      expect(frame.hands[0].shape).toBe('fist');
    });

    it('should NOT classify thumbUp as fist (the original bug)', () => {
      // This test ensures the bug fix is working:
      // Before the fix, thumbUp would be classified as fist
      const landmarks = createMockLandmarks({
        thumbExtended: true,
        thumbY: -0.15,
        indexExtended: false,
        middleExtended: false,
        ringExtended: false,
        pinkyExtended: false,
      });

      const mockResult = {
        landmarks: [landmarks],
        handedness: [[{ categoryName: 'Right' }]],
      };

      const frame = classifier.classify(mockResult as any, Date.now());
      expect(frame.hands[0].shape).not.toBe('fist');
    });
  });

  describe('bothFists detection', () => {
    it('should detect bothFists when two hands make fists', () => {
      const fistLandmarks = createMockLandmarks({
        thumbExtended: false,
        indexExtended: false,
        middleExtended: false,
        ringExtended: false,
        pinkyExtended: false,
      });

      const mockResult = {
        landmarks: [fistLandmarks, fistLandmarks],
        handedness: [
          [{ categoryName: 'Left' }],
          [{ categoryName: 'Right' }],
        ],
      };

      const frame = classifier.classify(mockResult as any, Date.now());
      expect(frame.bothFists).toBe(true);
    });
  });
});
