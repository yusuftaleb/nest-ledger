// Statement descriptions are shouty and noisy ("COSTCO WHOLESALE W1578 VANCOUVER BC"). For display only, tidy
// them ("Costco Wholesale"); the original text is never changed in the database.

const KEEP = new Set(["RBC", "CIBC", "TD", "BMO", "PC", "CRA", "GST", "HST", "GST/HST", "CCB", "OSAP", "NSLSC", "TA", "ATM", "USA", "CAD", "USD",
  "EUR", "EGP", "UBC", "UBCO", "IKEA", "H&M", "A&W", "T&T", "KFC", "IGA", "ESSO", "TTC", "UPS", "DHL", "LCBO", "BCL", "ICBC", "SAQ", "EI", "CPP", "RESP", "TFSA", "RRSP"]);
const PROVINCES = "BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU";
const SMALL = new Set(["and", "of", "the", "for", "to", "at", "in", "on", "de", "du", "la", "le"]);

const titleWord = (w: string, i: number) => {
  if (KEEP.has(w.toUpperCase())) return w.toUpperCase();
  const lower = w.toLowerCase();
  if (i > 0 && SMALL.has(lower)) return lower;
  // keep apostrophes and hyphenated parts readable: "TIM HORTON'S" → "Tim Horton's", "7-ELEVEN" → "7-Eleven"
  return lower.replace(/(^|[-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
};

// RBC chequing squeezes its descriptions: "ContactlessInteracpurchase- 9373 WALMARTSTORE#", "e-Transfersent Maria De Souza VLUGSN".
// The prefix says how the money moved, which the row already shows, so it goes; transfers keep who it was with.
const BANK_PREFIX = /^(?:ContactlessInteracpurchase|InteracPurchase|VisaDebitpurchase|VisaDebitreversal|OnlineBankingpayment|MiscPayment|BillPayment|BusinessPAD|AccountPayablePmt|CashManagement)\s*-?\s*(?:\d{4}\s+)?/i;
// card processors whose tag comes before the shop's name ("SQ *MIZU", "TST-TAHINIS", "PAYPAL*APPLE.C")
const PROCESSOR = /^(?:(?:SQ|TST|SP|PAYPAL|DD)\s*[*/-]|SP\s(?=\S+\s))\s*/i;
// chains the bank squeezes or cuts short, matched on capitals and digits only
const ALIASES: [RegExp, string][] = [
  [/^WALMART/, "Walmart"], [/^REALC(?:DN|ANADIAN)SUPER/, "Real Canadian Superstore"], [/TIMHORTON/, "Tim Hortons"],
  [/^THEHOMEDEPOT/, "The Home Depot"], [/^DOLLARAMA/, "Dollarama"], [/^APPLE(?:C|COM|COMBILL)?$/, "Apple"], [/^AMAZONCAPRIME/, "Amazon Prime"],
  [/^BELLMOBILITY/, "Bell Mobility"], [/^UBCPAYROLL/, "UBC payroll"], [/^KOODO/, "Koodo"], [/^OCEANWISE/, "Ocean Wise"],
  [/^UNIVERSITYOFB/, "UBC"], [/^PCFPAD/, "PC Financial"], [/^GOFUNDME/, "GoFundMe"], [/^BCF/, "BC Ferries"], [/^HSN$/, "HSN"],
  [/^OPENAI/, "OpenAI"], [/^PAYPAL/, "PayPal"], [/^DOORDASH/, "DoorDash"], [/^SHELL/, "Shell"], [/^WU$/, "Western Union"],
];
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const aliasOf = (s: string) => ALIASES.find(([re]) => re.test(key(s)))?.[1];
// "MariaDe Souza" → "Maria De Souza"; an all-capitals run is left for the re-casing below
const person = (s: string) => recase(s.replace(/([a-z])([A-Z])/g, "$1 $2"));
// the trailing reference on an e-Transfer ("VLUGSN", "CAzuAmJv", a hex id): no spaces, and digits or mixed case
const dropRef = (s: string) => s.replace(/\s+(?=\S{6,}$)(?=\S*\d|\S*[a-z]\S*[A-Z]|[A-Z0-9]{6}$)\S+$/, "");

/** How money moved between people and banks, said plainly; null when it's a purchase. */
function movement(s: string): string | null {
  let m = s.match(/^e-?Transfer\s*-?\s*sent\s+(.+)$/i);
  if (m) return `e-Transfer to ${person(dropRef(m[1]))}`;
  m = s.match(/^e-?Transfer\s*-?\s*(?:received|Autodeposit)\s+(.+)$/i);
  if (m) return `e-Transfer from ${person(dropRef(m[1]))}`;
  m = s.match(/^Fundstransfer(credit|fee)\s+(?:TT)?(.+)$/i);
  if (m) return m[1].toLowerCase() === "fee" ? "Wire transfer fee" : `Wire from ${recase(m[2].replace(/^THE(?=[A-Z]{3})/, "THE "))}`;
  m = s.match(/^PayrollDeposit\s+(.+)$/i);
  if (m) return aliasOf(m[1]) ?? (/PAYROLL/i.test(m[1]) ? recase(m[1]) : `${recase(m[1])} payroll`);
  if (/^OnlineBankingtransfer/i.test(s)) return "Online banking transfer";
  if (/^TaxRefund\b/i.test(s)) return "Tax refund";
  if (/^ATM\/Mobileadjustment/i.test(s)) return "ATM adjustment";
  return null;
}

export function tidyMerchant(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return raw;
  // masked references, phone numbers, help links and the foreign-currency note the card adds
  s = s.replace(/\s*Foreign Currency\b.*$/i, "").replace(/\+?\s*\[reference ending \d+\]/gi, "").replace(/\s+\d{3}-[\d-]*$/, "")
    .replace(/\s+g\.co\/\S*$/i, "").trim();
  const moved = movement(s);
  if (moved) return moved;
  s = s.replace(BANK_PREFIX, "").replace(PROCESSOR, "").trim();
  // "Lime*Auth", "UBER* TRIP", "Google *Temporary Hold": the brand is before the star
  s = s.replace(/^([A-Za-z][\w.'&-]+)\s*\*+.*$/, "$1").replace(/[#*]+$/, "").trim();
  const alias = aliasOf(s);
  if (alias) return alias;
  // a trailing "CITY PROV" (or ", PROV"), and a trailing country
  s = s.replace(new RegExp(`(?:[ ,]+[A-Z][A-Z.'-]+(?: [A-Z][A-Z.'-]+)?)?[ ,]+(?:${PROVINCES})(?:[ ,]+(?:CA|CAN|CANADA))?$`), "");
  s = s.replace(/[ ,]+(?:CA|CAN|CANADA)$/, "");
  // store and terminal numbers: "#1234", "W1578", "STORE 0042", long digit runs
  s = s.replace(/\s+(?:#\s?\d+|[A-Z]?\d{3,}[A-Z]?|STORE\s+\d+|NO\.?\s?\d+)\b/gi, "");
  s = s.replace(/\s{2,}/g, " ").replace(/\s+[-–]$/, "").trim();
  if (!s) s = raw.trim();
  return recase(s);
}

/** Only text that is mostly capitals is re-cased, so "iCloud+" and "Wise · transfer" stay as they are. */
function recase(s: string) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return letters.length >= 3 && upper / letters.length > 0.7 ? s.split(" ").map(titleWord).join(" ") : s;
}
