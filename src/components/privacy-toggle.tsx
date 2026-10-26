"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";

const root = () => document.documentElement;
const subscribe = (change: () => void) => {
  const watch = new MutationObserver(change);
  watch.observe(root(), { attributes: true, attributeFilter: ["data-private"] });
  return () => watch.disconnect();
};

/**
 * Hides or shows account balances everywhere (a `data-private` flag on <html>). The choice is a cookie the
 * server reads, so hidden numbers never flash on load. The flag on <html> is the only truth: a page reused
 * from the browser's cache may carry an older `hidden`, so the button reads the flag rather than its props.
 */
export function PrivacyToggle({ hidden: initial }: { hidden: boolean }) {
  const hidden = useSyncExternalStore(subscribe, () => root().hasAttribute("data-private"), () => initial);
  const toggle = () => {
    const next = !root().hasAttribute("data-private");
    root().toggleAttribute("data-private", next);
    document.cookie = `nl_private=${next ? "1" : ""}; path=/; max-age=${next ? 31536000 : 0}; samesite=lax`;
  };
  return (
    <button type="button" className="privacy-toggle" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Show balances" : "Hide balances"}
      title={hidden ? "Show balances" : "Hide balances"}>
      {hidden ? <EyeOff size={18} strokeWidth={1.75} aria-hidden /> : <Eye size={18} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
