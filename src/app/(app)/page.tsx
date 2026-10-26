import { DashboardPage } from "@/components/dashboard-page";
import { getToday } from "@/lib/today";
import { asPeriod } from "@/lib/dashboard";
import { supabaseSource } from "@/lib/dashboard-source";
import { getHousehold } from "@/lib/household";
import { CheckInNudge } from "@/components/checkin-nudge";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { p, at } = (await searchParams) as { p?: string; at?: string };
  return <DashboardPage source={supabaseSource(await getHousehold())} page="home" period={asPeriod(p)} at={at} today={await getToday()} path="/" nudge={<CheckInNudge />} />;
}
