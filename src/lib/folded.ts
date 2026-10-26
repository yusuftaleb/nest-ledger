import { cookies } from "next/headers";

/** The cards and sections the viewer has folded (ids from the `nl_folded` cookie). */
export async function getFolded(): Promise<Set<string>> {
  const raw = (await cookies()).get("nl_folded")?.value ?? "";
  return new Set(decodeURIComponent(raw).split(",").filter(Boolean));
}
