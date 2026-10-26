import { money } from "./charts";

/**
 * A goal drawn as a nest egg that fills from the bottom as money is saved: the logo's egg, put to work.
 * The fill height is the share saved; the numbers are always written underneath too.
 */
export function GoalEgg({ id, name, saved, target, note, reached }: {
  id: string; name: string; saved: number; target: number; note?: string; reached: boolean;
}) {
  const share = target > 0 ? Math.min(saved / target, 1) : 0;
  const clip = `egg-${id.replace(/[^a-z0-9]/gi, "")}`;
  // egg spans y 4..60 in a 48×64 box
  const top = 60 - 56 * share;
  return (
    <figure className={`goal${reached ? " reached" : ""}`}>
      <svg className="goal-egg" viewBox="0 0 48 64" role="img" aria-label={`${name}: ${Math.round(share * 100)}% saved`}>
        <defs>
          <clipPath id={clip}><path d="M24 4c10.5 0 19 16 19 31.5C43 50 34.5 60 24 60S5 50 5 35.5C5 20 13.5 4 24 4Z" /></clipPath>
        </defs>
        <path d="M24 4c10.5 0 19 16 19 31.5C43 50 34.5 60 24 60S5 50 5 35.5C5 20 13.5 4 24 4Z" className="goal-shell" />
        <g clipPath={`url(#${clip})`}>
          <rect x="0" y={top} width="48" height={64 - top} className="goal-fill" />
          {share > 0.02 && <path d={`M0 ${top} Q12 ${top - 2.5} 24 ${top} T48 ${top}`} className="goal-wave" />}
        </g>
        <circle cx="17" cy="22" r="1.6" className="goal-speck" /><circle cx="29" cy="17" r="1.1" className="goal-speck" />
        <circle cx="31" cy="30" r="1.8" className="goal-speck" /><circle cx="20" cy="40" r="1.2" className="goal-speck" />
      </svg>
      <figcaption>
        <span className="goal-name">{name}</span>
        <span className="goal-pct nl-amt">{reached ? "Reached" : `${Math.round(share * 100)}%`}</span>
        <span className="caption">{money(Math.min(saved, target))} of {money(target)}</span>
        {note && <span className="caption">{note}</span>}
      </figcaption>
    </figure>
  );
}
