// Regenerate the README screenshots from the built-in mock data (no players needed).
//   npm run build && npm run screenshots
// Starts a throwaway server on :3999, captures TV and phone screens, writes docs/screenshots/*.jpg.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/screenshots');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATA_DIR: mkdtempSync(path.join(tmpdir(), 'tt-shots-')), RESET_STATE: '1' },
  stdio: 'ignore',
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('server did not start');
}

async function dismissOverlay(page: Page) {
  const overlay = page.getByText(/start the party/i);
  if (await overlay.count()) await overlay.first().click({ trial: false }).catch(() => {});
}

const TV: [string, string, number][] = [
  ['tv-lobby', 'LOBBY', 2500],
  ['tv-reveal', 'PHOTO_REVEAL', 4000],
  ['tv-captioning', 'CAPTIONING', 2500],
  ['tv-voting', 'VOTING', 4000],
  ['tv-results', 'RESULTS', 30000],
  ['tv-final', 'FINAL', 14000],
];
const PHONE: [string, string, number][] = [
  ['phone-join', '/play', 1500],
  ['phone-caption', '/play?mock=CAPTIONING&mockme=p3', 1500],
  ['phone-vote', '/play?mock=VOTING&mockme=p3', 1500],
  ['phone-host', '/host?mock=CAPTIONING', 1500],
];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const [name, phase, wait] of TV) {
    await tv.goto(`${BASE}/tv?mock=${phase}`);
    await sleep(500);
    await dismissOverlay(tv);
    if (phase === 'LOBBY') {
      // The mock QR is a stand-in; swap in a real, scannable one for the example URL.
      const qr = await QRCode.toDataURL('https://party.example.com/play?room=GRFW', { margin: 1, width: 512 });
      await tv.evaluate((src) => document.querySelectorAll('img').forEach((i) => { if (/QR/i.test(i.alt)) i.src = src; }), qr);
    }
    await sleep(wait);
    await tv.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
    console.log('✓', name);
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const [name, url, wait] of PHONE) {
    await phone.goto(`${BASE}${url}`);
    await sleep(wait);
    await phone.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
    console.log('✓', name);
  }
  await browser.close();
} finally {
  server.kill();
}
