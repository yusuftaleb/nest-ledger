import { AppShell } from "@/components/app-shell";
import { getHousehold } from "@/lib/household";
import { getTheme } from "@/lib/theme";

// `peek` is a transaction opened over the current page (see @peek); it's empty everywhere else.
export default async function AppLayout({ children, peek }: { children: React.ReactNode; peek: React.ReactNode }) {
  await getHousehold(); // signs in to the household (first visit creates it)
  return <AppShell theme={await getTheme()}>{children}{peek}</AppShell>;
}
