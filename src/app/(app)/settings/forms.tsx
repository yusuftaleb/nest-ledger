"use client";

import { useActionState, useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Menu } from "@/components/menu";
import { IconPicker } from "@/components/icon-picker";
import { guessIcon } from "@/lib/bucket-icons";
import { addAccount, addBucket, setBucketIcon, inviteMember, renewInvite, setPassword, updateAvatar, updateDisplayName, type FormState } from "@/lib/actions";
import { Camera, ChevronRight, Pencil } from "lucide-react";
import { ACCOUNT_KINDS, BUCKET_KINDS } from "@/lib/types";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <p className="msg msg-err" role="alert">{state.error}</p>;
  if (state?.ok) return <p className="msg msg-ok" role="status">{state.ok}</p>;
  return null;
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Your name</span>
        <input className="input" name="display_name" defaultValue={name} required />
      </label>
      <Feedback state={state} />
      <div className="form-actions"><button className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending}>Save name</button></div>
    </form>
  );
}

const EMOJI = ["🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🦉", "🐧", "🐳", "🐝", "🌻", "🌙", "⭐", "🍀", "🌵", "🍓", "🍋", "☕", "📚", "🎓", "🧸", "🍼"];

/** Shrink a photo to a 160px square, cropped from the middle, so it fits in the member row. */
async function squarePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height), px = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Your picture in Settings: tap it for a photo, an emoji, or back to initials. */
export function AvatarPicker({ name, avatar }: { name: string; avatar: string | null }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useOptimistic(avatar);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus({ preventScroll: true }); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const save = (next: string | null) => {
    setError(null);
    setOpen(false);
    button.current?.focus({ preventScroll: true });
    start(async () => {
      setShown(next);
      const r = await updateAvatar(next);
      if (r?.error) setError(r.error);
    });
  };
  const choose = async (f: File | undefined) => {
    if (!f) return;
    try { save(await squarePhoto(f)); } catch { setError("That file isn’t a photo this browser can read."); }
  };

  return (
    <div className="avatar-picker" ref={root}>
      <button ref={button} type="button" className="avatar-edit" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        aria-label="Change your picture" onClick={() => { setTyped(""); setOpen((o) => !o); }} data-pending={pending || undefined}>
        <Avatar name={name} avatar={shown} size={48} />
        <span className="avatar-edit-badge" aria-hidden><Pencil size={11} strokeWidth={2.25} /></span>
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      {open && (
        <div className="avatar-pop" role="dialog" aria-label="Your picture" id={id}>
          <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary btn-block" autoFocus onClick={() => file.current?.click()}>
            <Camera size={15} strokeWidth={1.75} aria-hidden />{shown?.startsWith("data:") ? "Choose another photo" : "Choose a photo"}
          </button>
          <div className="avatar-emoji-grid" role="group" aria-label="Or an emoji">
            {EMOJI.map((e) => (
              <button key={e} type="button" className="avatar-emoji-btn" aria-pressed={shown === e} aria-label={`Use ${e}`} onClick={() => save(e)}>{e}</button>
            ))}
          </div>
          <form className="avatar-own" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) save(typed.trim()); }}>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type any emoji" aria-label="Any emoji" maxLength={16} enterKeyHint="done" />
            <button className="nl-btn nl-btn-sm nl-btn-secondary" disabled={!typed.trim()}>Use</button>
          </form>
          {shown && <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost btn-block" onClick={() => save(null)}>Use my initials</button>}
        </div>
      )}
      {error && <p className="msg msg-err" role="alert">{error}</p>}
    </div>
  );
}

/** A join link to hand over: copy it, or share it straight to a chat app on a phone. */
function JoinLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) { await navigator.share({ title: "Join our Nest Ledger", url: link }).catch(() => {}); return; }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };
  return (
    <div className="join-link">
      <input className="input" value={link} readOnly aria-label="Join link" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="nl-btn nl-btn-sm nl-btn-secondary" onClick={share}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, null);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Their email</span>
        <input className="input" name="email" type="email" inputMode="email" required />
      </label>
      <Feedback state={state} />
      {state?.link && <JoinLink link={state.link} />}
      <div className="form-actions"><button className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending}>Make a join link</button></div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, null);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>New password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <Feedback state={state} />
      <div className="form-actions"><button className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending}>Save password</button></div>
    </form>
  );
}

