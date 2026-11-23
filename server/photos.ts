// Photo queue sources:
//  1. Files dropped into data/photos/ before the party (scanned on boot, sorted by filename).
//     A name like "03 - Cousin Jake.jpg" sets the subject to "Cousin Jake".
//  2. Uploads from /host: POST /api/photos (multipart field "photos", header x-host-pin).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import type { Photo } from '../shared/types.ts';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 50;

/** Formats a browser on the TV can display. HEIC is excluded on purpose. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};
const SHOWABLE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

export const photoUrl = (filename: string) => `/photos/${encodeURIComponent(filename)}`;
export const filenameFromUrl = (url: string) =>
  url.startsWith('/photos/') ? decodeURIComponent(url.slice('/photos/'.length)) : null;

/** "03 - Cousin Jake.jpg" -> "Cousin Jake". Only numbered names count, so "IMG_1234.jpg" -> null. */
export function subjectFromFilename(filename: string): string | null {
  const base = path.parse(filename).name;
  const m = base.match(/^\s*\d+\s*[-–_.]\s*(.+?)\s*$/);
  return m && /[a-z]/i.test(m[1]) ? m[1].slice(0, 40) : null;
}

/** Photos in `dir` that aren't already in the queue, sorted by filename (natural order). */
export function scanPhotoDir(dir: string, queue: Photo[]): Photo[] {
  if (!existsSync(dir)) return [];
  const known = new Set(queue.map((p) => p.url));
  const files = readdirSync(dir)
    .filter((f) => !f.startsWith('.') && statSync(path.join(dir, f)).isFile())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const found: Photo[] = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!SHOWABLE_EXT.has(ext)) {
      if (ext === '.heic' || ext === '.heif') console.warn(`⚠️  Skipping ${f}: convert HEIC photos to JPEG first`);
      continue;
    }
    const url = photoUrl(f);
    if (known.has(url)) continue;
    const id = `f${createHash('sha1').update(f).digest('hex').slice(0, 8)}`;
    found.push({ id, url, subject: subjectFromFilename(f), used: false });
  }
  return found;
}

/** Moves a removed photo's file aside (not deleted), so the boot scan won't re-add it. */
export function archivePhoto(dir: string, photo: Photo) {
  const f = filenameFromUrl(photo.url);
  if (!f || f.includes('/') || f.includes('\\')) return;
  const src = path.join(dir, f);
  if (!existsSync(src)) return;
  const removed = path.join(dir, 'removed');
  mkdirSync(removed, { recursive: true });
  renameSync(src, path.join(removed, `${Date.now()}-${f}`));
}

/** Drops queued photos whose files are gone, unless a round already used them. */
export function pruneMissing(dir: string, queue: Photo[], keepIds: Set<string>): Photo[] {
  return queue.filter((p) => {
    const f = filenameFromUrl(p.url);
    return keepIds.has(p.id) || (f !== null && existsSync(path.join(dir, f)));
  });
}

export interface PhotoRouterOpts {
  dir: string;
  /** Returns an error message (and HTTP status) if the request isn't from the host. */
  authorize: (req: Request) => { status: number; error: string } | null;
  onPhotos: (photos: Photo[]) => void;
}

export function photoRouter({ dir, authorize, onPhotos }: PhotoRouterOpts) {
  mkdirSync(dir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${randomUUID().slice(0, 8)}${MIME_EXT[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES_PER_UPLOAD, fields: 10 },
    fileFilter: (_req, file, cb) => {
      if (MIME_EXT[file.mimetype]) return cb(null, true);
      cb(new Error(file.mimetype.startsWith('image/') ? `Unsupported image type (${file.mimetype}). Use JPEG or PNG.` : 'Images only'));
    },
  }).array('photos', MAX_FILES_PER_UPLOAD);

  const router = express.Router();
  router.post('/api/photos', (req: Request, res: Response) => {
    const denied = authorize(req);
    if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });
    upload(req, res, (err: unknown) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (err) {
        // Don't keep half an upload around.
        for (const f of files) rmSync(f.path, { force: true });
        const msg =
          err instanceof multer.MulterError
            ? err.code === 'LIMIT_FILE_SIZE'
              ? 'Photo is too big (15 MB max)'
              : err.message
            : (err as Error).message;
        return res.status(400).json({ ok: false, error: msg });
      }
      if (!files.length) return res.status(400).json({ ok: false, error: 'No photos in the upload' });
      const bodySubject = typeof req.body?.subject === 'string' ? req.body.subject.trim().slice(0, 40) : '';
      const photos: Photo[] = files.map((f) => ({
        id: path.parse(f.filename).name,
        url: photoUrl(f.filename),
        subject: (files.length === 1 && bodySubject) || subjectFromFilename(f.originalname),
        used: false,
      }));
      onPhotos(photos);
      res.json({ ok: true, photos });
    });
  });
  return router;
}
