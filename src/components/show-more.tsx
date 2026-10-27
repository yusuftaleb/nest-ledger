"use client";

import { useState } from "react";

/**
 * Sits under a list whose rows past the first few carry `data-extra`. Pressing it shows them in place, so the
 * list simply continues, and it turns into "Show less". Folding back keeps the button where the eye is.
 */
export function ShowMore({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget, list = button.previousElementSibling as HTMLElement | null;
    if (!list) return;
    list.dataset.more = open ? "less" : "all";
    setOpen(!open);
    if (open && button.getBoundingClientRect().top < 0) button.scrollIntoView({ block: "center" });
  };
  return (
    <button type="button" className="more" aria-expanded={open} onClick={toggle}>
      {open ? "Show less" : `Show ${count} more`}
    </button>
  );
}
