import type { DomainPolicy } from "../../shared/types";
import { loadSettings } from "../config/settings";

/**
 * Check whether navigation to a URL is permitted by the domain policy.
 * Returns null if allowed, or an error message string if blocked.
 *
 * Rules:
 * - If allowedDomains is non-empty, only those domains (and their subdomains) are permitted.
 * - If blockedDomains is non-empty, those domains (and their subdomains) are rejected.
 * - allowedDomains takes precedence: if set, blockedDomains is ignored.
 * - about: and empty URLs are always allowed.
 */
export function checkDomainPolicy(url: string): string | null {
  if (!url || url.startsWith("about:")) return null;

  const settings = loadSettings();
  const policy: DomainPolicy = settings.domainPolicy;

  // No policy configured — allow everything
  if (policy.allowedDomains.length === 0 && policy.blockedDomains.length === 0) {
    return null;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null; // Let URL parsing errors be handled elsewhere
  }

  // Allowlist mode: only listed domains permitted
  if (policy.allowedDomains.length > 0) {
    const allowed = policy.allowedDomains.some((d) =>
      matchesDomain(hostname, d.toLowerCase()),
    );
    return allowed
      ? null
      : `Navigation blocked by domain policy: ${hostname} is not in the allowed domains list.`;
  }

  // Blocklist mode: listed domains rejected
  if (policy.blockedDomains.length > 0) {
    const blocked = policy.blockedDomains.some((d) =>
      matchesDomain(hostname, d.toLowerCase()),
    );
    return blocked
      ? `Navigation blocked by domain policy: ${hostname} is in the blocked domains list.`
      : null;
  }

  return null;
}

/** Returns true if hostname matches the policy domain (exact or subdomain). */
function matchesDomain(hostname: string, policyDomain: string): boolean {
  return hostname === policyDomain || hostname.endsWith("." + policyDomain);
}
