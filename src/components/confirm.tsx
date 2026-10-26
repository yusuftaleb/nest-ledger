"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Ask = { title: string; body?: string; action: string };

/**
 * The app's own "are you sure?", in place of the browser's grey box: `await confirm({...})` resolves true only
 * when the action button is pressed. Render `dialog` once in the component. Cancel has focus first, so Enter
 * or Escape never deletes by accident.
 */
export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const settle = useRef<(yes: boolean) => void>(() => {});
  const confirm = useCallback((a: Ask) => new Promise<boolean>((resolve) => { settle.current = resolve; setAsk(a); }), []);
  const done = (yes: boolean) => { settle.current(yes); setAsk(null); };
  return { confirm, dialog: ask && <ConfirmDialog {...ask} onDone={done} /> };
}

function ConfirmDialog({ title, body, action, onDone }: Ask & { onDone: (yes: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // the top layer: above peeks and sheets, never clipped by a card, with the page inert behind it
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="confirm" aria-labelledby="confirm-title" aria-describedby={body ? "confirm-body" : undefined}
      onCancel={(e) => { e.preventDefault(); onDone(false); }}
      // Escape answers this dialog only, not the peek underneath (which skips a key already handled)
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDone(false); } }}
      onClick={(e) => { if (e.target === e.currentTarget) onDone(false); }}>
      <div className="confirm-in">
        <h2 id="confirm-title" className="confirm-title">{title}</h2>
        {body && <p id="confirm-body" className="confirm-body">{body}</p>}
        <div className="confirm-actions">
          <button type="button" className="nl-btn nl-btn-md nl-btn-secondary" autoFocus onClick={() => onDone(false)}>Cancel</button>
          <button type="button" className="nl-btn nl-btn-md nl-btn-danger" onClick={() => onDone(true)}>{action}</button>
        </div>
      </div>
    </dialog>
  );
}
