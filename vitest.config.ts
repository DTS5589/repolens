import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: [
      'lib/**/*.test.ts',
      'app/**/*.test.ts',
      'components/**/*.test.{ts,tsx}',
      'hooks/**/*.test.ts',
      'providers/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'lib/**/*.ts',
        'app/api/**/*.ts',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.ts',
        'providers/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.ts',
        'components/ui/**',
        'lib/utils.ts',
      ],
      thresholds: {
        statements: 35,
        branches: 20,
        functions: 20,
        lines: 35,
      },
    },
  },
});
