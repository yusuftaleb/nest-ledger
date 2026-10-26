"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { showUndo } from "./undo";
import { finishCheckIn, undoCheckIn } from "@/lib/actions";

/** Ends the weekly check-in: remembered for both of you, said in the Undo bar, then back to Home. */
export function CheckInDone() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="nl-btn nl-btn-md nl-btn-primary" disabled={pending}
      onClick={() => start(async () => {
        const r = await finishCheckIn();
        if (!r?.ok) { showUndo(r?.error ?? "Couldn’t save that."); return; }
        const previous = r.previous;
        showUndo("Checked in for this week.", () => undoCheckIn(previous));
        router.push("/");
      })}>
      <Check size={16} strokeWidth={2.25} aria-hidden />{pending ? "Saving…" : "Done for this week"}
    </button>
  );
}
