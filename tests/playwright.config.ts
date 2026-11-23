// End-to-end test config. Run: npx playwright test -c tests
// Starts its own API server (:3120) and Vite (:5120), so it never touches the
// ports other people use. Game data goes to a throwaway temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const E2E = {
  apiPort: 3120,
  vitePort: 5120,
  pin: '424242',
  room: 'PWQA',
  dataDir: process.env.E2E_DATA_DIR ?? mkdtempSync(path.join(tmpdir(), 'party-e2e-')),
};
process.env.E2E_DATA_DIR = E2E.dataDir; // so the spec (a separate worker process) sees the same folder

const root = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: 'test-results', // tests/test-results (screenshots, traces, bot logs)
  timeout: 180_000,
  workers: 1, // one shared game room
  reporter: [['list']],
  use: { baseURL: `http://localhost:${E2E.vitePort}`, trace: 'retain-on-failure' },
  projects: [
    // Host on an iPhone (the host's device) is the priority, so WebKit gets its own run.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-iphone-host', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      cwd: root,
      port: E2E.apiPort,
      reuseExistingServer: false,
      env: {
        PORT: String(E2E.apiPort),
        HOST_PIN: E2E.pin,
        ROOM_CODE: E2E.room,
        DATA_DIR: E2E.dataDir,
        RESET_STATE: '1',
      },
    },
    {
      command: 'npx vite',
      cwd: root,
      port: E2E.vitePort,
      reuseExistingServer: false,
      env: { VITE_PORT: String(E2E.vitePort), API_PORT: String(E2E.apiPort) },
    },
  ],
});
