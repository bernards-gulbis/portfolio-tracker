import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const pkg = id.split('node_modules/').pop()!.split('/')[0];
          if (['react', 'react-dom', 'react-is', 'scheduler'].includes(pkg)) {
            return 'vendor-react';
          }
          if (pkg === '@tanstack') return 'vendor-query';
          if (pkg === 'radix-ui' || pkg === '@radix-ui') return 'vendor-radix';
          if (['react-hook-form', '@hookform', 'zod', 'react-day-picker'].includes(pkg)) {
            return 'vendor-forms';
          }
          return 'vendor';
        },
      },
    },
  },
})
