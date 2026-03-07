import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  deps: {
    alwaysBundle: [
      '@remote-pilot/shared',
      'fastify',
      '@fastify/static',
      '@fastify/websocket',
      'ws',
      'portfinder',
    ],
  },
});
