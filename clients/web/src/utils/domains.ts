/** Apex domain that redirects to the canonical www host. */
export const APEX_DOMAIN = "forge.ai";

/** Canonical marketing site domain. */
export const WWW_DOMAIN = "www.forge.ai";

/** The eTLD+1 shared by all Forge domains. Cookie domain uses a leading dot. */
export const FORGE_COOKIE_DOMAIN = ".forge.ai";

/**
 * Hostnames where the assistant is platform-hosted (not local daemon).
 * Used to detect platform-hosted mode for assistant lifecycle management.
 */
export const PLATFORM_HOSTED_HOSTNAMES: readonly string[] = [
  WWW_DOMAIN,
  APEX_DOMAIN,
];

/** True when `host` is `domain` itself or any subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Check if a hostname belongs to the forge.ai domain family. */
export function isForgeDomain(host: string): boolean {
  return hostMatchesDomain(host, APEX_DOMAIN);
}
