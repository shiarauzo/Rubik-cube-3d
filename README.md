# Rubik 3D · Computer Vision

Cubo Rubik 3D jugable en el navegador con tres modos de control: ratón, gestos
de manos por webcam, y escaneo de un cubo físico real. Incluye solver de
Kociemba (algoritmo two-phase) que calcula la solución y la anima.

## Características

- **Cubo 3D** con [Three.js](https://threejs.org/): 27 cubies, animaciones de
  giro suaves (slerp con ease-in-out), cámara orbital con pinch-zoom.
- **Modo Gestos** (`MediaPipe HandLandmarker`): vocabulario a dos manos.
  - Izquierda elige cara: índice ↑ `U`, → `R`, ↓ `D`, ← `L`; palma hacia ti `F`,
    palma hacia fuera `B`.
  - Derecha confirma: 👍 / swipe der → `CW`; 👎 / swipe izq → `CCW`.
  - Debounce de 5 frames + cooldown de 350 ms para evitar falsos positivos.
- **Modo Escaneo**: overlay 3x3 sobre la webcam; el usuario muestra las 6 caras
  en orden `U R F D L B`. Para cada celda se toman 5 parches y se hace mediana
  para descartar reflejos. Un clasificador HSV anclado a los centros se adapta
  a la luz de la sesión.
- **Solver Kociemba** (`cubejs`) en un Web Worker para no bloquear la UI durante
  el build de las tablas (~1–4 s).
- **HUD**: temporizador, contador de movimientos, mezclar, reset, resolver,
  toggle de modo y de cámara.

## Stack

| Capa | Paquete |
|---|---|
| Build | Vite 5, TypeScript 5 (strict) |
| 3D | `three`, `OrbitControls` |
| CV | `@mediapipe/tasks-vision` (delegado GPU) |
| Solver | `cubejs` |

## Requisitos

- Node.js ≥ 20
- npm ≥ 10
- Navegador moderno con WebGL2 y WebAssembly (Chrome / Edge / Firefox / Safari).
- Webcam para los modos `Gestos` y `Escanear`.
- `getUserMedia` requiere `https://` o `http://localhost`. En GitHub Pages
  funciona porque sirve por HTTPS.

## Instalación y uso

```bash
npm install        # instala dependencias y dispara el script de assets
npm run dev        # abre http://localhost:5173
```

El script `scripts/copy-mediapipe-assets.mjs` (ejecutado por `predev` y
`prebuild`):

1. Copia los `.wasm`/`.js` de `@mediapipe/tasks-vision` a `public/wasm/`.
2. Descarga `hand_landmarker.task` (~8 MB) a `public/models/` desde el storage
   oficial de MediaPipe la primera vez.

Si no tienes red al instalar, coloca manualmente el modelo en
`public/models/hand_landmarker.task`.

### Comandos

```bash
npm run dev        # dev server con HMR
npm run build      # type-check + build de producción a dist/
npm run preview    # sirve dist/ localmente
```

## Controles

### Ratón
- Arrastrar = orbitar la cámara.
- Rueda / pinch = zoom.
- Atajos de teclado: `r`/`R` = `R`/`R'`, `u`/`U` = `U`/`U'`, etc.
  (minúscula = sentido normal, mayúscula = primo).

### Modo Gestos
Activa la cámara desde la barra y selecciona "Gestos". Coloca las dos manos
frente a la cámara. La selección de cara se confirma cuando mantienes el
gesto durante ~5 frames; el HUD lo notifica con un toast.

### Modo Escaneo
Activa "Escanear". Sigue las indicaciones del panel inferior: muestra cada
cara dentro del recuadro 3x3 y pulsa **Espacio** o el botón **Capturar**. Al
completar las 6 caras la app reconstruye el estado, vuelve a modo ratón y
puedes pulsar **Resolver** para que anime la solución.

> **Tip**: usa luz frontal uniforme. Si los conteos de color salen mal, la app
> reinicia el escaneo y muestra qué color falló.

## Arquitectura

```
src/
├─ app/            App raíz, EventBus tipado
├─ cube/           CubeModel (wrap de cubejs), CubeView (27 cubies),
│                  MoveEngine (animaciones), Notation, Scrambler
├─ render/         Renderer, Scene, OrbitCam
├─ solver/         Solver (proxy) + solver.worker.ts (Kociemba)
├─ cv/
│  ├─ Webcam.ts    getUserMedia + permisos
│  ├─ HandTracker.ts
│  ├─ gestures/    Classifier (landmarks → forma) + Mapper (state machine)
│  └─ scan/        GridOverlay, ColorSampler, ColorClassifier, ScanController
├─ hud/            Hud, Timer, MoveCounter, hud.css
├─ util/           color, math, assert
└─ types.ts
```

### Sincronización modelo ↔ vista

El estado lógico vive en `CubeModel` (sobre `cubejs`). Cada giro:

1. `MoveEngine.queueMove(move)` reparenta los 9 cubies del layer bajo un
   pivot transitorio.
2. Anima `pivot.quaternion` con slerp + ease (~220 ms; 308 ms para `2`).
3. Al terminar, hornea la transformación en cada cubie, snapea a la rejilla
   entera y llama `model.applyMove(move)`. El modelo nunca cambia a mitad de
   animación.

Tras un escaneo, `model.setFromStickers(...)` reemplaza el estado lógico y
`view.repaintFromFacelets(...)` re-skinea cada cubie en su posición home,
descartando rotaciones previas.

### Convenciones

- Facelets en orden URFDLB de cubejs (54 caracteres con letras `U R F D L B`).
- Esquema cromático estándar: U=blanco, R=rojo, F=verde, D=amarillo, L=naranja,
  B=azul.
- `R`, `R'`, `R2` para giros de 90°/-90°/180° (idem U F D L B).

## Despliegue (GitHub Pages)

`vite.config.ts` usa `base: './'` para rutas relativas. Para publicar:

```bash
npm run build
# Sube el contenido de dist/ a la rama gh-pages.
```

El navegador necesita HTTPS para acceder a la webcam.

## Gotchas

- Si MediaPipe falla al cargar, revisa que `public/wasm/` y
  `public/models/hand_landmarker.task` existen. El error es críptico
  ("Failed to fetch").
- Permiso de cámara: la app distingue `NotAllowedError` y `NotFoundError` con
  mensajes claros en el toast.
- El video se muestra espejado vía CSS (`scaleX(-1)`) pero los landmarks NO se
  espejan al alimentarlos a MediaPipe — `handedness` ya viene correcta para la
  entrada natural.
- Half-turns del solver (`R2`) se expanden a `[R, R]` antes de animar, así el
  motor no necesita una ruta de 180° dedicada.
- La detección de manos se limita a ~30 Hz (1 de cada 2 frames) para mantener
  60 fps de render.

## Licencia

MIT — ver `LICENSE`.
