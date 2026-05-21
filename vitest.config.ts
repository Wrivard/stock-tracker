import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // We mock the `electron` module for any code that imports it.
    setupFiles: ['./tests/setup.ts'],
  },
})
