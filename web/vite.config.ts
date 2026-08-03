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
        // 127.0.0.1, not localhost: uvicorn binds 127.0.0.1 by default (and
        // explicitly in playwright.config.ts), while Node resolves 'localhost'
        // verbatim — it can hand back ::1 first and the proxy then fails to
        // connect. The browser still talks to the dev server on localhost:3000,
        // which is what keeps the pt_auth cookie in scope.
        target: 'http://127.0.0.1:8000',
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

          if (['react-hook-form', '@hookform', 'zod', 'react-day-picker'].includes(pkg)) {
            return 'vendor-forms';
          }
          if (pkg === 'recharts' || pkg.startsWith('d3-') || pkg === 'victory-vendor') {
            return 'vendor-recharts';
          }
          if (pkg === 'react-router') {
            return 'vendor-router';
          }
          if (pkg === 'i18next' || pkg === 'react-i18next' || pkg === 'i18next-browser-languagedetector') {
            return 'vendor-i18n';
          }
          if (pkg === 'lucide-react') return 'vendor-icons';
          return 'vendor';
        },
      },
    },
  },
})
