import { SideNav } from "./side-nav";
import { TabBar } from "./tab-bar";
import type { Theme } from "./theme-switch";
import { UndoBar } from "./undo";
import { Shortcuts } from "./shortcuts";

/** Side navigation on desktop, bottom tab bar on phones. `base` = "/demo" for the dev-only preview. */
export function AppShell({ children, theme, base = "" }: { children: React.ReactNode; theme: Theme; base?: string }) {
  return (
    <div className="app">
      <SideNav theme={theme} base={base} />
      <main className="app-main" id="main">{children}</main>
      <TabBar base={base} />
      <UndoBar />
      <Shortcuts />
    </div>
  );
}
