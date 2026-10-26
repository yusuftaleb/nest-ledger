import { AnalysisPage } from "@/components/analysis-page";
import type { SavedView } from "@/components/explorer";
import { supabaseSource } from "@/lib/dashboard-source";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Analysis" };

export default async function Analysis({ searchParams }: PageProps<"/analysis">) {
  const h = await getHousehold();
  // not awaited here: the page reads it alongside the lines
  const saved = h.supabase.from("saved_views").select("id, name, query").eq("page", "analysis").order("sort").order("name")
    .then(({ data }) => (data ?? []) as SavedView[]);
  return <AnalysisPage source={supabaseSource(h)} params={(await searchParams) as Record<string, string>} saved={saved} />;
}
