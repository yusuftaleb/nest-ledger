import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { missingSetupSettings, needsSetup } from "@/lib/supabase/admin";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Set up" };

/** The first visit to a new copy: whoever knows the setup password becomes the household's owner. */
export default async function SetupPage() {
  const missing = missingSetupSettings();
  const open = missing.length === 0 && (await needsSetup());
  return (
    <main className="login">
      <section className="login-intro">
        <LogoMark size={56} />
        <h1 className="login-title">Set up Nest Ledger</h1>
        <p className="login-lede">You’ll be the owner of this household. You can invite your partner once you’re in.</p>
      </section>
      <section className="login-panel" aria-labelledby="setup">
        <h2 className="heading" id="setup">{open ? "Create your account" : missing.length ? "A few settings are missing" : "Already set up"}</h2>
        {missing.length > 0 ? (
          <>
            <p className="caption">Add these in Vercel → your project → Settings → Environment Variables, then redeploy. docs/SETUP.md says where each one comes from.</p>
            <ul className="setup-missing">{missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
          </>
        ) : open ? (
          <SetupForm />
        ) : (
          <p className="caption">This Nest Ledger already has an owner. <Link href="/login">Sign in</Link>, or ask the owner for a join link.</p>
        )}
      </section>
    </main>
  );
}
