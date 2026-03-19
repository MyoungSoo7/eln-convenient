import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/protocols': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/templates': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/notes': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/tags': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/inventory': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
});
