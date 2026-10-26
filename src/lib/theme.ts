import { cookies } from "next/headers";
import type { Theme } from "@/components/theme-switch";

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get("theme")?.value;
  return v === "light" || v === "dark" ? v : "system";
}
