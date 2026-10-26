import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { needsSetup } from "@/lib/supabase/admin";
import { LoginForm } from "./login-form";

/** This copy can email sign-in codes: it has its own email sender (custom SMTP in Supabase). */
const CODES = process.env.NEXT_PUBLIC_EMAIL_CODES === "1";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  if (await needsSetup()) redirect("/setup");
  return (
    <main className="login">
      <section className="login-intro">
        <LogoMark size={56} />
        <h1 className="login-title">Nest Ledger</h1>
        <p className="login-lede">Our money in one place: what came in, what went out, and what is left for the month.</p>
      </section>
      <section className="login-panel" aria-labelledby="signin">
        <h2 className="heading" id="signin">Sign in</h2>
        <p className="caption">Only people in this household can sign in.</p>
        {error && (
          <p className="msg msg-err" role="alert">
            {error === "private" ? "This Nest Ledger is private. Ask its owner to invite you." : "That sign-in link has expired. Send a new code."}
          </p>
        )}
        <LoginForm codes={CODES} />
      </section>
    </main>
  );
}
