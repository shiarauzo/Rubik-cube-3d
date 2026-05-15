import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { GestureFrame, HandShape, Handedness, Landmark } from './types';
import {
  PINCH_THRESHOLD,
  FINGER_EXTENSION_RATIO,
  THUMB_UP_THRESHOLD,
  THUMB_DOWN_THRESHOLD,
  LANDMARK_WRIST,
  LANDMARK_THUMB_TIP,
  LANDMARK_THUMB_PIP,
  LANDMARK_THUMB_MCP,
  LANDMARK_INDEX_TIP,
  LANDMARK_INDEX_PIP,
  LANDMARK_INDEX_MCP,
  LANDMARK_MIDDLE_TIP,
  LANDMARK_MIDDLE_PIP,
  LANDMARK_MIDDLE_MCP,
  LANDMARK_RING_TIP,
  LANDMARK_RING_PIP,
  LANDMARK_RING_MCP,
  LANDMARK_PINKY_TIP,
  LANDMARK_PINKY_PIP,
  LANDMARK_PINKY_MCP,
} from './constants';

const FINGER_TIPS = [
  LANDMARK_THUMB_TIP,
  LANDMARK_INDEX_TIP,
  LANDMARK_MIDDLE_TIP,
  LANDMARK_RING_TIP,
  LANDMARK_PINKY_TIP,
];
const FINGER_PIPS = [
  LANDMARK_THUMB_PIP,
  LANDMARK_INDEX_PIP,
  LANDMARK_MIDDLE_PIP,
  LANDMARK_RING_PIP,
  LANDMARK_PINKY_PIP,
];
const FINGER_MCPS = [
  LANDMARK_THUMB_MCP,
  LANDMARK_INDEX_MCP,
  LANDMARK_MIDDLE_MCP,
  LANDMARK_RING_MCP,
  LANDMARK_PINKY_MCP,
];
const WRIST = LANDMARK_WRIST;
const MIDDLE_MCP = LANDMARK_MIDDLE_MCP;

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFingerExtended(landmarks: Landmark[], finger: number): boolean {
  const tip = landmarks[FINGER_TIPS[finger]];
  const pip = landmarks[FINGER_PIPS[finger]];
  const mcp = landmarks[FINGER_MCPS[finger]];
  const wrist = landmarks[WRIST];
  const tipDist = dist(tip, wrist);
  const pipDist = dist(pip, wrist);
  const mcpDist = dist(mcp, wrist);
  return tipDist > pipDist && pipDist > mcpDist * FINGER_EXTENSION_RATIO;
}

function isPinching(landmarks: Landmark[]): boolean {
  const thumbTip = landmarks[LANDMARK_THUMB_TIP];
  const indexTip = landmarks[LANDMARK_INDEX_TIP];
  const wrist = landmarks[WRIST];
  const middleMcp = landmarks[MIDDLE_MCP];
  const handSize = dist(wrist, middleMcp);
  const pinchDist = dist(thumbTip, indexTip) / handSize;
  return pinchDist < PINCH_THRESHOLD;
}

function classify(landmarks: Landmark[], hand: Handedness): HandShape {
  const wrist = landmarks[WRIST];

  // Check pinch first (thumb and index touching)
  if (isPinching(landmarks)) {
    return { hand, shape: 'pinch', wrist };
  }

  const ext = [0, 1, 2, 3, 4].map((f) => isFingerExtended(landmarks, f));
  const [thumbExt, indexExt, middleExt, ringExt, pinkyExt] = ext;
  const indexTip = landmarks[LANDMARK_INDEX_TIP];
  const indexMcp = landmarks[LANDMARK_INDEX_MCP];

  const fingersExtCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

  // Fist: no fingers extended (thumb optional)
  if (fingersExtCount === 0) {
    return { hand, shape: 'fist', wrist };
  }

  // Open palm: 4+ fingers extended
  if (fingersExtCount >= 3 && thumbExt) {
    // Determine palm orientation: cross product of (indexMcp - wrist) and (pinky_mcp - wrist)
    const v1 = sub(landmarks[LANDMARK_INDEX_MCP], wrist);
    const v2 = sub(landmarks[LANDMARK_PINKY_MCP], wrist);
    const cross = crossZ(v1, v2);
    // For Right hand, palm-towards-camera means the palm faces +Z (out of screen).
    // Image coords: x grows right, y grows down. Cross sign indicates orientation.
    const palmIn = (hand === 'Right' ? cross > 0 : cross < 0);
    return { hand, shape: palmIn ? 'palmIn' : 'palmOut', wrist };
  }

  // Thumb up/down: thumb extended, others curled
  if (thumbExt && fingersExtCount === 0) {
    const thumbTip = landmarks[LANDMARK_THUMB_TIP];
    if (thumbTip.y < wrist.y - THUMB_UP_THRESHOLD) return { hand, shape: 'thumbUp', wrist };
    if (thumbTip.y > wrist.y + THUMB_DOWN_THRESHOLD) return { hand, shape: 'thumbDown', wrist };
  }

  // Pointing: index extended, others curled
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    const dx = indexTip.x - indexMcp.x;
    const dy = indexTip.y - indexMcp.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ay > ax) {
      return { hand, shape: dy < 0 ? 'pointUp' : 'pointDown', wrist };
    } else {
      // In image coords, +x is right of the *frame*. Selfie video is mirrored visually,
      // but landmarks are not — interpret using handedness info downstream.
      return { hand, shape: dx < 0 ? 'pointLeft' : 'pointRight', wrist };
    }
  }

  return { hand, shape: 'unknown', wrist };
}

function sub(a: Landmark, b: Landmark): Landmark {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function crossZ(a: Landmark, b: Landmark): number {
  return a.x * b.y - a.y * b.x;
}

export class GestureClassifier {
  classify(result: HandLandmarkerResult, ts: number): GestureFrame {
    const hands: HandShape[] = [];
    if (result.landmarks && result.landmarks.length > 0) {
      for (let i = 0; i < result.landmarks.length; i++) {
        const lm = result.landmarks[i] as Landmark[];
        const h = result.handedness?.[i]?.[0]?.categoryName as Handedness | undefined;
        if (!h) continue;
        hands.push(classify(lm, h));
      }
    }

    // Check if both hands are making fists
    const leftHand = hands.find((h) => h.hand === 'Left');
    const rightHand = hands.find((h) => h.hand === 'Right');
    const bothFists = leftHand?.shape === 'fist' && rightHand?.shape === 'fist';

    return { hands, ts, bothFists };
  }
}
