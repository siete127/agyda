import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8445',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:8445',
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: 'http://localhost:8445',
        changeOrigin: true,
        secure: false,
      },
      '/ventas-api': {
        target: 'https://ventas.ardabytec.vip:8443',
        changeOrigin: true,
        secure: false,
        rewrite: (path: string) => path.replace(/^\/ventas-api/, '/api'),
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('socket.io')) return 'socket'
            if (id.includes('@tanstack')) return 'query'
            if (id.includes('zustand')) return 'state'
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('react/')) return 'vendor'
          }
        },
      },
    },
  },
})
