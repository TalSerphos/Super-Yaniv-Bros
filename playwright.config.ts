import { defineConfig, devices } from '@playwright/test';

// Local cloud sessions ship a pinned Chromium; CI installs browsers itself.
const localChromium = process.env.CI ? undefined : '/opt/pw-browsers/chromium';
const chromiumOpts = localChromium ? { launchOptions: { executablePath: localChromium } } : {};
const allBrowsers = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], ...chromiumOpts } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], ...chromiumOpts } },
    ...(allBrowsers
      ? [
          { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'iphone-14', use: { ...devices['iPhone 14'] } },
          { name: 'ipad', use: { ...devices['iPad (gen 7) landscape'] } },
        ]
      : []),
  ],
});
