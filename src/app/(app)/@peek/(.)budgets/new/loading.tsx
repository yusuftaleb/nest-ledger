import { Peek } from "@/components/peek";

export default function Loading() {
  return (
    <Peek href="/budgets/new" label="Budget">
      <div className="peek-loading" aria-hidden>
        <span className="sk sk-line-sm" /><span className="sk sk-line-lg" />
        <span className="sk peek-sk-form" />
      </div>
    </Peek>
  );
}
