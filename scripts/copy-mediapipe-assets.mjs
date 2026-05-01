import { mkdir, copyFile, readdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { createWriteStream } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = resolve(root, 'public/wasm');
const modelsDir = resolve(root, 'public/models');
const handModelPath = join(modelsDir, 'hand_landmarker.task');
const handModelUrl =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else {
      await copyFile(srcPath, dstPath);
    }
  }
}

function download(url, dst) {
  return new Promise((resolveP, rejectP) => {
    const file = createWriteStream(dst);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          download(res.headers.location, dst).then(resolveP, rejectP);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          rejectP(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolveP()));
      })
      .on('error', rejectP);
  });
}

async function main() {
  if (await exists(wasmSrc)) {
    await copyDir(wasmSrc, wasmDst);
    console.log(`[mediapipe] copied wasm -> ${wasmDst}`);
  } else {
    console.warn(`[mediapipe] wasm not found at ${wasmSrc}; run "npm install" first.`);
  }

  await mkdir(modelsDir, { recursive: true });
  if (!(await exists(handModelPath))) {
    console.log('[mediapipe] downloading hand_landmarker.task ...');
    try {
      await download(handModelUrl, handModelPath);
      console.log(`[mediapipe] saved -> ${handModelPath}`);
    } catch (err) {
      console.warn(`[mediapipe] could not download model: ${err.message}`);
      console.warn('[mediapipe] you can drop the file manually at public/models/hand_landmarker.task');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
