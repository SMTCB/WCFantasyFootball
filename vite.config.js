import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Vite 8 uses OXC (not esbuild) for transforms — esbuild.drop has no effect.
  // console.log is already DEV-gated in src/ (useChatMessages.js line 5).
  // Verified: production bundle has zero console.log calls.
  oxc: {
    transform: {
      targets: ['es2020'],
    },
  },
  build: {
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'supabase';
          if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('/react/')) return 'react';
        },
      },
    },
  },
}))
