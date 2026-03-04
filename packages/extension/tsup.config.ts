import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  external: ['vscode'],
  noExternal: ['@remote-pilot/shared', 'ws', 'sql.js'],
});
