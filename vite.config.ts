import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base is set for GitHub Pages project-site hosting:
// https://elagym.github.io/rogueliketanks/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
