import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// In-site replacement for window.confirm/prompt. `confirm()` resolves to null when cancelled, or
// { note } when confirmed. `typeToConfirm` makes the user type an exact phrase first.
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  typeToConfirm?: string;
  askNote?: boolean;
}
export interface ConfirmResult {
  note: string;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult | null>;

const Ctx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((r: ConfirmResult | null) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    return new Promise((resolve) => {
      resolver.current?.(null); // a newer dialog replaces an open one
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const close = useCallback((r: ConfirmResult | null) => {
    resolver.current?.(r);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && <Dialog opts={opts} onClose={close} />}
    </Ctx.Provider>
  );
}

function Dialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (r: ConfirmResult | null) => void }) {
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const needsType = !!opts.typeToConfirm;
  const ready = !needsType || typed === opts.typeToConfirm;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={() => onClose(null)}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={opts.title}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onClose({ note: note.trim() });
        }}
      >
        <h2>{opts.title}</h2>
        {opts.body && <div className="dialog-body">{opts.body}</div>}
        {needsType && (
          <label className="field">
            <span>
              Type <strong>{opts.typeToConfirm}</strong> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
          </label>
        )}
        {opts.askNote && (
          <label className="field">
            <span>Note for the audit log (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className={`btn ${opts.destructive ? 'btn-danger' : 'btn-primary'}`} disabled={!ready}>
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function useConfirm(): ConfirmFn {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConfirm outside ConfirmProvider');
  return v;
}
