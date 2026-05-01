import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { bus } from '../app/events';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastTimestamp = 0;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
            delegate: 'GPU',
          },
          numHands: 2,
          runningMode: 'VIDEO',
        });
      } catch (err) {
        bus.emit('cv:error', { message: `MediaPipe init: ${(err as Error).message}` });
        throw err;
      }
    })();
    return this.initPromise;
  }

  isReady(): boolean {
    return this.landmarker !== null;
  }

  detect(video: HTMLVideoElement, now: number): HandLandmarkerResult | null {
    if (!this.landmarker) return null;
    if (video.readyState < 2) return null;
    const ts = Math.max(this.lastTimestamp + 1, Math.floor(now));
    this.lastTimestamp = ts;
    try {
      return this.landmarker.detectForVideo(video, ts);
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
