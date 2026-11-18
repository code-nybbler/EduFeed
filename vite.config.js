import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the built site work from any sub-path, which is what
// GitHub Pages project sites (user.github.io/repo-name/) need.
export default defineConfig({
  base: './',
  plugins: [react()],
});
