import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { localMedia } from './tooling/local-media.ts';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), localMedia()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
