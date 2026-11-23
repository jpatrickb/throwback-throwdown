import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Tone = 'error' | 'info';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

/** Small non-blocking toasts. Errors never crash a screen; they show here. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((text: string, tone: Tone = 'error') => {
    const id = nextId.current++;
    setToasts((t) => [...t.filter((x) => x.text !== text), { id, text, tone }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="ph-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ph-toast ph-toast--${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
