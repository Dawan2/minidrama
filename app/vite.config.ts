import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The bundle is served from the root of a TikTok-hosted ZIP, so every asset reference must be
  // relative. An absolute '/assets/...' path resolves against the platform host, not our package.
  base: './',
  plugins: [react()],
  build: {
    // ES2020 is the WebView baseline in `docs/architecture/tech-stack.md` T4. Raising it silently
    // is how a mid-range Android device gets a white screen.
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tools/**/*.test.ts'],
  },
});
