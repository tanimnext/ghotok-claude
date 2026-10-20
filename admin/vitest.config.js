import { defineConfig } from 'vitest/config';

// Unit tests for the admin panel's pure logic (dictionaries).
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.js'] },
});
