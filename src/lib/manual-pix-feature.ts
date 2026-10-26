/**
 * Opt-in only: existing checkout behavior remains unchanged until
 * an audited integration explicitly calls isManualPixEnabled().
 * This flag MUST NOT be used to bypass server authorization.
 */
export function isManualPixEnabled(): boolean {
  return import.meta.env.VITE_MANUAL_PIX_ENABLED === "true";
}
