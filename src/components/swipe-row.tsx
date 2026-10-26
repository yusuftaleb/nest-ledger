"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Flag, FolderInput } from "lucide-react";
import { showUndo } from "./undo";
import { bulkUpdate, restoreEdits } from "@/lib/actions";

const OPEN = -144;
let closeOpen: (() => void) | null = null;

/**
 * A transaction row you can swipe on a touch screen: slide it left for two actions underneath, "Checked" (or
 * "Needs a look" when it's already checked) and "Bucket", which opens it to choose. Only a sideways drag
 * counts, so the list still scrolls; a mouse never sees any of it.
 */
export function SwipeRow({ id, review, children }: { id: string; review: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const from = useRef<{ x: number; y: number; base: number; decided: "swipe" | "scroll" | null } | null>(null);
  const moved = useRef(false);

  const settle = (to: number) => {
    setX(to);
    if (to !== 0) { if (closeOpen && closeOpen !== close) closeOpen(); closeOpen = close; }
    else if (closeOpen === close) closeOpen = null;
  };
  const close = () => setX(0);
  const mark = () => start(async () => {
    settle(0);
    const r = await bulkUpdate([id], { needsReview: !review });
    if (!r?.ok) { showUndo(r?.error ?? "Couldn’t save that."); return; }
    const { before } = r;
    showUndo(review ? "Checked." : "Marked to look at.", before ? () => restoreEdits(before) : undefined);
  });

  return (
    <div className="nl-swipe" data-open={x !== 0 || undefined}>
      <div className="nl-swipe-actions" aria-hidden={x === 0}>
        <button type="button" className="nl-swipe-act check" tabIndex={x === 0 ? -1 : 0} disabled={pending} onClick={mark}>
          {review ? <CircleCheck size={20} strokeWidth={1.75} aria-hidden /> : <Flag size={20} strokeWidth={1.75} aria-hidden />}
          {review ? "Checked" : "Look at"}
        </button>
        <button type="button" className="nl-swipe-act bucket" tabIndex={x === 0 ? -1 : 0} onClick={() => { settle(0); router.push(`/transactions/${id}`, { scroll: false }); }}>
          <FolderInput size={20} strokeWidth={1.75} aria-hidden />Bucket
        </button>
      </div>
      <div className={`nl-swipe-face${dragging ? " is-dragging" : ""}`} style={x ? { transform: `translateX(${x}px)` } : undefined}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          from.current = { x: e.clientX, y: e.clientY, base: x, decided: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const f = from.current;
          if (!f) return;
          const dx = e.clientX - f.x, dy = e.clientY - f.y;
          if (!f.decided) {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { f.decided = "swipe"; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); }
            else if (Math.abs(dy) > 8) { f.decided = "scroll"; from.current = null; return; }
            else return;
          }
          moved.current = true;
          // past the actions it gives a little, like iOS
          const next = f.base + dx;
          setX(next > 0 ? 0 : next < OPEN ? OPEN + (next - OPEN) / 4 : next);
        }}
        onPointerUp={(e) => {
          const f = from.current;
          from.current = null;
          setDragging(false);
          if (!f || f.decided !== "swipe") return;
          settle(e.clientX - f.x + f.base < OPEN / 2 ? OPEN : 0);
        }}
        onPointerCancel={() => { from.current = null; setDragging(false); settle(x < OPEN / 2 ? OPEN : 0); }}
        // a swipe is not a tap: the row's link opens only on a plain tap, and a tap on an open row closes it
        onClickCapture={(e) => { if (moved.current || x !== 0) { e.preventDefault(); e.stopPropagation(); moved.current = false; if (x !== 0) settle(0); } }}>
        {children}
      </div>
    </div>
  );
}
