import { CURRENCY } from "@/lib/format";
import { LogOut, Plus } from "lucide-react";
import { iconProps } from "@/components/icons";
import { setAccountArchived, setBucketArchived, signOut } from "@/lib/actions";
import { bucketTree } from "@/lib/buckets";
import type { Bucket } from "@/lib/types";
import { ThemeSwitch } from "@/components/theme-switch";
import { getHousehold } from "@/lib/household";
import { getTheme } from "@/lib/theme";
import { isoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getToday } from "@/lib/today";
import type { Budget } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { AccountForm, AvatarPicker, BucketFamily, BucketForm, BucketIconButton, InviteForm, NameForm, PasswordForm, RenewInvite } from "./forms";

export const metadata = { title: "Settings" };

const kindLabel = (kind: string) => kind.replaceAll("_", " ");

export default async function SettingsPage() {
  const h = await getHousehold();
  const [{ data: budgetRows }, { data: inviteRows }] = await Promise.all([
    h.supabase.from("budgets").select("id, bucket_id, amount_cents, period, starts, ends").order("starts", { ascending: false }),
    h.supabase.from("invites").select("email, created_at, expires_at"),
  ]);
  const invites = (inviteRows ?? []) as { email: string; created_at: string; expires_at: string | null }[];
  const owner = h.members.find((m) => m.role === "owner");
  const isOwner = h.me?.role === "owner";
  const budgets = (budgetRows ?? []) as Budget[];
  const today = isoDate(await getToday());
  const budgetOf = (id: string) => budgets.find((b) => b.bucket_id === id && b.starts <= today && (!b.ends || b.ends >= today));
  const tree = bucketTree(h.buckets);
  const bucketCaption = (b: Bucket) => {
    const budget = budgetOf(b.id);
    return [
      kindLabel(b.kind),
      budget && `${formatCents(budget.amount_cents, { sign: false })} a ${budget.period}`,
      b.target_cents && `goal ${formatCents(b.target_cents, { sign: false })}`,
      b.archived && "archived",
    ].filter(Boolean).join(" · ");
  };
  const archiveButton = (b: Bucket) => (
    <form action={setBucketArchived.bind(null, b.id, !b.archived)}>
      <button className="nl-btn nl-btn-sm nl-btn-ghost">{b.archived ? "Restore" : "Archive"}</button>
    </form>
  );
  const bucketRow = (b: Bucket, child = false) => (
    <div key={b.id} className={`list-row${child ? " bucket-child" : ""}${b.archived ? " is-hidden" : ""}`}>
      <BucketIconButton id={b.id} icon={b.icon} color={b.color} />
      <div className="list-row-main">
        <div>{b.name}</div>
        <p className="caption">{bucketCaption(b)}</p>
      </div>
      {archiveButton(b)}
    </div>
  );

  const add = (label: string, form: React.ReactNode) => (
    <details className="group-add">
      <summary><Plus {...iconProps} size={18} />{label}</summary>
      {form}
    </details>
  );

  return (
    <div className="settings">
      <h1 className="title">Settings</h1>

      <div className="settings-col">
      <section className="group" aria-labelledby="s-you">
        <h2 className="group-title" id="s-you">You</h2>
        <div className="nl-card you-card">
          <div className="list-row">
            <AvatarPicker name={h.me.display_name} avatar={h.me.avatar ?? null} />
            <div className="list-row-main"><div>Picture</div><p className="caption">A photo or an emoji, beside your name</p></div>
          </div>
          <NameForm name={h.me.display_name} />
          {add("Set a password", <PasswordForm />)}
        </div>
      </section>

      <section className="group" aria-labelledby="s-home">
        <h2 className="group-title" id="s-home">Household</h2>
        <div className="nl-card">
          {h.members.map((m) => (
            <div key={m.user_id} className="list-row">
              <Avatar name={m.display_name} avatar={m.avatar} />
              <div className="list-row-main">
                <div className="member-name">{m.display_name}{m.user_id === h.userId && <span className="you-tag">(you)</span>}</div>
                <p className="caption">{m.email}</p>
              </div>
            </div>
          ))}
          {invites.map((i) => (
            <div key={i.email} className="list-row">
              <Avatar name={i.email} pending />
              <div className="list-row-main"><div>{i.email}</div><p className="caption">{i.expires_at && new Date(i.expires_at) < new Date() ? "Join link ran out" : "Invited, hasn’t joined yet"}</p></div>
              {isOwner && <RenewInvite email={i.email} />}
            </div>
          ))}
          {isOwner && add(h.members.length + invites.length < 2 ? "Invite your partner" : "Invite someone else", <InviteForm />)}
        </div>
        <p className="group-note">
          {isOwner
            ? "You get a link to send them. They open it, pick a password and see everything in the household. Nobody else can get in."
            : `Only ${owner?.display_name ?? "the owner"} can invite people. Nobody else can get in.`}
        </p>
      </section>

      <section className="group" aria-labelledby="s-look">
        <h2 className="group-title" id="s-look">Appearance</h2>
        <div className="nl-card">
          <div className="list-row">
            <div className="list-row-main"><div>Theme</div><p className="caption">System follows your phone or computer. Saved on this device.</p></div>
            <ThemeSwitch initial={await getTheme()} />
          </div>
        </div>
      </section>

      <form action={signOut}>
        <button className="nl-btn nl-btn-md nl-btn-secondary btn-block"><LogOut {...iconProps} size={18} />Sign out</button>
      </form>
      </div>
      <div className="settings-col">
      <section className="group" aria-labelledby="s-acc">
        <h2 className="group-title" id="s-acc">Accounts</h2>
        <div className="nl-card">
          {h.accounts.map((a) => (
            <div key={a.id} className={`list-row${a.archived ? " is-hidden" : ""}`}>
              <div className="list-row-main">
                <div>{a.name}</div>
                <p className="caption">
                  {[a.institution, kindLabel(a.kind), a.is_debt && "owed", a.currency !== CURRENCY && a.currency, a.archived && "hidden"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <form action={setAccountArchived.bind(null, a.id, !a.archived)}>
                <button className="nl-btn nl-btn-sm nl-btn-ghost">{a.archived ? "Show" : "Hide"}</button>
              </form>
            </div>
          ))}
          {add("Add an account", <AccountForm />)}
        </div>
      </section>

      <section className="group" aria-labelledby="s-buckets">
        <h2 className="group-title" id="s-buckets">Buckets</h2>
        <div className="nl-card">
          {add("Add a bucket", <BucketForm parents={tree.filter(({ bucket }) => !bucket.archived && !bucket.parent_id).map(({ bucket: b }) => ({ id: b.id, name: b.name, kind: b.kind, icon: b.icon, color: b.color }))} />)}
          {tree.map(({ bucket: b, depth }, i) => {
            if (depth > 0) return null;
            // the tree lists each bucket's family right after it, so everything up to the next top-level one is inside
            const next = tree.findIndex((t, j) => j > i && t.depth === 0);
            const inside = tree.slice(i + 1, next < 0 ? undefined : next).map((t) => t.bucket);
            if (!inside.length) return bucketRow(b);
            return (
              <BucketFamily key={b.id} icon={<BucketIconButton id={b.id} icon={b.icon} color={b.color} />} name={b.name}
                caption={bucketCaption(b)} count={inside.length} end={archiveButton(b)}>
                {inside.map((child) => bucketRow(child, true))}
              </BucketFamily>
            );
          })}
        </div>
        <p className="group-note">Categories and goals. A new bucket shows up in every chart and picker straight away. Your AI agent can add them too.</p>
      </section>

      </div>
    </div>
  );
}
