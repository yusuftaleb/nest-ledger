// A guess at a bucket's icon from its name, so most new buckets need no picking (the picker is icon-picker.tsx).

// first match wins, so the more specific words come first
const GUESSES: [RegExp, string][] = [
  [/diaper|wipe/, "package"], [/formula|bottle/, "milk"], [/toy/, "toy-brick"], [/daycare|child ?care|baby|infant/, "baby"],
  [/grocer|supermarket|food bank/, "shopping-cart"], [/coffee|cafe|tim ?horton/, "coffee"], [/restaurant|dining|eating|takeout|take-out|food|lunch/, "utensils"],
  [/rent|housing|mortgage|home/, "house"], [/hydro|electric|utilit|power/, "zap"], [/water/, "droplet"], [/internet|wifi/, "wifi"], [/phone|mobile|cell/, "smartphone"],
  [/subscri|streaming|netflix|spotify/, "repeat"], [/gas|fuel/, "fuel"], [/parking/, "square-parking"], [/flight|airfare|plane/, "plane"],
  [/hotel|accommodation|airbnb|travel/, "bed"], [/vehicle|car\b|auto/, "car"], [/transit|bus|transport/, "bus"], [/insurance/, "shield-check"],
  [/cloth|apparel|shoe/, "shirt"], [/jewel|accessor/, "gem"], [/hair|barber|salon/, "scissors"], [/pharmac|medic|drug|prescription/, "pill"],
  [/dent|doctor|clinic|health/, "heart-pulse"], [/gym|fitness|sport/, "dumbbell"], [/tuition|school|education|course/, "graduation-cap"],
  [/book|librar/, "book-open"], [/scholarship|bursar|award|grant/, "award"], [/salary|wage|payroll|\bta\b|job|work/, "briefcase"],
  [/benefit|credit\b|gst|hst|government/, "landmark"], [/loan|debt|borrow|lend|lent|owe/, "hand-coins"], [/card payment|credit card/, "credit-card"],
  [/transfer|between/, "arrow-left-right"], [/saving|emergency|fund/, "piggy-bank"], [/fee|interest|charge/, "receipt"],
  [/sale|sold|marketplace|kijiji/, "store"], [/thrift|shopping|purchase/, "shopping-bag"], [/donat|charit|church|mosque|zakat|sadaqa/, "heart-handshake"],
  [/gift|present/, "gift"], [/party|celebrat|eid|birthday/, "party-popper"], [/movie|cinema|film/, "film"], [/music|concert/, "music"],
  [/game/, "gamepad-2"], [/outdoor|hike|camp|park/, "mountain"], [/entertain|fun|museum/, "popcorn"], [/camera|photo/, "camera"],
  [/software|app|digital|computer|electronic/, "laptop"], [/clean|household|supplies/, "spray-can"], [/furniture/, "sofa"],
  [/repair|maintenance|tool/, "wrench"], [/pet|vet\b/, "paw-print"], [/cash ?back|reward/, "badge-dollar-sign"], [/income|pay\b|cash/, "banknote"],
];

/** A Lucide icon name that fits a bucket's name, or null when nothing obvious does. */
export function guessIcon(name: string): string | null {
  const n = name.toLowerCase();
  return GUESSES.find(([re]) => re.test(n))?.[1] ?? null;
}
