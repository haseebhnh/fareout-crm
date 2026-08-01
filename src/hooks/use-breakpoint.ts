"use client";

import { useSyncExternalStore } from "react";

/**
 * The app ships three genuinely different shells rather than one
 * reflowing layout, so the breakpoint is a first-class value that
 * components branch on — not just a Tailwind prefix.
 *
 *   mobile   < 768px   single pane, push navigation, bottom tab bar
 *   tablet   < 1280px  two panes (list + detail), sidebar in a drawer
 *   desktop  >= 1280px three panes + persistent sidebar
 *
 * Thresholds intentionally match Tailwind's `md` and `xl` so markup
 * that *can* be expressed with plain utilities stays consistent with
 * the shells that branch in JS.
 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

const TABLET_MIN = 768;
const DESKTOP_MIN = 1280;

const QUERIES = [
  `(min-width: ${TABLET_MIN}px)`,
  `(min-width: ${DESKTOP_MIN}px)`,
] as const;

function subscribe(onChange: () => void) {
  const lists = QUERIES.map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

function getSnapshot(): Breakpoint {
  if (window.matchMedia(QUERIES[1]).matches) return "desktop";
  if (window.matchMedia(QUERIES[0]).matches) return "tablet";
  return "mobile";
}

// The server can't know the viewport. Rendering "desktop" there and
// correcting on hydration would flash the wrong shell on phones — the
// worst case for the users most sensitive to it. `null` instead lets
// callers hold off on shell-level branching until hydration, while
// CSS-only responsive markup still renders correctly on first paint.
function getServerSnapshot(): Breakpoint | null {
  return null;
}

/**
 * Returns the active breakpoint, or `null` during SSR and the first
 * client render. Treat `null` as "don't commit to a shell yet".
 */
export function useBreakpoint(): Breakpoint | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Convenience wrapper for the common "is this a phone?" branch. */
export function useIsMobile(): boolean {
  return useBreakpoint() === "mobile";
}
