import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { inviteFor } from "@/lib/setup";
import { JoinForm } from "./join-form";

export const metadata = { title: "Join" };

/** Where a join link lands: pick a password for the invited email and you're in the household. */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const invite = await inviteFor(token);
  return (
    <main className="login">
      <section className="login-intro">
        <LogoMark size={56} />
        <h1 className="login-title">{invite ? `Join ${invite.household}` : "Nest Ledger"}</h1>
        <p className="login-lede">A shared money notebook for your household: what came in, what went out, and what is left.</p>
      </section>
      <section className="login-panel" aria-labelledby="join">
        <h2 className="heading" id="join">{invite ? "Create your account" : "This link doesn’t work any more"}</h2>
        {invite ? (
          <JoinForm token={token} email={invite.email} />
        ) : (
          <p className="caption">It ran out, was used already, or was replaced by a newer one. Ask for a new join link, or <Link href="/login">sign in</Link> if you already have an account.</p>
        )}
      </section>
    </main>
  );
}
