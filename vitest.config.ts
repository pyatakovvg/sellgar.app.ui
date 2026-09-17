import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react({ tsDecorators: true })],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['core/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['./contracts/test-environment/core.setup.ts'],
        },
      },
      ...(['react', 'native'] as const).map((name) => ({
        extends: true as const,
        test: {
          name,
          include:
            name === 'react'
              ? ['react/**/*.test.{ts,tsx}', 'shared/**/*.test.{ts,tsx}']
              : ['native/**/*.test.{ts,tsx}'],
          environment: 'jsdom' as const,
          setupFiles: ['./contracts/test-environment/react.setup.ts'],
        },
      })),
    ],
  },
});
