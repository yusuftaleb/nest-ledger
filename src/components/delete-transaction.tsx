"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { iconProps } from "./icons";
import { usePeek } from "./peek";
import { showUndo } from "./undo";
import { deleteTransaction, restoreTransactions } from "@/lib/actions";

/** Deletes at once, then closes the peek (or goes back from the full page) to the list it came from; the Undo bar puts it back. */
export function DeleteTransaction({ id }: { id: string }) {
  const router = useRouter();
  const peek = usePeek();
  const [pending, start] = useTransition();
  const remove = () => {
    start(async () => {
      const r = await deleteTransaction(id);
      if (r.error || !r.removed) { showUndo(r.error ?? "Couldn’t delete it."); return; }
      const removed = r.removed;
      showUndo("Deleted.", () => restoreTransactions(removed));
      if (peek) peek.close();
      else if (window.history.length > 1) router.back();
      else router.replace("/transactions");
    });
  };
  return (
    <>
      <button type="button" onClick={remove} disabled={pending} className="nl-btn nl-btn-md nl-btn-ghost btn-danger">
        <Trash2 {...iconProps} size={18} />{pending ? "Deleting…" : "Delete"}
      </button>
    </>
  );
}
