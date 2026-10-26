import { Peek } from "@/components/peek";

// The peek opens the instant a row is tapped, and fills in when the transaction arrives.
export default function Loading() {
  return (
    <Peek href="/transactions" label="Transaction">
      <div className="peek-loading" aria-hidden>
        <span className="sk sk-line-lg" /><span className="sk sk-line-sm" />
        <span className="sk peek-sk-form" />
      </div>
    </Peek>
  );
}
