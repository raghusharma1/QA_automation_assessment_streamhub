/**
 * Third-party hosts loaded by emicalculator.net that are irrelevant to the calculator but make
 * tests slower and non-deterministic: ad slots that shift layout, analytics beacons, and Google's
 * Funding Choices consent manager, which can overlay a dialog for some regions.
 * Hosts were taken from a live recon session (docs/research/06-live-recon-verified.md).
 *
 * The calculator's own scripts (jQuery UI, Highcharts, bootstrap-datepicker) are first-party
 * and are never blocked.
 */
export const BLOCKED_HOST_SUFFIXES = [
  'googlesyndication.com',
  'doubleclick.net',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'fundingchoicesmessages.google.com',
  'adtrafficquality.google',
  'googleadservices.com',
  'gravatar.com',
] as const;

export function isBlockedHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