export function AccountForm() {
  const [state, action, pending] = useActionState(addAccount, null);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Account name</span>
        <input className="input" name="name" placeholder="e.g. Student loan" required />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Bank or company</span>
          <input className="input" name="institution" placeholder="e.g. RBC" />
        </label>
        <label className="field">
          <span>Kind</span>
          <input className="input" name="kind" list="account-kinds" placeholder="chequing" />
          <datalist id="account-kinds">{ACCOUNT_KINDS.map((k) => <option key={k} value={k} />)}</datalist>
        </label>
      </div>
      <label className="check"><input type="checkbox" name="is_debt" />Money owed (a card or loan)</label>
      <Feedback state={state} />
      <div className="form-actions"><button className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending}>Add account</button></div>
    </form>
  );
}

const KINDS: Record<string, string> = { spend: "Spending", income: "Money in", transfer: "Transfer (not spending)", saving: "Savings", goal: "Goal", lent: "Lent to others" };

type Parent = { id: string; name: string; kind: string; icon: string | null; color: string | null };

export function BucketForm({ parents }: { parents: Parent[] }) {
  const [state, action, pending] = useActionState(addBucket, null);
  const [parent, setParent] = useState("");
  const [kind, setKind] = useState("spend");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const id = useId();
  const inside = parents.find((p) => p.id === parent);
  // the icon follows the name ("Daycare" gets a baby) until you pick one; inside a parent it borrows the parent's
  const icon = picked ?? guessIcon(name) ?? inside?.icon ?? null;
  return (
    <form action={action} className="form">
      <input type="hidden" name="parent_id" value={parent} />
      <input type="hidden" name="kind" value={kind} />
      <div className="field">
        <span>Bucket name</span>
        <div className="name-with-icon">
          <IconPicker name="icon" value={icon} color={inside?.color} seed={inside?.id ?? (name || "new")} onPick={setPicked} />
          <input className="input" name="name" placeholder="e.g. Daycare" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className="form-row">
        <div className="field menu-field">
          <span id={`${id}-in`}>Inside</span>
          {/* a bucket inside another usually counts the same way, so picking a parent picks its kind too */}
          <Menu labelledBy={`${id}-in`} value={parent} placeholder="Nothing (top level)"
            options={[{ value: "", label: "Nothing (top level)" }, ...parents.map((p) => ({ value: p.id, label: p.name, group: KINDS[p.kind] ?? p.kind, icon: p.icon, color: p.color, seed: p.id }))]}
            onChange={(v) => { setParent(v); const k = parents.find((p) => p.id === v)?.kind; if (k) setKind(k); }} />
        </div>
        <div className="field menu-field">
          <span id={`${id}-kind`}>Kind</span>
          <Menu labelledBy={`${id}-kind`} value={kind} onChange={setKind}
            options={[...new Set([...BUCKET_KINDS, "lent"])].map((k) => ({ value: k, label: KINDS[k] ?? k }))} />
        </div>
      </div>
      <label className="field">
        <span>Monthly budget (optional)</span>
        <input className="input" name="budget" inputMode="decimal" placeholder="0.00" />
      </label>
      <Feedback state={state} />
      <div className="form-actions"><button className="nl-btn nl-btn-sm nl-btn-secondary" disabled={pending}>Add bucket</button></div>
    </form>
  );
}

/** A bucket's icon in the Settings list; tap it to pick another, saved straight away. */
export function BucketIconButton({ id, icon, color }: { id: string; icon: string | null; color: string | null }) {
  const [shown, setShown] = useOptimistic(icon);
  const [pending, start] = useTransition();
  const pick = (next: string) => {
    if (next === icon) return;
    start(async () => { setShown(next); await setBucketIcon(id, next); });
  };
  return <IconPicker value={shown} color={color} seed={id} onPick={pick} pending={pending} small label="Bucket icon" />;
}

export function RenewInvite({ email }: { email: string }) {
  const [state, action, pending] = useActionState(() => renewInvite(email), null);
  return (
    <form action={action} className="resend">
      {state?.link ? <JoinLink link={state.link} /> : <button className="nl-btn nl-btn-sm nl-btn-ghost" disabled={pending}>{pending ? "Making…" : "New link"}</button>}
      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
    </form>
  );
}

/** A parent bucket in Settings: what's inside it stays folded away until you open it. */
export function BucketFamily({ icon, name, caption, count, end, children }: {
  icon: React.ReactNode; name: string; caption: string; count: number; end: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`bucket-family${open ? " is-open" : ""}`}>
      <div className="list-row">
        {icon}
        <button type="button" className="list-row-main fold-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className="fold-text">
            <span className="fold-name">{name}</span>
            <span className="caption">{[caption, `${count} inside`].filter(Boolean).join(" · ")}</span>
          </span>
          <ChevronRight className="fold-chevron" size={16} strokeWidth={2} aria-hidden />
        </button>
        {end}
      </div>
      {open && <div className="bucket-kids" id={id}>{children}</div>}
    </div>
  );
}
