import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on 127.0.0.1 and ::1 so http://localhost:5173 works in every browser
    proxy: { '/api': 'http://localhost:8000' },
  },
})
