/** Mode colors used across the AR interface */
export type ModeColor = 'white' | 'blue' | 'green' | 'purple';

export const MODE_COLORS: Record<ModeColor, string> = {
  white: '#ffffff',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
};

/** Gesture detection thresholds */
export const GESTURE_CONFIG = {
  PINCH_THRESHOLD: 0.18,
  SOLVER_CHARGE_TIME_MS: 1500,
  DETECTION_THROTTLE_MS: 33,
} as const;

