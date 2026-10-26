import type { Bucket } from "./types";

// Bucket tree helpers, shared by server pages and client forms.

/** "Baby / Diapers & wipes" for a child bucket, the name for a top-level one. */
export function bucketPath(buckets: Bucket[], id: string | null): string {
  const names: string[] = [];
  for (let b = buckets.find((x) => x.id === id); b && names.length < 10; b = buckets.find((x) => x.id === b!.parent_id)) {
    names.unshift(b.name);
  }
  return names.join(" / ");
}

/** Buckets in tree order (each parent followed by its children), with their depth. */
export function bucketTree(buckets: Bucket[]): { bucket: Bucket; depth: number }[] {
  const out: { bucket: Bucket; depth: number }[] = [];
  const ids = new Set(buckets.map((b) => b.id));
  const walk = (parent: string | null, depth: number) => {
    for (const b of buckets) {
      const isRoot = parent === null && (!b.parent_id || !ids.has(b.parent_id));
      if ((parent === null ? isRoot : b.parent_id === parent) && depth < 10) {
        out.push({ bucket: b, depth });
        walk(b.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return out;
}

/** The palette slot ("1"–"7") a seed always lands on, so a bucket without a color keeps the same one everywhere. */
export function seedColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return String((Math.abs(hash) % 7) + 1);
}

/** Buckets inside another wear its color unless they have their own, so a family reads as one at a glance. */
export function withFamilyColors<B extends Pick<Bucket, "id" | "parent_id" | "color">>(buckets: B[]): B[] {
  const byId = new Map(buckets.map((b) => [b.id, b]));
  const colorOf = (b: B, hops = 0): string => {
    if (b.color) return b.color;
    const parent = b.parent_id ? byId.get(b.parent_id) : undefined;
    return parent && hops < 10 ? colorOf(parent, hops + 1) : seedColor(b.id);
  };
  return buckets.map((b) => (b.color ? b : { ...b, color: colorOf(b) }));
}

export const KIND_LABEL: Record<string, string> = {
  spend: "Spending", income: "Money in", transfer: "Transfers", saving: "Savings & goals", goal: "Savings & goals", lent: "Lent to others",
};

type MenuBucket = Pick<Bucket, "id" | "name" | "parent_id"> & Partial<Pick<Bucket, "kind" | "icon" | "color" | "archived">>;

/**
 * Every bucket for a menu, with its icon: top-level buckets grouped by kind, and the ones inside them
 * tucked under their parent (the menu opens a parent to show them). Archived buckets are left out
 * unless one is `keep` (the bucket a transaction already has).
 */
export function bucketMenu(buckets: MenuBucket[], keep?: string | null) {
  const live = buckets.filter((b) => !b.archived || b.id === keep);
  const ids = new Set(live.map((b) => b.id));
  const colored = withFamilyColors(live.map((b) => ({ ...b, color: b.color ?? null })));
  const tree = bucketTree(colored as Bucket[]);
  const order = [...new Set([...Object.keys(KIND_LABEL), ...live.map((b) => b.kind ?? "spend")])];
  const rootOf = (b: MenuBucket): MenuBucket => {
    let r = b;
    for (let i = 0; i < 10 && r.parent_id && ids.has(r.parent_id); i++) r = live.find((x) => x.id === r.parent_id)!;
    return r;
  };
  const rank = (b: MenuBucket) => order.indexOf(rootOf(b).kind ?? "spend");
  return tree
    .map(({ bucket: b }, i) => ({ b, i }))
    .sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i)
    .map(({ b }) => {
      const parent = b.parent_id && ids.has(b.parent_id) ? live.find((p) => p.id === b.parent_id) : undefined;
      const kind = rootOf(b).kind ?? "spend";
      return {
        value: b.id, label: parent ? `${parent.name} › ${b.name}` : b.name, short: b.name,
        parent: parent?.id, group: KIND_LABEL[kind] ?? kind, icon: b.icon ?? null, color: b.color, seed: b.id,
      };
    });
}
