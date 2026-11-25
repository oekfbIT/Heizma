import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Im Dev-Modus werden /api-Calls an den API-Service weitergeleitet
export default defineConfig({
  plugins: [react()],
  envDir: '..', // gemeinsame .env im Projekt-Root
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:4000',
    },
  },
});
