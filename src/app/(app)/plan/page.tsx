import { DashboardPage } from "@/components/dashboard-page";
import { getToday } from "@/lib/today";
import { asPeriod } from "@/lib/dashboard";
import { supabaseSource } from "@/lib/dashboard-source";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Plan" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { p, at } = (await searchParams) as { p?: string; at?: string };
  return <DashboardPage source={supabaseSource(await getHousehold())} page="plan" period={asPeriod(p)} at={at} today={await getToday()} path="/plan" />;
}
