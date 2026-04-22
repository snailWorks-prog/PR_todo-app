import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // REST API
      '/api': {
        target: 'http://backend:3001',
        changeOrigin: true,
      },
      // WebSocket — must use ws: true
      '/ws': {
        target: 'ws://backend:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
