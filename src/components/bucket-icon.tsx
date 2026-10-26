import { icons, CircleEllipsis, type LucideIcon } from "lucide-react";
import { bucketColor } from "./icons";

// Server-only icon lookup: bucket icons are stored by Lucide name ("shopping-cart"), so any icon an
// agent picks renders in the HTML itself, with no extra request. Client components use CategoryIcon.

const pascal = (name: string) => name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());

export function IconByName({ name, size = 20 }: { name?: string | null; size?: number }) {
  const Icon: LucideIcon = (name && icons[pascal(name) as keyof typeof icons]) || CircleEllipsis;
  return <Icon size={size} strokeWidth={1.75} className="nl-icon" aria-hidden />;
}

export function BucketIcon({ icon, color, seed, small }: { icon?: string | null; color?: string | null; seed?: string; small?: boolean }) {
  return (
    <span className={small ? "nl-caticon nl-caticon-sm" : "nl-caticon"} style={{ "--c": bucketColor(color, seed) } as React.CSSProperties}>
      <IconByName name={icon} size={small ? 16 : 20} />
    </span>
  );
}
