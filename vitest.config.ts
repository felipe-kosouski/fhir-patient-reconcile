import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        // Type tests with exactOptionalPropertyTypes: true.
        test: {
          name: 'types-strict',
          typecheck: {
            enabled: true,
            only: true,
            include: ['test/types/**/*.test-d.ts'],
            tsconfig: './tsconfig.json',
          },
        },
      },
      {
        // Type tests with exactOptionalPropertyTypes: false. rules.test-d.ts is strict-only.
        test: {
          name: 'types-loose',
          typecheck: {
            enabled: true,
            only: true,
            include: ['test/types/compat.test-d.ts'],
            tsconfig: './tsconfig.loose.json',
          },
        },
      },
    ],
  },
});

export default config;
