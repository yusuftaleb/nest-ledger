import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getTheme } from "@/lib/theme";

// Dev-only preview of the dashboard with a made-up household (src/lib/demo.ts). Never served in production.
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <AppShell theme={await getTheme()} base="/demo">{children}</AppShell>;
}
