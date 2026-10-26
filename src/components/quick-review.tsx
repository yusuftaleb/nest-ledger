"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { CategoryIcon } from "./icons";
import { Menu, type Option } from "./menu";
import { usePeek } from "./peek";
import { showUndo } from "./undo";
import { bulkUpdate, restoreEdits } from "@/lib/actions";

type Choice = { id: string; name: string; icon: string | null; color: string | null };

/**
 * The top of a transaction that needs a look: one tap says it's right, or puts it in a bucket (the ones this
 * place usually goes in first, every bucket in the menu). Either one clears "needs a look", closes the peek and
 * says so in the Undo bar.
 */
export function QuickReview({ id, current, usual, options }: { id: string; current: Choice | null; usual: Choice[]; options: Option[] }) {
  const router = useRouter();
  const peek = usePeek();
  const [pending, start] = useTransition();
  const act = (change: { bucketId?: string; needsReview?: boolean }, said: string) => start(async () => {
    const r = await bulkUpdate([id], change);
    if (!r?.ok) { showUndo(r?.error ?? "Couldn’t save that."); return; }
    const { before } = r;
    showUndo(said, before ? () => restoreEdits(before) : undefined);
    if (peek) peek.close(); else router.refresh();
  });
  const chips = usual.filter((b) => b.id !== current?.id).slice(0, 3);
  return (
    <section className="quick-review" aria-label="Check this transaction">
      <p className="quick-review-q">{current ? <>Is <strong>{current.name}</strong> right?</> : "Which bucket is this?"}</p>
      <div className="quick-review-row">
        {current && (
          <button type="button" className="nl-btn nl-btn-md nl-btn-primary" disabled={pending} onClick={() => act({ needsReview: false }, `${current.name}, checked.`)}>
            <Check size={16} strokeWidth={2.25} aria-hidden />Looks right
          </button>
        )}
        {chips.map((b) => (
          <button key={b.id} type="button" className="quick-chip" disabled={pending} onClick={() => act({ bucketId: b.id }, `Moved to ${b.name}.`)}>
            <CategoryIcon icon={b.icon} color={b.color} seed={b.id} small />{b.name}
          </button>
        ))}
        <Menu compact value="" placeholder={chips.length || current ? "Another bucket" : "Pick a bucket"} options={options}
          onChange={(v) => { const o = options.find((x) => x.value === v); act({ bucketId: v }, `Moved to ${o?.short ?? o?.label ?? "that bucket"}.`); }} />
      </div>
    </section>
  );
}
