/** Placeholder cards in the dashboard's own grid, shown while a page's data is on its way. */
export function BoardSkeleton({ summary = true }: { summary?: boolean }) {
  return (
    <div className="board" aria-busy="true" aria-label="Loading">
      {summary && (
        <div className="summary span-full sk-summary" aria-hidden>
          <span className="sk sk-line-sm" /><span className="sk sk-line-xl" /><span className="sk sk-line-md" />
        </div>
      )}
      {["wide", "third", "half", "half", "third", "third", "third"].map((span, i) => (
        <div key={i} className={`tile span-${span} sk-tile`} aria-hidden>
          <span className="sk sk-line-md" /><span className="sk sk-block" />
        </div>
      ))}
    </div>
  );
}
