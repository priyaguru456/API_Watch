/**
 * Vite Configuration for APIWatch Frontend
 * Integrates React plugin and Tailwind CSS v4 Vite plugin
 */
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    open: false,
  },
})
