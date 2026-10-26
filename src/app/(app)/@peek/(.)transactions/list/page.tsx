import { Peek } from "@/components/peek";
import { MatchList } from "@/components/match-list";

// The transactions behind a number, as a peek over the page the number was on.
export default async function MatchPeek({ searchParams }: PageProps<"/transactions/list">) {
  const { q, t } = (await searchParams) as { q?: string; t?: string };
  const query = new URLSearchParams({ ...(q ? { q } : {}), ...(t ? { t } : {}) }).toString();
  return (
    <Peek href={`/transactions/list?${query}`} label={t ?? "Transactions"}>
      <MatchList q={q ?? ""} title={t} />
    </Peek>
  );
}
