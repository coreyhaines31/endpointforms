import { and, eq } from "drizzle-orm";

import { withWorkspace } from "../../db/scoped.ts";
import { endpointSpamPolicies, spamListEntries } from "../../db/schema.ts";
import { DEFAULT_SPAM_POLICY } from "./assess.ts";
import { EMPTY_SPAM_LISTS, type SpamLists, type SpamPolicy } from "./types.ts";

/**
 * Reading a workspace's spam configuration on the ingest path (#31).
 *
 * ## Why this is cached
 *
 * The submission path already runs two queries — resolve the endpoint, write
 * the row — and it runs on other people's paid traffic. Blocklists and
 * per-endpoint policy change roughly never, and reading them fresh on every
 * submission would add a third query to the hottest path in the product for no
 * benefit a customer could observe.
 *
 * So: a small in-process cache with a short life. The window is the honest cost
 * — a blocklist entry added now takes up to `CACHE_TTL_MS` to take effect on an
 * instance that already has the old copy — and it is stated on the settings
 * screen rather than left for someone to discover.
 *
 * ## What it does when the read fails
 *
 * Returns the defaults and no lists, which scores the submission on heuristics
 * alone. That is the fail-open direction: a database hiccup must never be the
 * reason a lead is flagged, and it must certainly never be the reason one is
 * refused. This module has no path that can refuse anything.
 */

export type SpamConfig = { policy: SpamPolicy; lists: SpamLists };

export const CACHE_TTL_MS = 30_000;

const DEFAULT_CONFIG: SpamConfig = { policy: DEFAULT_SPAM_POLICY, lists: EMPTY_SPAM_LISTS };

type CacheEntry = { config: SpamConfig; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const MAX_CACHED = 5_000;

export async function loadSpamConfig(
  endpoint: { id: string; workspaceId: string },
  now: number = Date.now(),
): Promise<SpamConfig> {
  const key = endpoint.id;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.config;

  try {
    const config = await readConfig(endpoint);
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(key, { config, expiresAt: now + CACHE_TTL_MS });
    return config;
  } catch (error) {
    // Logged, never thrown. See the note above about which direction this fails in.
    console.error(`[spam] could not read spam config for endpoint ${endpoint.id}`, error);
    return DEFAULT_CONFIG;
  }
}

async function readConfig(endpoint: { id: string; workspaceId: string }): Promise<SpamConfig> {
  return withWorkspace(endpoint.workspaceId, async (ws) => {
    const [policyRows, listRows] = await Promise.all([
      ws.tx
        .select()
        .from(endpointSpamPolicies)
        .where(and(eq(endpointSpamPolicies.workspaceId, endpoint.workspaceId), eq(endpointSpamPolicies.endpointId, endpoint.id)))
        .limit(1),
      ws.tx
        .select({
          kind: spamListEntries.kind,
          effect: spamListEntries.effect,
          value: spamListEntries.value,
        })
        .from(spamListEntries)
        .where(eq(spamListEntries.workspaceId, endpoint.workspaceId)),
    ]);

    const row = policyRows[0];
    // A missing row is the defaults, not a misconfiguration. Nobody should have
    // to visit a settings screen before their form is defended.
    const policy: SpamPolicy = row
      ? {
          enabled: row.enabled,
          honeypot: row.honeypot,
          timing: row.timing,
          duplicate: row.duplicate,
          velocity: row.velocity,
          content: row.content,
          disposableEmail: row.disposableEmail,
          threshold: row.threshold,
          honeypotField: row.honeypotField,
        }
      : DEFAULT_SPAM_POLICY;

    const lists: SpamLists = {
      blockedIpHashes: [],
      allowedIpHashes: [],
      blockedEmailDomains: [],
      allowedEmailDomains: [],
      blockedKeywords: [],
    };

    for (const entry of listRows) {
      const allow = entry.effect === "allow";
      if (entry.kind === "ip") {
        (allow ? lists.allowedIpHashes : lists.blockedIpHashes).push(entry.value);
      } else if (entry.kind === "email_domain") {
        (allow ? lists.allowedEmailDomains : lists.blockedEmailDomains).push(entry.value);
      } else if (!allow) {
        // There is no allow-keyword. "Never flag anything containing the word
        // 'pricing'" is a rule whose blast radius nobody can predict, and the
        // allow side is meant to be precise: an address or a domain.
        lists.blockedKeywords.push(entry.value);
      }
    }

    return { policy, lists };
  });
}

/**
 * Drops the cached copy for one endpoint, so a settings change is visible
 * immediately on the instance that made it rather than after the TTL.
 *
 * It cannot do that for the *other* instances — that is the cost named at the
 * top of this file, and pretending otherwise would be worse than the delay.
 */
export function invalidateSpamConfig(endpointId?: string): void {
  if (endpointId) cache.delete(endpointId);
  else cache.clear();
}

/** Test seam. Nothing in the request path calls this. */
export const spamConfigCacheSize = () => cache.size;
