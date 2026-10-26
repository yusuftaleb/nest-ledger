"use client";

import { useActionState } from "react";
import { join, type JoinState } from "./actions";

export function JoinForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(join.bind(null, token), null as JoinState);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Email</span>
        <input className="input" value={email} readOnly autoComplete="email" />
      </label>
      <label className="field">
        <span>Your name</span>
        <input className="input" name="name" autoComplete="given-name" defaultValue={state?.name} required autoFocus />
      </label>
      <label className="field">
        <span>Choose a password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      <button className="nl-btn nl-btn-md nl-btn-primary btn-block" disabled={pending}>{pending ? "Joining…" : "Join"}</button>
    </form>
  );
}
