import { CircleAlert, CircleCheck } from "lucide-react";
import { formatCents } from "@/lib/money";

/**
 * A money amount. Color follows direction (green = money in), so a positive *spending total* must pass
 * tone="neutral" or it would read as income.
 */
export function Amount({ cents, hero, plain, tone: forced }: { cents: number; hero?: boolean; plain?: boolean; tone?: "neutral" | "out" }) {
  const tone = forced === "neutral" ? "nl-amt-zero" : forced === "out" || cents < 0 ? "nl-amt-out" : cents > 0 ? "nl-amt-in" : "nl-amt-zero";
  return (
    <span className={`nl-amt ${tone}${hero ? " nl-amt-hero" : ""}`}>{formatCents(cents, { sign: !plain })}</span>
  );
}

export function StatusBadge({ status }: { status: "verified" | "review" }) {
  const Glyph = status === "verified" ? CircleCheck : CircleAlert;
  return (
    <span className={`nl-badge nl-badge-${status}`}>
      <Glyph size={14} strokeWidth={2} aria-hidden />
      {status === "verified" ? "Matched" : "Review"}
    </span>
  );
}
