import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api/auth': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
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
      '/api/signatures': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api/audit': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api/notifications': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/api/inventory': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
      '/api/search': {
        target: 'http://localhost:8006',
        changeOrigin: true,
      },
      '/api/files': {
        target: 'http://localhost:8008',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
