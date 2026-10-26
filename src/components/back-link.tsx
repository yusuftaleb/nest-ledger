"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Goes back the way you came, so Activity returns with its filters, folded months and scroll position.
 * Opened straight from a link or a new tab (nothing to go back to), it falls back to `href`.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link href={href} className="back" onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || window.history.length <= 1) return;
      e.preventDefault();
      router.back();
    }}>{children}</Link>
  );
}
