# Rubik 3D · Computer Vision Edition

A minimalist 3D Rubik's cube that runs in the browser. Control it with the
mouse or use your webcam to rotate the cube with hand tracking.

> Vite · TypeScript · Three.js · MediaPipe · cubejs

---

## Quick start

```bash
npm install        # installs deps + copies MediaPipe wasm + downloads the hand model
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # type-check + bundle to dist/
npm run preview    # preview the built bundle
```

The webcam requires HTTPS or `localhost`. GitHub Pages works because it
serves over HTTPS.

---

## Play modes

### Mouse
Drag to orbit, wheel/pinch to zoom. Keyboard shortcuts trigger every move:
lowercase = standard turn, uppercase = prime.

| Key | Move | Key | Move |
|---|---|---|---|
| `r` / `R` | R / R' | `u` / `U` | U / U' |
| `f` / `F` | F / F' | `d` / `D` | D / D' |
| `l` / `L` | L / L' | `b` / `B` | B / B' |

### AR Mode
Uses MediaPipe HandLandmarker to track your hand via webcam.

**Cube rotation (right hand):**

| Hand position | Cube rotation |
|---|---|
| Hand to the left | Cube rotates left |
| Hand to the right | Cube rotates right |
| Hand up | Cube tilts up |
| Hand down | Cube tilts down |
| Hand at center | Cube faces forward |
| Open palm | Return to front view |

The rotation is smooth and position-based (not velocity-based), making it
easy to control.

**Layer manipulation (pinch gesture):**

A 3×3 grid overlay appears on the camera feed. Pinch (thumb + index finger)
on any cell and drag:
- **Horizontal drag** → rotates that row (U, D layers)
- **Vertical drag** → rotates that column (L, R layers)

The grid provides clear visual feedback, highlighting the selected row or
column as you drag.

---

## Stack

| Layer | Package |
|---|---|
| Build | Vite 5, TypeScript 5 (strict) |
| 3D | `three` + `TrackballControls` + `RoundedBoxGeometry` |
| CV | `@mediapipe/tasks-vision` (HandLandmarker, GPU) |
| Solver | `cubejs` (Kociemba two-phase, in a Web Worker) |
| Fonts | Inter · JetBrains Mono |

---

## Project layout

```
src/
├─ app/            App shell + typed event bus
├─ cube/           CubeModel (cubejs wrapper) · CubeView · MoveEngine
│                  · Notation · Scrambler · FaceletMap
├─ render/         Renderer · Scene · OrbitCam
├─ solver/         Solver proxy + solver.worker.ts (Kociemba)
├─ cv/
│  ├─ Webcam.ts        getUserMedia + permissions
│  ├─ HandTracker.ts   MediaPipe wrapper
│  ├─ HandOverlay.ts   Visual hand skeleton overlay
│  └─ gestures/        GestureClassifier · HandRotation
├─ hud/            Hud · Timer · MoveCounter · hud.css
├─ util/           color · math · assert
└─ types.ts
```

<details>
<summary>How the visual cube stays in sync with the logical state</summary>

The single source of truth is `CubeModel`, which wraps `cubejs`. Every
turn:

1. `MoveEngine.queueMove(move)` reparents the layer's nine cubies under
   a transient pivot group.
2. `pivot.quaternion` is animated with quart easing (~240 ms; 320 ms for
   half turns) using slerp.
3. When the animation ends, the cubie transforms are baked, positions
   snap to the integer lattice, and `model.applyMove(move)` advances the
   logical state. The model never changes mid-animation.
</details>

---

## Conventions

- Facelets follow cubejs' URFDLB order (54 chars, letters `U R F D L B`).
- Standard colour scheme: U white · R red · F green · D yellow · L orange · B blue.
- `R`, `R'`, `R2` denote 90° / -90° / 180° turns (same for U F D L B).

---

## Deploy

`vite.config.ts` ships with `base: './'`, so the bundle is portable.

```bash
npm run build
# Push the contents of dist/ to the gh-pages branch.
```

The browser needs HTTPS for `getUserMedia`.

---

## Gotchas

- If MediaPipe fails to load, check that `public/wasm/` exists and that
  `public/models/hand_landmarker.task` was downloaded. Errors here surface
  as a generic *"Failed to fetch"*.
- Camera permission errors distinguish `NotAllowedError` and
  `NotFoundError` with explicit toasts.
- The video preview is mirrored via CSS (`scaleX(-1)`); landmarks fed to
  MediaPipe are **not** mirrored, since `handedness` already assumes the
  natural orientation.
- Half turns (`R2`) returned by the solver are expanded to two quarter
  turns before queueing, so the animation engine doesn't need a 180°
  path of its own.
- HandLandmarker runs at ~30 Hz (every other frame) to keep the render
  loop at 60 fps even on mid-range hardware.

---

## License

MIT — see `LICENSE`.
