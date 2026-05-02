import type { Landmark } from './gestures/types';

// MediaPipe hand connections for drawing skeleton
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [0, 9], [9, 10], [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17],            // palm
];

export class HandOverlay {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  draw(handsLandmarks: Landmark[][], isPinching: boolean[] = []): void {
    const video = this.canvas.parentElement?.querySelector('video');
    if (video) {
      this.canvas.width = video.videoWidth || this.canvas.clientWidth;
      this.canvas.height = video.videoHeight || this.canvas.clientHeight;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let h = 0; h < handsLandmarks.length; h++) {
      const landmarks = handsLandmarks[h];
      const pinching = isPinching[h] ?? false;
      this.drawHand(landmarks, pinching);
    }
  }

  private drawHand(landmarks: Landmark[], pinching: boolean): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Draw connections
    this.ctx.strokeStyle = pinching ? '#22c55e' : '#3b82f6';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';

    for (const [i, j] of HAND_CONNECTIONS) {
      const a = landmarks[i];
      const b = landmarks[j];
      // Video is mirrored, so flip x
      const ax = (1 - a.x) * w;
      const ay = a.y * h;
      const bx = (1 - b.x) * w;
      const by = b.y * h;

      this.ctx.beginPath();
      this.ctx.moveTo(ax, ay);
      this.ctx.lineTo(bx, by);
      this.ctx.stroke();
    }

    // Draw landmarks
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const x = (1 - lm.x) * w;
      const y = lm.y * h;

      // Highlight thumb tip (4) and index tip (8) when pinching
      const isFingerTip = i === 4 || i === 8;

      this.ctx.beginPath();
      this.ctx.arc(x, y, isFingerTip ? 8 : 4, 0, Math.PI * 2);

      if (pinching && isFingerTip) {
        this.ctx.fillStyle = '#22c55e';
      } else if (isFingerTip) {
        this.ctx.fillStyle = '#ef4444';
      } else {
        this.ctx.fillStyle = '#fff';
      }
      this.ctx.fill();

      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }

    // Draw pinch indicator
    if (pinching) {
      const thumb = landmarks[4];
      const index = landmarks[8];
      const cx = (1 - (thumb.x + index.x) / 2) * w;
      const cy = ((thumb.y + index.y) / 2) * h;

      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
