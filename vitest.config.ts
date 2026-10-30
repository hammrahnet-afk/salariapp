import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: false,
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'logic',
          environment: 'node',
          include: ['tests/core.test.ts', 'tests/data.test.ts', 'tests/dbg2.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui.test.tsx', 'tests/flow.test.tsx', 'tests/forms.test.tsx'],
          testTimeout: 30000,
        },
      },
    ],
  },
});
