import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      // server.py serves the built site from the "static" folder next to it
      outDir: '../static',
      emptyOutDir: true,
    },
    server: {
      // "npm run dev" still needs server.py running for movies, orders and login
      proxy: {'/api': 'http://localhost:8000'},
    },
  };
});
