import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/ws': {
        target: 'http://localhost:3847',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
