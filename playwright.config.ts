import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const captureScreens = Boolean(process.env.SCREENSHOTS);

/**
 * End-to-end and accessibility tests against the production build, served with the same
 * routing rules as static hosting (scripts/serve-build.mjs). Uses the locally installed
 * Google Chrome, so no browser download is needed.
 *
 *   npm run build && npm run test:e2e
 *   SCREENSHOTS=1 npx playwright test visual-review   # full-page screenshots for design review
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: captureScreens ? [] : ['**/visual-review.spec.ts', '**/studio-visual.spec.ts'],
  fullyParallel: true,
  // Three workers locally (Phase 4 M4): with four, a different heavy Studio test timed out in each
  // of three full runs (each takes about 9 s alone); with three the whole suite passes in the same
  // time. CI keeps Playwright's default.
  workers: process.env.CI ? undefined : 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    // Studio layouts only: a touch tablet in portrait (rail + floating panels).
    { name: 'tablet', testMatch: /studio(-[a-z]+)?\.spec\.ts/, use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 820, height: 1180 }, hasTouch: true } },
  ],
  webServer: {
    command: `node scripts/serve-build.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
