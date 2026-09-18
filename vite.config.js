import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true, // Allow all hosts including pseudo-poly.onrender.com
  },
  preview: {
    host: true,
    allowedHosts: true, // Allow all hosts for preview/production
  },
})
