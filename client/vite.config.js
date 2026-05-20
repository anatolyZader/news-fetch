import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@israel-districts': path.resolve(__dirname, '../cross-cut-modules/geo/israelDistricts.js'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/articles': 'http://localhost:3000',
    },
  },
});
