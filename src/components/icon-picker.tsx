"use client";

import { useEffect, useRef, useState } from "react";
import { ShoppingCart, Utensils, Coffee, House, Zap, Wifi, Smartphone, Repeat, Bus, Car, Fuel, SquareParking, Plane, Bed, Baby, Milk, ToyBrick, Shirt, Gem, Scissors, HeartPulse, Pill, Stethoscope, Dumbbell, GraduationCap, BookOpen, Backpack, Award, Briefcase, Banknote, Wallet, PiggyBank, Landmark, CreditCard, HandCoins, ArrowLeftRight, Receipt, ShoppingBag, Store, Gift, HeartHandshake, PartyPopper, Popcorn, Film, Music, Gamepad2, Mountain, Camera, Laptop, SprayCan, Sofa, Wrench, PawPrint, ShieldCheck, Users, CircleEllipsis, type LucideIcon } from "lucide-react";
import { CategoryIcon, bucketColor } from "./icons";

// the icons households reach for, bundled so the grid opens at once; any other Lucide name still works
const CHOICES: Record<string, LucideIcon> = { "shopping-cart": ShoppingCart, "utensils": Utensils, "coffee": Coffee, "house": House, "zap": Zap, "wifi": Wifi, "smartphone": Smartphone, "repeat": Repeat, "bus": Bus, "car": Car, "fuel": Fuel, "square-parking": SquareParking, "plane": Plane, "bed": Bed, "baby": Baby, "milk": Milk, "toy-brick": ToyBrick, "shirt": Shirt, "gem": Gem, "scissors": Scissors, "heart-pulse": HeartPulse, "pill": Pill, "stethoscope": Stethoscope, "dumbbell": Dumbbell, "graduation-cap": GraduationCap, "book-open": BookOpen, "backpack": Backpack, "award": Award, "briefcase": Briefcase, "banknote": Banknote, "wallet": Wallet, "piggy-bank": PiggyBank, "landmark": Landmark, "credit-card": CreditCard, "hand-coins": HandCoins, "arrow-left-right": ArrowLeftRight, "receipt": Receipt, "shopping-bag": ShoppingBag, "store": Store, "gift": Gift, "heart-handshake": HeartHandshake, "party-popper": PartyPopper, "popcorn": Popcorn, "film": Film, "music": Music, "gamepad-2": Gamepad2, "mountain": Mountain, "camera": Camera, "laptop": Laptop, "spray-can": SprayCan, "sofa": Sofa, "wrench": Wrench, "paw-print": PawPrint, "shield-check": ShieldCheck, "users": Users, "circle-ellipsis": CircleEllipsis };

/**
 * A bucket's icon: the button shows the current one, a grid picks another. With `name` it fills a form field;
 * with `onPick` it reports the choice (and `pending` greys it while that saves).
 */
export function IconPicker({ value, color, seed, name, onPick, pending, small, label = "Icon" }: {
  value: string | null; color?: string | null; seed?: string; name?: string;
  onPick?: (icon: string) => void; pending?: boolean; small?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const Chosen = value ? CHOICES[value] : undefined;
  const choose = (icon: string) => { onPick?.(icon); setOpen(false); setTyped(""); };

  return (
    <div className="icon-picker" ref={root}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <button type="button" className="icon-picker-button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${value || "none"}`}
        disabled={pending} onClick={() => setOpen((o) => !o)}>
        {/* bundled icons draw straight away, so typing a name never flashes an older guess */}
        {Chosen ? (
          <span className={small ? "nl-caticon nl-caticon-sm" : "nl-caticon"} style={{ "--c": bucketColor(color, seed) } as React.CSSProperties}>
            <Chosen size={small ? 16 : 20} strokeWidth={1.75} className="nl-icon" aria-hidden />
          </span>
        ) : <CategoryIcon icon={value} color={color} seed={seed} small={small} />}
      </button>
      {open && (
        <div className="menu-pop start icon-pop" role="dialog" aria-label={`Pick ${label.toLowerCase()}`}
          style={{ "--c": bucketColor(color, seed) } as React.CSSProperties}>
          <div className="icon-grid">
            {Object.entries(CHOICES).map(([key, Icon]) => (
              <button key={key} type="button" className="icon-cell" aria-pressed={key === value} title={key.replace(/-/g, " ")}
                onClick={() => choose(key)}>
                <Icon size={18} strokeWidth={1.75} aria-hidden />
              </button>
            ))}
          </div>
          {/* not a <form>: the picker usually sits inside one; Enter takes the typed name */}
          <div className="icon-other">
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Another from lucide.dev, e.g. tent"
              autoCapitalize="off" autoComplete="off" spellCheck={false} aria-label="Another icon name"
              onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); const v = typed.trim().toLowerCase().replace(/\s+/g, "-"); if (v) choose(v); }} />
          </div>
        </div>
      )}
    </div>
  );
}
