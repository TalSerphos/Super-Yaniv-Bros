import { defineConfig } from 'vitest/config';

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
