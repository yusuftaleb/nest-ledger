"use client";

import { useActionState, useId, useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { GoalEgg } from "./goal-egg";
import { Menu } from "./menu";
import { useConfirm } from "./confirm";
import { deleteGoal, saveGoal, setBucketArchived, type FormState } from "@/lib/actions";
import { DateField } from "./date-picker";

export type GoalView = {
  id: string; name: string; saved: number; target: number; note: string; reached: boolean;
  targetDate: string | null; accountId: string | null; transactions: number; archived: boolean;
};

/** The nest eggs, with add, edit, archive and delete in place. */
export function GoalsCard({ goals, accounts }: { goals: GoalView[]; accounts: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = goals.filter((g) => !g.archived), archived = goals.filter((g) => g.archived);
  const current = editing && editing !== "new" ? goals.find((g) => g.id === editing) : undefined;
  return (
    <>
      {active.length === 0 && editing !== "new" && <p className="empty">No goals yet. Add one: an emergency fund, a car, next term’s tuition.</p>}
      <div className="goals">
        {active.map((g) => (
          <div key={g.id} className={`goal-cell${editing === g.id ? " is-editing" : ""}`}>
            <GoalEgg id={g.id} name={g.name} saved={g.saved} target={g.target} note={g.note} reached={g.reached} />
            <button type="button" className="goal-edit" onClick={() => setEditing(editing === g.id ? null : g.id)} aria-expanded={editing === g.id}>
              <Pencil size={14} strokeWidth={2} aria-hidden />Edit
            </button>
          </div>
        ))}
        {editing !== "new" && (
          <button type="button" className="goal-add" onClick={() => setEditing("new")}>
            <span className="goal-add-egg" aria-hidden><Plus size={22} strokeWidth={2} /></span>Add a goal
          </button>
        )}
      </div>
      {editing && <GoalForm key={editing} goal={current} accounts={accounts} onDone={() => setEditing(null)} />}
      {archived.length > 0 && (
        <div className="goal-archived">
          <button type="button" className="textlink" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {showArchived ? "Hide" : "Show"} {archived.length} archived
          </button>
          {showArchived && (
            <ul className="owed">
              {archived.map((g) => (
                <li key={g.id}><span className="owed-name">{g.name}</span>
                  <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={() => setBucketArchived(g.id, false)}><RotateCcw size={14} strokeWidth={2} aria-hidden />Restore</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function GoalForm({ goal, accounts, onDone }: { goal?: GoalView; accounts: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await saveGoal(goal?.id ?? null, prev, form);
    if (r?.ok) onDone();
    return r;
  }, null);
  const formId = useId();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(goal?.accountId ?? "");
  const remove = async () => {
    if (!goal) return;
    const yes = await confirm({
      title: `Delete “${goal.name}”?`,
      body: goal.transactions
        ? `Its ${goal.transactions} transactions keep their amounts but lose this goal and will show under Needs a look. Archive it instead to keep them as they are.`
        : "This can’t be undone.",
      action: "Delete goal",
    });
    if (!yes) return;
    setBusy(true);
    await deleteGoal(goal.id);
    onDone();
  };
  return (
    <form action={action} className="goal-form" aria-label={goal ? `Edit ${goal.name}` : "Add a goal"}>
      <h3 className="heading">{goal ? `Edit ${goal.name}` : "New goal"}</h3>
      <div className="form-row">
        <label className="field"><span>Name</span><input className="input" name="name" defaultValue={goal?.name} placeholder="e.g. Emergency fund" required autoFocus /></label>
        <label className="field"><span>Target</span><input className="input" name="target" inputMode="decimal" defaultValue={goal ? (goal.target / 100).toFixed(2) : ""} placeholder="e.g. 3,000" required /></label>
      </div>
      <div className="form-row">
        <div className="field"><span id={`${formId}-by`}>Reach it by <span className="field-hint">optional</span></span><DateField name="target_date" defaultValue={goal?.targetDate ?? ""} placeholder="No date" clearable labelledBy={`${formId}-by`} /></div>
        <div className="field menu-field"><span id={`${formId}-source`}>Count progress from</span>
          <input type="hidden" name="account_id" value={source} />
          <Menu labelledBy={`${formId}-source`} value={source} onChange={setSource} options={[
            { value: "", label: "Money moved into this goal" },
            ...accounts.map((a) => ({ value: a.id, label: `${a.name} balance`, group: "A savings account" })),
          ]} />
        </div>
      </div>
      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      <div className="form-actions goal-form-actions">
        {goal && (
          <>
            <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost" onClick={async () => { setBusy(true); await setBucketArchived(goal.id, true); onDone(); }} disabled={busy}>
              <Archive size={14} strokeWidth={2} aria-hidden />Archive
            </button>
            <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost btn-danger" onClick={remove} disabled={busy}><Trash2 size={14} strokeWidth={2} aria-hidden />Delete</button>
          </>
        )}
        <span className="spacer" />
        <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary" onClick={onDone}>Cancel</button>
        <button className="nl-btn nl-btn-sm nl-btn-primary" disabled={pending || busy}>{pending ? "Saving…" : goal ? "Save" : "Add goal"}</button>
      </div>
      {dialog}
    </form>
  );
}
