import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Each teammate runs on its own ports: VITE_PORT=5201 API_PORT=3201 npm run dev
const API = `http://localhost:${process.env.API_PORT ?? process.env.PORT ?? 3000}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    host: true, // reachable from phones on the LAN during dev
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/socket.io': { target: API, ws: true },
      '/api': API,
      '/photos': API,
    },
  },
});
