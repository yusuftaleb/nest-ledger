import { seedColor } from "@/lib/buckets";
import { LucideByName } from "./lucide-by-name";

export const iconProps = { size: 20, strokeWidth: 1.75, className: "nl-icon", "aria-hidden": true } as const;

/**
 * Bucket colors are stored as text: "1"–"8" pick from the app palette, anything else is used as a CSS color.
 * Empty picks a palette color from the seed (usually the bucket id) so it stays the same everywhere.
 */
export function bucketColor(color: string | null | undefined, seed = ""): string {
  if (color && /^[1-8]$/.test(color.trim())) return `var(--cat-${color.trim()})`;
  if (color) return color;
  return seed ? `var(--cat-${seedColor(seed)})` : "var(--cat-8)";
}

/** Icons are stored by Lucide name ("shopping-cart"), so any icon an agent picks renders without a code change. */
export function CategoryIcon({ icon, color, seed, small }: { icon?: string | null; color?: string | null; seed?: string; small?: boolean }) {
  const size = small ? 16 : 20;
  return (
    <span
      className={small ? "nl-caticon nl-caticon-sm" : "nl-caticon"}
      style={{ "--c": bucketColor(color, seed) } as React.CSSProperties}
    >
      <LucideByName name={icon ?? ""} size={size} />
    </span>
  );
}
