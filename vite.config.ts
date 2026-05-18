import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // Put three.js in its own chunk for better caching
          // User code changes won't bust the three.js cache
          three: ['three'],
          // MediaPipe will be automatically split due to dynamic import
        },
      },
    },
  },
});
