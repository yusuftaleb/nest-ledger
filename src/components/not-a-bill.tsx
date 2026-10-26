"use client";

import { useTransition } from "react";
import { BellOff } from "lucide-react";
import { showUndo } from "./undo";
import { notABill, undoNotABill } from "@/lib/actions";
import { tidyMerchant } from "@/lib/merchant";

/** "Not a bill": leaves this place out of bill detection from now on, with Undo. */
export function NotABill({ merchant }: { merchant: string }) {
  const [pending, start] = useTransition();
  const name = tidyMerchant(merchant);
  return (
    <button type="button" className="icon-btn bill-off" disabled={pending} aria-label={`${name} is not a bill`} title="Not a bill"
      onClick={() => start(async () => {
        const r = await notABill(merchant);
        if (!r?.ok || !r.id) { showUndo(r?.error ?? "Couldn’t save that."); return; }
        const id = r.id;
        showUndo(`${name} won’t show as a bill.`, () => undoNotABill(id));
      })}>
      <BellOff size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
