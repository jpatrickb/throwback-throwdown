import { useState, type FormEvent } from 'react';
import { BRAND } from '../../brand.ts';
import { AVATARS, COLORS } from '../avatars.ts';
import { COPY } from '../copy.ts';

export interface JoinValues {
  room: string;
  name: string;
  avatar: string;
  color: string;
}

export function Join({
  initial,
  connected,
  busy,
  error,
  onJoin,
}: {
  initial: JoinValues;
  connected: boolean;
  busy: boolean;
  error: string | null;
  onJoin: (v: JoinValues) => void;
}) {
  const [v, setV] = useState(initial);
  const set = (patch: Partial<JoinValues>) => setV((cur) => ({ ...cur, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onJoin({ ...v, name: v.name.trim() });
  };
  const ready = connected && !busy && v.room.length === 4 && v.name.trim().length > 0;

  return (
    <form className="ph-join" onSubmit={submit}>
      <header className="ph-join__brand">
        <h1 className="ph-logo">{BRAND.name}</h1>
        <p className="ph-tagline">{BRAND.tagline}</p>
      </header>

      <label className="ph-field">
        <span>{COPY.join.room}</span>
        <input
          className="ph-input ph-input--code"
          value={v.room}
          onChange={(e) => set({ room: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD"
          required
        />
      </label>

      <label className="ph-field">
        <span>{COPY.join.name}</span>
        <input
          className="ph-input"
          value={v.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={16}
          autoComplete="nickname"
          placeholder={COPY.join.namePlaceholder}
          required
        />
      </label>

      <fieldset className="ph-field ph-picker">
        <legend>{COPY.join.pickLook}</legend>
        <div className="ph-picker__preview" style={{ background: v.color }} aria-hidden>
          {v.avatar}
        </div>
        <div className="ph-picker__grid" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              role="radio"
              aria-checked={a === v.avatar}
              className={`ph-picker__emoji${a === v.avatar ? ' is-on' : ''}`}
              onClick={() => set({ avatar: a })}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="ph-picker__colors" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={c === v.color}
              aria-label={c}
              className={`ph-picker__color${c === v.color ? ' is-on' : ''}`}
              style={{ background: c }}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>
      </fieldset>

      {error && <p className="ph-error">{error}</p>}
      <button type="submit" className="ph-btn ph-btn--primary ph-btn--big" disabled={!ready}>
        {connected ? COPY.join.submit : COPY.join.connecting}
      </button>
    </form>
  );
}
