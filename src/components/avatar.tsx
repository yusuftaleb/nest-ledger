/* eslint-disable @next/next/no-img-element -- a ~5 KB inline data URL: next/image would only add a round trip */

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** A member's face: their photo, their emoji, or their initials. */
export function Avatar({ name, avatar, size = 32, pending }: { name: string; avatar?: string | null; size?: number; pending?: boolean }) {
  const style = { "--avatar": `${size}px` } as React.CSSProperties;
  const cls = `avatar${pending ? " avatar-pending" : ""}`;
  if (avatar?.startsWith("data:image/")) return <img className={`${cls} avatar-photo`} style={style} src={avatar} alt="" width={size} height={size} />;
  if (avatar) return <span className={`${cls} avatar-emoji`} style={style} aria-hidden>{avatar}</span>;
  return <span className={cls} style={style} aria-hidden>{initials(name) || "?"}</span>;
}
