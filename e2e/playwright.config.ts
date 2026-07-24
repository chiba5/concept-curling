import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3789', contextOptions: { reducedMotion: 'reduce' } },
  webServer: {
    command: 'node ../packages/server/dist/index.js',
    port: 3789,
    reuseExistingServer: false,
    env: { PORT: '3789', SCORING_PROVIDER: 'demo', CPU_DELAY_MS: '0' },
  },
});
