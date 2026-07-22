/**
 * Platform gating.
 *
 * Herd OS is a premium **desktop** app; the website is the marketing front door
 * plus a thin account area. So on the web a signed-in user can only see a farm
 * overview and manage their subscription — everything operational (herd, milk,
 * health, finance, …) lives in the desktop build. The desktop build sets
 * NEXT_PUBLIC_DESKTOP=1 and gets the full app; the demo/bypass build is also
 * unrestricted so the showcase works.
 */

export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

/** Routes a signed-in web user may open (overview + subscription/settings). */
export const WEB_VIEW_PATHS = ["/dashboard", "/settings"];

export function isWebViewAllowed(pathname: string): boolean {
  return WEB_VIEW_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
