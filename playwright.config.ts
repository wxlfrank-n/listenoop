import {defineConfig, devices} from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * End-to-end tests.
 *
 * These drive the real app in a real browser, which is the only place the
 * Web Audio pipeline is genuinely exercised: fetching and decoding the default
 * MP3, analysing it into clips, then rendering them to canvas.
 *
 * Unit and component tests (vitest run) cover the logic; these cover the wiring.
 */
export default defineConfig({
  testDir: './e2e',

  /*
   * Deliberately not Playwright's default (*.spec.ts / *.test.ts): vitest runs
   * from the repo root and would try to collect those as unit tests, which would
   * fail since they import from @playwright/test. The .e2e.ts suffix keeps the
   * two runners from fighting over the same files.
   */
  testMatch: '**/*.e2e.ts',

  /*
   * The waveform has to fetch and decode the whole default track before any
   * clip exists, which is far slower than a component render.
   */
  timeout: 60_000,
  expect: {timeout: 15_000},

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],

        /*
         * Clip playback must be able to start without a real user gesture,
         * which is otherwise blocked by Chromium's autoplay policy.
         */
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],

  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
