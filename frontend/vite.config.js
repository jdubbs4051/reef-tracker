import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server is LAN-reachable (host: true) to match the spec's "open it on your phone" goal.
// /api is proxied to the FastAPI backend so dev and prod use the same relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
