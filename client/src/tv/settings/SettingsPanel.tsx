// Gear button + settings drawer. Always available on the TV (every phase), opened by the
// gear in the corner or the S key; Esc closes. Rows are rendered from SETTINGS (registry.ts).
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TvView } from '../../../../shared/types.ts';
import { SETTINGS, type SettingCtx, type SettingDef } from './registry.ts';
import './settings.css';

const SECTIONS = [...new Set(SETTINGS.map((s) => s.section))];

export function SettingsPanel({ view }: { view: TvView | null }) {
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // S toggles, Esc closes. Ignore when a modifier is held or focus is in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text')) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus the panel when it opens; return focus to the gear when it closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('button, input, [tabindex]')?.focus();
    else if (wasOpen.current) gearRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // Keep Tab inside the open panel.
  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const ctx: SettingCtx = { view };

  return (
    <>
      <button
        ref={gearRef}
        type="button"
        className={`settings-gear ${open ? 'is-open' : ''}`}
        aria-label="Settings (S)"
        aria-expanded={open}
        title="Settings (S)"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2.1-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="settings-scrim" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              ref={panelRef}
              className="settings-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onKeyDown={onPanelKey}
              initial={{ x: '105%' }}
              animate={{ x: 0 }}
              exit={{ x: '105%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <header className="settings-head">
                <h2 id={titleId}>Settings</h2>
                <button type="button" className="settings-close" onClick={() => setOpen(false)} aria-label="Close settings">
                  ✕
                </button>
              </header>
              <div className="settings-body">
                {SECTIONS.map((sec) => (
                  <section key={sec} className="settings-section">
                    <h3>{sec}</h3>
                    {SETTINGS.filter((s) => s.section === sec).map((def) => (
                      <SettingRow key={def.id} def={def} ctx={ctx} />
                    ))}
                  </section>
                ))}
              </div>
              <footer className="settings-foot">
                Press <kbd>S</kbd> to open or close · <kbd>M</kbd> mute
              </footer>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** One row. Calls the definition's hook, so each row is its own component. */
function SettingRow({ def, ctx }: { def: SettingDef; ctx: SettingCtx }) {
  const id = useId();
  switch (def.kind) {
    case 'toggle':
      return <ToggleRow def={def} ctx={ctx} id={id} />;
    case 'slider':
      return <SliderRow def={def} ctx={ctx} id={id} />;
    case 'choice':
      return <ChoiceRow def={def} ctx={ctx} />;
    case 'info':
      return <InfoRow def={def} ctx={ctx} />;
  }
}

function ToggleRow({ def, ctx, id }: { def: Extract<SettingDef, { kind: 'toggle' }>; ctx: SettingCtx; id: string }) {
  const [on, set] = def.use(ctx);
  return (
    <div className="setting-row">
      <label htmlFor={id} className="setting-label">
        {def.label}
        {def.hint && <small>{def.hint}</small>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => set(!on)}>
        <span className="switch-knob" />
        <span className="switch-text">{on ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

function SliderRow({ def, ctx, id }: { def: Extract<SettingDef, { kind: 'slider' }>; ctx: SettingCtx; id: string }) {
  const [v, set] = def.use(ctx);
  const pct = Math.round(v * 100);
  return (
    <div className="setting-row setting-slider">
      <label htmlFor={id} className="setting-label">
        {def.label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => set(Number(e.target.value) / 100)}
      />
      <output htmlFor={id}>{pct}%</output>
    </div>
  );
}

function ChoiceRow({ def, ctx }: { def: Extract<SettingDef, { kind: 'choice' }>; ctx: SettingCtx }) {
  const [v, set] = def.use(ctx);
  return (
    <div className="setting-row setting-choice" role="radiogroup" aria-label={def.label}>
      <span className="setting-label">
        {def.label}
        {def.hint && <small>{def.hint}</small>}
      </span>
      <div className="choice-grid">
        {def.options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={v === o.value} className={`choice ${v === o.value ? 'on' : ''}`} onClick={() => set(o.value)}>
            {o.swatch && (
              <span className="swatch" aria-hidden>
                {o.swatch.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
            )}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ def, ctx }: { def: Extract<SettingDef, { kind: 'info' }>; ctx: SettingCtx }) {
  const text = def.use(ctx);
  if (!text) return null;
  return (
    <div className="setting-row setting-info">
      <span className="setting-label">
        {def.label}
        {def.hint && <small>{def.hint}</small>}
      </span>
      <code className="info-value">{text}</code>
    </div>
  );
}
