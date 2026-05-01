import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { GestureFrame, HandShape, Handedness, Landmark } from './types';

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCPS = [2, 5, 9, 13, 17];
const WRIST = 0;

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
  return tipDist > pipDist && pipDist > mcpDist * 0.95;
}

function classify(landmarks: Landmark[], hand: Handedness): HandShape {
  const ext = [0, 1, 2, 3, 4].map((f) => isFingerExtended(landmarks, f));
  const [thumbExt, indexExt, middleExt, ringExt, pinkyExt] = ext;
  const wrist = landmarks[WRIST];
  const indexTip = landmarks[8];
  const indexMcp = landmarks[5];

  const fingersExtCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

  // Fist: no fingers extended (thumb optional)
  if (fingersExtCount === 0) {
    return { hand, shape: 'fist', wrist };
  }

  // Open palm: 4+ fingers extended
  if (fingersExtCount >= 3 && thumbExt) {
    // Determine palm orientation: cross product of (indexMcp - wrist) and (pinky_mcp - wrist)
    const v1 = sub(landmarks[5], wrist);
    const v2 = sub(landmarks[17], wrist);
    const cross = crossZ(v1, v2);
    // For Right hand, palm-towards-camera means the palm faces +Z (out of screen).
    // Image coords: x grows right, y grows down. Cross sign indicates orientation.
    const palmIn = (hand === 'Right' ? cross > 0 : cross < 0);
    return { hand, shape: palmIn ? 'palmIn' : 'palmOut', wrist };
  }

  // Thumb up/down: thumb extended, others curled
  if (thumbExt && fingersExtCount === 0) {
    const thumbTip = landmarks[4];
    if (thumbTip.y < wrist.y - 0.08) return { hand, shape: 'thumbUp', wrist };
    if (thumbTip.y > wrist.y + 0.08) return { hand, shape: 'thumbDown', wrist };
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
    return { hands, ts };
  }
}
