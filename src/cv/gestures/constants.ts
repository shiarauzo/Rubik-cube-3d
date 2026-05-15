/**
 * Gesture system constants
 *
 * Centralized configuration for gesture recognition and manipulation thresholds.
 */

// ============================================================================
// GridManipulation constants
// ============================================================================

/** Minimum drag distance to initiate a drag gesture (in normalized coordinates 0-1) */
export const DRAG_THRESHOLD = 0.04;

/** Grid padding on each side as a ratio of the screen (8% = 0.08) */
export const GRID_PADDING = 0.08;

/** Number of grid rows/columns */
export const GRID_SIZE = 3;

/** Pinch point calculation - landmark indices */
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;

// ============================================================================
// HandRotation constants
// ============================================================================

/** Minimum smoothing factor for hand rotation (fast when far from target) */
export const SMOOTHING_MIN = 0.08;

/** Maximum smoothing factor for hand rotation (slow when near target) */
export const SMOOTHING_MAX = 0.25;

/** Swipe detection threshold (in normalized coordinates 0-1) */
export const SWIPE_THRESHOLD = 0.12;

/** Maximum time window for swipe gesture detection (milliseconds) */
export const SWIPE_TIME_MS = 300;

/** Maximum zoom distance */
export const MAX_ZOOM = 12;

/** Default camera zoom distance */
export const DEFAULT_ZOOM = 5.4;

/** Zoom speed adjustment factor */
export const ZOOM_SPEED = 0.1;

/** Zoom-out speed when fist gesture is detected */
export const ZOOM_OUT_SPEED = 0.15;

/** Maximum horizontal rotation offset (in radians, ±108 degrees) */
export const MAX_ROTATION_Y = Math.PI * 0.6;

/** Maximum vertical rotation offset (in radians, ±45 degrees) */
export const MAX_ROTATION_X = Math.PI * 0.25;

/** Horizontal swipe adds 90 degrees of rotation */
export const SWIPE_ROTATION_Y = Math.PI / 2;

/** Vertical swipe adds 45 degrees of rotation */
export const SWIPE_ROTATION_X = Math.PI / 4;

/** Duration for snap-to-90 animation (milliseconds) */
export const SNAP_ANIMATION_DURATION = 200;

// ============================================================================
// TwoHandController constants
// ============================================================================

/** Time to hold both fists to trigger the solver (milliseconds) */
export const SOLVER_CHARGE_TIME = 1500;

// ============================================================================
// GestureClassifier constants
// ============================================================================

/** Pinch detection threshold (ratio of pinch distance to hand size) */
export const PINCH_THRESHOLD = 0.18;

/** Finger extension check - PIP must be at least 95% of MCP distance from wrist */
export const FINGER_EXTENSION_RATIO = 0.95;

/** Minimum Y offset for thumb-up gesture (normalized coordinates) */
export const THUMB_UP_THRESHOLD = 0.08;

/** Minimum Y offset for thumb-down gesture (normalized coordinates) */
export const THUMB_DOWN_THRESHOLD = 0.08;

/** MediaPipe landmark indices */
export const LANDMARK_WRIST = 0;
export const LANDMARK_THUMB_TIP = 4;
export const LANDMARK_THUMB_PIP = 3;
export const LANDMARK_THUMB_MCP = 2;
export const LANDMARK_INDEX_TIP = 8;
export const LANDMARK_INDEX_PIP = 6;
export const LANDMARK_INDEX_MCP = 5;
export const LANDMARK_MIDDLE_TIP = 12;
export const LANDMARK_MIDDLE_PIP = 10;
export const LANDMARK_MIDDLE_MCP = 9;
export const LANDMARK_RING_TIP = 16;
export const LANDMARK_RING_PIP = 14;
export const LANDMARK_RING_MCP = 13;
export const LANDMARK_PINKY_TIP = 20;
export const LANDMARK_PINKY_PIP = 18;
export const LANDMARK_PINKY_MCP = 17;

// ============================================================================
// DirectManipulation constants
// ============================================================================

/** Minimum drag distance to start direct manipulation (in NDC coordinates) */
export const DIRECT_DRAG_THRESHOLD = 0.03;

/** Rotation sensitivity multiplier for direct manipulation */
export const ROTATION_SENSITIVITY = 3.5;

/** Minimum dot product for face normal matching */
export const FACE_NORMAL_THRESHOLD = 0.8;

/** Minimum dot product for axis matching */
export const AXIS_MATCH_THRESHOLD = 0.5;

/** Snap animation duration for direct manipulation (milliseconds) */
export const DIRECT_SNAP_DURATION = 150;

/** Rotation threshold for single turn (radians, 45 degrees) */
export const SINGLE_TURN_THRESHOLD = Math.PI / 4;

/** Rotation threshold for double turn (radians, 135 degrees) */
export const DOUBLE_TURN_THRESHOLD = (3 * Math.PI) / 4;
