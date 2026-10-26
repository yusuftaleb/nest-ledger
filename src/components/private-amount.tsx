/**
 * A balance that the eye toggle can hide. Both the number and a row of asterisks are always drawn in the
 * same spot; `data-private` on <html> crossfades between them, so hiding needs no JavaScript and never flashes.
 */
export function Private({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`private-amt${className ? ` ${className}` : ""}`}>
      <span className="private-real">{children}</span>
      <span className="private-mask" aria-hidden>∗∗∗∗∗</span>
    </span>
  );
}
