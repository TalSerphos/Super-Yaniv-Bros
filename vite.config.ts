import { defineConfig } from 'vitest/config';

// Stamped into <meta name="build"> so the deploy smoke test can wait for this exact build.
process.env.VITE_COMMIT ??= 'dev';

export default defineConfig({
  // Relative URLs: the same build works at the custom domain root and at
  // https://talserphos.github.io/Super-Yaniv-Bros/ (GitHub project page subpath).
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1400, // the lazy Phaser chunk; real limits live in tools/check-budget.mjs
    rollupOptions: {
      output: {
        // Lazy code (Phaser + levels) and world art live in their own folders so the size budget can tell
        // what the title screen loads from what only the game loads.
        chunkFileNames: 'assets/game/[name]-[hash].js',
        assetFileNames: (info) => {
          const src = info.originalFileNames?.[0] ?? '';
          const world = src.match(/src\/assets\/(w\d+)\//)?.[1];
          if (world) return `assets/packs/${world}/[name]-[hash][extname]`;
          if (/\.css$/.test(info.names?.[0] ?? '') && !/index/.test(info.names?.[0] ?? '')) return 'assets/game/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
  },
});
