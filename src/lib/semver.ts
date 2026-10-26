/** "0.2.0" from "v0.2.0" or "0.2.0", or null if it isn't a plain version. */
export function cleanVersion(v: string): string | null {
  const m = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` : null;
}

/** Whether `candidate` is a later version than `current` (both like "1.4.2" or "v1.4.2"). */
export function isNewer(candidate: string, current: string): boolean {
  const a = cleanVersion(candidate)?.split(".").map(Number), b = cleanVersion(current)?.split(".").map(Number);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
