# Rubik 3D · Computer Vision Edition

A minimalist 3D Rubik's cube that runs in the browser. Solve it with the
mouse, with hand gestures captured by your webcam, or scan a real cube and
let the built-in Kociemba solver do the rest.

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

### Hand gestures
Two-handed vocabulary built on top of MediaPipe HandLandmarker (GPU
delegate). The left hand selects a face, the right hand commits the
direction.

| Left hand | Face |
|---|---|
| Index pointing up | **U** |
| Index pointing right | **R** |
| Index pointing down | **D** |
| Index pointing left | **L** |
| Open palm towards you | **F** |
| Open palm away | **B** |

| Right hand | Direction |
|---|---|
| Thumb up · swipe right | CW (R, U, F…) |
| Thumb down · swipe left | CCW (R', U', F'…) |
| Closed fist (left hand) | Cancel selection |

A gesture must hold for ~5 frames before it registers, with a 350 ms
cooldown after each commit to avoid runaway turns.

### Scan a real cube
Show each of the six faces inside the 3×3 overlay in the order
**U → R → F → D → L → B**. Press <kbd>Space</kbd> or the capture button.
For each cell the sampler takes five small patches and uses the median to
discard glare. The classifier identifies the six centres in HSV space and
labels every other sticker by adapted distance to those references.

When the scan completes the virtual cube redraws and the **Solve** button
animates the Kociemba solution.

> Scanning works best with even, frontal lighting. If the colour counts
> don't add up the app restarts the scan and tells you which face failed.

---

## Stack

| Layer | Package |
|---|---|
| Build | Vite 5, TypeScript 5 (strict) |
| 3D | `three` + `OrbitControls` + `RoundedBoxGeometry` |
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
│  ├─ gestures/        Classifier + state-machine Mapper
│  └─ scan/            GridOverlay · ColorSampler · ColorClassifier · ScanController
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

After a scan, `model.setFromStickers(...)` replaces the logical state
and `view.repaintFromFacelets(...)` re-skins each cubie at its home
position, discarding any prior rotations.
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

## Roadmap

- Optional dark theme.
- WebGPU renderer when stable.
- One-handed gesture mode for mobile.
- Local persistence of times and scrambles.

---

## License

MIT — see `LICENSE`.
