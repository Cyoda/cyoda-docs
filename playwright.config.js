import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4321',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: 'retain-on-failure',

    /* Simulate real user behavior for cookie consent */
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    /* Enable JavaScript */
    javaScriptEnabled: true,

    /* Set viewport to common desktop size */
    viewport: { width: 1280, height: 720 },

    /* Accept downloads */
    acceptDownloads: true,

    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: process.env.CI ? [
    // In CI, only test with Chromium for speed and reliability
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ] : [
    // In local development, test all browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? {
    // In CI, serve the built site for faster, more reliable tests
    command: 'pnpm exec serve dist -l 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: false,
    timeout: 60 * 1000, // 1 minute
  } : {
    // In local development, use dev server for hot reload
    command: 'pnpm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120 * 1000, // 2 minutes
    env: {
      ...process.env,
      // Use real GA ID to trigger cookie consent - comment out to use test ID
      // GA_MEASUREMENT_ID: 'G-TEST123456'
    }
  },
});
