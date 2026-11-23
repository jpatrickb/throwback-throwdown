// Prepare a brand-new game: archive leftover photos and the saved game state,
// so nothing from test runs (or Saturday's dry run) shows up in the real game.
// Nothing is deleted. Everything moves to data/archive/<timestamp>/.
//
//   npm run fresh            archive, then start a fresh game (build + server)
//   npm run fresh -- --dry   show what would be archived, change nothing
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const dry = process.argv.includes('--dry');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const archive = path.join(DATA_DIR, 'archive', stamp);

const photos = existsSync(PHOTO_DIR)
  ? readdirSync(PHOTO_DIR).filter((f) => f !== '.gitkeep' && !f.startsWith('.'))
  : [];
const hasState = existsSync(STATE_FILE);

if (!photos.length && !hasState) {
  console.log('✨ Already fresh: no leftover photos or saved game.');
  process.exit(0);
}

console.log(`${dry ? '[dry run] Would archive' : 'Archiving'} to ${path.relative(ROOT, archive)}/`);
console.log(`  • ${photos.length} item(s) from data/photos/`);
if (hasState) console.log('  • data/state.json (saved game, room code, PIN)');
if (dry) process.exit(0);

mkdirSync(path.join(archive, 'photos'), { recursive: true });
for (const f of photos) renameSync(path.join(PHOTO_DIR, f), path.join(archive, 'photos', f));
if (hasState) renameSync(STATE_FILE, path.join(archive, 'state.json'));
console.log('✨ Fresh start ready. Put game photos in data/photos/ now, or have the host upload them.');
