"use client";

import { useActionState } from "react";
import { setUp, type SetupState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(setUp, null as SetupState);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Setup password</span>
        <input className="input" name="setup_password" type="password" autoComplete="off" required autoFocus />
      </label>
      <p className="caption">The SETUP_PASSWORD you added to the server’s settings. It’s only used this once.</p>
      <label className="field">
        <span>Your name</span>
        <input className="input" name="name" autoComplete="given-name" defaultValue={state?.name} required />
      </label>
      <label className="field">
        <span>Household name</span>
        <input className="input" name="household" placeholder="e.g. The Garcias" defaultValue={state?.household} />
      </label>
      <label className="field">
        <span>Your email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state?.email} required />
      </label>
      <label className="field">
        <span>Choose a password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {state?.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      <button className="nl-btn nl-btn-md nl-btn-primary btn-block" disabled={pending}>{pending ? "Setting up…" : "Set up Nest Ledger"}</button>
    </form>
  );
}
