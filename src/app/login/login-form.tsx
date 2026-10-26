"use client";

import { useActionState, useState } from "react";
import { sendCode, signInWithPassword, verifyCode, type LoginState } from "./actions";

/** Email and password; with `codes` (this copy can send email), an emailed 6-digit code instead. */
export function LoginForm({ codes }: { codes: boolean }) {
  const [byCode, setByCode] = useState(false);
  return byCode ? <CodeForm onPassword={() => setByCode(false)} /> : <PasswordForm onCode={codes ? () => setByCode(true) : undefined} />;
}

function PasswordForm({ onCode }: { onCode?: () => void }) {
  const [state, action, pending] = useActionState(signInWithPassword, { step: "password" } as LoginState);
  return (
    <form action={action} className="form">
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="msg msg-err" role="alert">{state.error}</p>}
      <button className="nl-btn nl-btn-md nl-btn-primary btn-block" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {onCode && <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost btn-block" onClick={onCode}>Email me a code instead</button>}
    </form>
  );
}

function CodeForm({ onPassword }: { onPassword: () => void }) {
  const [sent, send, sending] = useActionState(sendCode, { step: "email" } as LoginState);
  const [checked, verify, verifying] = useActionState(verifyCode, { step: "code" } as LoginState);

  if (sent.step === "email") {
    return (
      <form action={send} className="form">
        <label className="field">
          <span>Email</span>
          <input className="input" name="email" type="email" autoComplete="email" inputMode="email"
            defaultValue={sent.email} required autoFocus />
        </label>
        {sent.error && <p className="msg msg-err" role="alert">{sent.error}</p>}
        <button className="nl-btn nl-btn-md nl-btn-primary btn-block" disabled={sending}>
          {sending ? "Sending…" : "Email me a code"}
        </button>
        <button type="button" className="nl-btn nl-btn-sm nl-btn-ghost btn-block" onClick={onPassword}>Use my password</button>
      </form>
    );
  }

  return (
    <form action={verify} className="form">
      <p className="msg msg-ok" role="status">
        If <strong>{sent.email}</strong> is part of this household, a code is on its way. Type it here, or tap the link in the email.
      </p>
      <input type="hidden" name="email" value={sent.email} />
      <label className="field">
        <span>Code</span>
        <input className="input input-big" name="code" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9 ]{6,10}" required autoFocus />
      </label>
      {checked.error && <p className="msg msg-err" role="alert">{checked.error}</p>}
      <button className="nl-btn nl-btn-md nl-btn-primary btn-block" disabled={verifying}>
        {verifying ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
