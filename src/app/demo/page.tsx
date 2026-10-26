import { DashboardPage } from "@/components/dashboard-page";
import { getToday } from "@/lib/today";
import { asPeriod } from "@/lib/dashboard";
import { demoSource } from "@/lib/demo";

export const metadata = { title: "Demo" };

export default async function DemoHome({ searchParams }: PageProps<"/demo">) {
  const { p, at } = (await searchParams) as { p?: string; at?: string };
  return <DashboardPage source={demoSource()} page="home" period={asPeriod(p)} at={at} today={await getToday()} path="/demo" />;
}
