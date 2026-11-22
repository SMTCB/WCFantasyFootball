// Component tests (CODE-4): Vitest + React Testing Library in jsdom.
// Separate from tests/unit (node --test against a Postgres) and e2e/ (Playwright).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/components/**/*.test.{js,jsx}'],
    setupFiles: ['tests/components/setup.js'],
    restoreMocks: true,
  },
});
