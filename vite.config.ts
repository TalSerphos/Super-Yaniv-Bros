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
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
  },
});
