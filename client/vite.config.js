import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(rootPkg.version ?? '0.0.0'),
  },
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
