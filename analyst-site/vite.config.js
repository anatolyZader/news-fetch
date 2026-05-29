import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const rootPkg = JSON.parse(readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(rootPkg.version ?? '0.0.0'),
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled'],
    alias: {
      '@client': path.resolve(repoRoot, 'client/src'),
      '@israel-districts': path.resolve(repoRoot, 'cross-cut-modules/geo/israelDistricts.js'),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/articles': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
