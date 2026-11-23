import { useEffect, useRef, useState } from 'react';
import type { HostView, Photo } from '../../../../shared/types.ts';
import { IS_MOCK } from '../../socket.ts';
import { COPY } from '../copy.ts';
import { useToast } from '../Toast.tsx';
import { resizeImage, uploadPhoto } from './resize.ts';
import { useAct } from './useAct.ts';

export function PhotoQueue({ view, pin }: { view: HostView; pin: string }) {
  const act = useAct();
  const ids = view.photos.map((p) => p.id);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    act({ type: 'reorderPhotos', photoIds: next });
  };

  return (
    <div className="ph-stack">
      <Uploader pin={pin} />
      {view.photos.length === 0 && <p className="ph-muted">{COPY.host.noPhotos}</p>}
      <ol className="ph-list ph-photos">
        {view.photos.map((p, i) => (
          <PhotoRow key={p.id} photo={p} index={i} last={i === ids.length - 1} onMove={move} />
        ))}
      </ol>
    </div>
  );
}

function PhotoRow({ photo, index, last, onMove }: { photo: Photo; index: number; last: boolean; onMove: (i: number, d: -1 | 1) => void }) {
  const act = useAct();
  const [subject, setSubject] = useState(photo.subject ?? '');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setSubject(photo.subject ?? ''), [photo.subject]);

  const saveSubject = () => {
    const s = subject.trim() || null;
    if (s !== photo.subject) act({ type: 'setSubject', photoId: photo.id, subject: s });
  };

  return (
    <li className={`ph-list__item ph-photo${photo.used ? ' is-used' : ''}`}>
      <span className="ph-photo__num">{index + 1}</span>
      <div className="ph-photo__thumb">
        <img src={photo.url} alt="" loading="lazy" />
        {photo.used && <span className="ph-badge">{COPY.host.used}</span>}
      </div>
      <input
        className="ph-input ph-input--small ph-photo__subject"
        value={subject}
        placeholder={COPY.host.subjectPlaceholder}
        maxLength={40}
        onChange={(e) => setSubject(e.target.value)}
        onBlur={saveSubject}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      <div className="ph-photo__actions">
        <button className="ph-btn ph-btn--small ph-btn--ghost" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move up">↑</button>
        <button className="ph-btn ph-btn--small ph-btn--ghost" disabled={last} onClick={() => onMove(index, 1)} aria-label="Move down">↓</button>
        {confirm ? (
          <>
            <button className="ph-btn ph-btn--small ph-btn--danger" onClick={() => act({ type: 'removePhoto', photoId: photo.id })}>{COPY.host.yes}</button>
            <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => setConfirm(false)}>{COPY.host.no}</button>
          </>
        ) : (
          <button className="ph-btn ph-btn--small ph-btn--danger" onClick={() => setConfirm(true)} aria-label="Remove photo">🗑</button>
        )}
      </div>
    </li>
  );
}

function Uploader({ pin }: { pin: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; frac: number } | null>(null);

  const onFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (input.current) input.current.value = '';
    if (list.length === 0) return;
    if (IS_MOCK) return toast(`Mock mode: would upload ${list.length} photo(s)`, 'info');
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length, frac: 0 });
      try {
        const blob = await resizeImage(list[i]);
        await uploadPhoto(blob, list[i].name, pin, (frac) => setProgress({ done: i, total: list.length, frac }));
        ok++;
      } catch (e) {
        toast(`${list[i].name}: ${(e as Error).message}`);
      }
    }
    setProgress(null);
    if (ok) toast(`Added ${ok} photo${ok === 1 ? '' : 's'}`, 'info');
  };

  const pct = progress ? ((progress.done + progress.frac) / progress.total) * 100 : 0;
  return (
    <div className="ph-uploader">
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button className="ph-btn ph-btn--primary" disabled={!!progress} onClick={() => input.current?.click()}>
        📷 {progress ? COPY.host.uploading(progress.done + 1, progress.total) : COPY.host.upload}
      </button>
      {progress && (
        <div className="ph-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="ph-progress__bar" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
