// Full game, end to end: TV + host pages in a real browser, bots as players.
//   npx playwright test -c tests
// The host logs in through the real PIN screen and uploads photos through the
// real file picker (client-side resize + POST /api/photos); the bot script then
// drives host actions and plays as 8 players. Passes when the TV shows FINAL.
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { devices, expect, test, type Page } from '@playwright/test';
import { io } from 'socket.io-client';
import { E2E } from './playwright.config.ts';

const root = path.resolve(import.meta.dirname, '..');
const BOTS = 8;

/** A valid solid-color PNG, so the browser can decode and resize it. */
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const photoFiles = () => readdirSync(path.join(E2E.dataDir, 'photos')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

function trackErrors(page: Page, label: string, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
}

/** Puts the shared room back in the LOBBY (an earlier project's run leaves it on FINAL). */
function resetGame(): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = io(`http://localhost:${E2E.apiPort}`, { transports: ['websocket'] });
    const done = (err?: Error) => {
      s.disconnect();
      if (err) reject(err);
      else resolve();
    };
    s.on('connect', () =>
      s.emit('host:auth', { pin: E2E.pin }, (r: { ok: boolean }) => {
        if (!r.ok) return done(new Error('host auth failed'));
        s.emit('host:action', { type: 'reset' }, () => done());
      }),
    );
    s.on('connect_error', (e) => done(e));
  });
}

let bots: ChildProcess | null = null;
test.beforeEach(resetGame);
test.afterEach(() => {
  bots?.kill();
  bots = null;
});

test('a full game reaches FINAL on the TV', async ({ browser }, testInfo) => {
  const errors: string[] = [];
  const iphone = testInfo.project.name.includes('webkit');

  // ---- TV (1920x1080) ----
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  trackErrors(tv, 'tv', errors);
  await tv.goto('/tv');
  const overlay = tv.getByText('Click to start the party!');
  if (await overlay.isVisible({ timeout: 5000 }).catch(() => false)) await overlay.click();
  await expect(tv.locator('.screen.lobby')).toBeVisible({ timeout: 30_000 });
  await expect(tv.getByText(E2E.room).first()).toBeVisible({ timeout: 30_000 });

  // ---- Host on a phone (iPhone in the WebKit project) ----
  const { defaultBrowserType: _ignored, ...phone } = iphone ? devices['iPhone 13'] : devices['Pixel 7'];
  const hostCtx = await browser.newContext(phone);
  const host = await hostCtx.newPage();
  trackErrors(host, 'host', errors);
  await host.goto('/host');
  const pinInput = host.locator('input[inputmode="numeric"]').first();
  await pinInput.fill('000000');
  await host.locator('button[type="submit"]').click();
  await expect(host.locator('.ph-error')).toBeVisible();
  await pinInput.fill(E2E.pin);
  await host.locator('button[type="submit"]').click();
  await expect(host.locator('.ph-join')).toHaveCount(0, { timeout: 10_000 });

  // ---- Upload 2 photos through the host UI's file picker ----
  const before = photoFiles().length;
  const fileInput = host.locator('input[type="file"]');
  if ((await fileInput.count()) === 0) await host.getByText(/photos/i).first().click(); // open the photo section
  const files = [0, 1].map((i) => {
    const f = path.join(E2E.dataDir, `upload-${i}.png`);
    writeFileSync(f, solidPng(800, 600, i ? [90, 170, 240] : [240, 120, 90]));
    return f;
  });
  await fileInput.setInputFiles(files);
  await expect.poll(() => photoFiles().length, { timeout: 30_000 }).toBeGreaterThanOrEqual(before + 2);

  // ---- Bots play (and drive the host) ----
  let botLog = '';
  bots = spawn('npx', ['tsx', 'scripts/bots.ts', E2E.room, String(BOTS), `http://localhost:${E2E.apiPort}`, '--host', E2E.pin, '--fast', '--photos', '3', '--teams', '3'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bots.stdout!.on('data', (d) => (botLog += d));
  bots.stderr!.on('data', (d) => (botLog += d));

  // Every phase should show up on the TV along the way.
  await expect(tv.locator('.screen.captioning')).toBeVisible({ timeout: 60_000 });
  await expect(tv.locator('.screen.voting')).toBeVisible({ timeout: 60_000 });
  await expect(tv.locator('.screen.results')).toBeVisible({ timeout: 60_000 });
  await expect(tv.locator('.screen.final')).toBeVisible({ timeout: 150_000 });

  const exitCode = await new Promise<number | null>((resolve) => {
    if (bots!.exitCode !== null) resolve(bots!.exitCode);
    else bots!.on('exit', resolve);
  });
  await testInfo.attach('bots.log', { body: botLog, contentType: 'text/plain' });
  await tv.locator('.champion-line:not(.pending)').waitFor({ timeout: 20_000 }).catch(() => {}); // let the podium reveal finish
  await tv.screenshot({ path: testInfo.outputPath('tv-final.png') });
  await host.screenshot({ path: testInfo.outputPath('host-final.png') });
  expect(exitCode, botLog).toBe(0);
  expect(botLog).toMatch(/FINAL after [3-9] round\(s\)/);
  expect(errors).toEqual([]);

  await tvCtx.close();
  await hostCtx.close();
});
