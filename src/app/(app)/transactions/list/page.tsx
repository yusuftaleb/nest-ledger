import { ChevronLeft } from "lucide-react";
import { iconProps } from "@/components/icons";
import { BackLink } from "@/components/back-link";
import { MatchList } from "@/components/match-list";

export const metadata = { title: "Transactions" };

// The transactions behind a number on Home, from a shared link or a refresh; inside the app it opens as a peek.
export default async function MatchPage({ searchParams }: PageProps<"/transactions/list">) {
  const { q, t } = (await searchParams) as { q?: string; t?: string };
  return (
    <div className="form-page">
      <BackLink href="/"><ChevronLeft {...iconProps} size={18} />Home</BackLink>
      <MatchList q={q ?? ""} title={t} />
    </div>
  );
}
