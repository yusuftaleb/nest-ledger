import "server-only";
import pkg from "../../package.json";
import { cleanVersion, isNewer } from "./semver";

/** This copy's version. A release bumps it in package.json and tags the same number (v0.2.0). */
export const VERSION = pkg.version;

/** Where Nest Ledger is published. Copies are forks of it; "Sync fork" on GitHub brings in its releases. */
export const UPSTREAM = "yusuftaleb/nest-ledger";

export type Release = { version: string; url: string };

// Asked at most every 6 hours per server instance; only this server's address reaches GitHub, nothing else.
let cached: { at: number; release: Release | null } | null = null;

/**
 * The newest published release when it is later than this copy, otherwise null. Never waits more than 3 seconds,
 * and never fails a page: no answer is the same as no update. NEST_LEDGER_UPDATE_CHECK=0 turns the check off.
 */
export async function newerRelease(): Promise<Release | null> {
  if (process.env.NEST_LEDGER_UPDATE_CHECK === "0") return null;
  if (!cached || Date.now() - cached.at > 6 * 3600_000) {
    let release: Release | null = null;
    try {
      const res = await fetch(`https://api.github.com/repos/${UPSTREAM}/releases/latest`, {
        headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(3000), cache: "no-store",
      });
      const data = res.ok ? await res.json() as { tag_name?: string; html_url?: string } : null;
      const version = data?.tag_name ? cleanVersion(data.tag_name) : null;
      if (version && data?.html_url?.startsWith(`https://github.com/${UPSTREAM}/`)) release = { version, url: data.html_url };
    } catch { /* offline, slow or rate-limited: try again later */ }
    cached = { at: Date.now(), release };
  }
  return cached.release && isNewer(cached.release.version, VERSION) ? cached.release : null;
}
