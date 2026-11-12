// The desktop sidebar's width, in px, set by dragging its edge. It's kept in a cookie so
// the server renders the sidebar at that width on the first paint. Plain module (not
// "use client") so the server layout can read the cookie with it too.

export const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar_width";
export const SIDEBAR_WIDTH_DEFAULT = 256;
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 480;

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width)));
}

/** The remembered width from the cookie's value, or the default when it's missing or junk. */
export function parseSidebarWidth(raw: string | undefined | null): number {
  const width = Number(raw);
  return raw && Number.isFinite(width) ? clampSidebarWidth(width) : SIDEBAR_WIDTH_DEFAULT;
}
