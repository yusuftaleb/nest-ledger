import { Peek } from "@/components/peek";

// The peek opens the instant a number is tapped, and fills in when the transactions arrive.
export default function Loading() {
  return (
    <Peek href="/transactions" label="Transactions">
      <div className="peek-loading" aria-hidden>
        <span className="sk sk-line-lg" /><span className="sk sk-line-sm" />
        <span className="sk peek-sk-form" />
      </div>
    </Peek>
  );
}
