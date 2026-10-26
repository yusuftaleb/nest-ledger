"use client";

import { DynamicIcon, type IconName } from "lucide-react/dynamic";

const iconProps = { strokeWidth: 1.75, className: "nl-icon", "aria-hidden": true } as const;

/** Any Lucide icon by its kebab-case name; unknown names show a neutral icon instead of nothing. */
export function LucideByName({ name, size }: { name: string; size: number }) {
  const fallback = () => <DynamicIcon {...iconProps} size={size} name="circle-ellipsis" />;
  return <DynamicIcon {...iconProps} size={size} name={(name || "circle-ellipsis") as IconName} fallback={fallback} />;
}
