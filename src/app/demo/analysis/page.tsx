import { AnalysisPage } from "@/components/analysis-page";
import { demoSource } from "@/lib/demo";

export const metadata = { title: "Demo analysis" };

export default async function DemoAnalysis({ searchParams }: PageProps<"/demo/analysis">) {
  return <AnalysisPage source={demoSource()} params={(await searchParams) as Record<string, string>}
    saved={[{ id: "v1", name: "Baby costs this year", query: "q=baby+this+year&g=bucket" }]} />;
}
