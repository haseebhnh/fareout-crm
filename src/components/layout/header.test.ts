import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getPageTitleKey } from "./header";

/**
 * The header title is looked up from a route map, and an unknown route
 * falls back to "dashboard" rather than erroring. That fallback is
 * reasonable — a header should never crash a page — but it means a
 * missing entry is invisible: /flows and /agents both rendered
 * "Dashboard" in the header while the page below said "Flows".
 *
 * These tests make the drift loud. Every destination in the sidebar
 * must resolve to its own title, and every title key must exist in both
 * locales — a key present in the map but absent from a message file
 * throws at render time in that language only, which is the kind of bug
 * that ships to one market and not the other.
 */

const SIDEBAR_SRC = readFileSync(join(__dirname, "sidebar.tsx"), "utf8");

/** Nav destinations, read from the sidebar so the two cannot drift. */
function sidebarRoutes(): string[] {
  const block = SIDEBAR_SRC.match(
    /const navItems:\s*NavItem\[\]\s*=\s*\[([\s\S]*?)\];/,
  );
  if (!block) throw new Error("could not locate navItems in sidebar.tsx");
  return [...block[1].matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function messages(locale: string): Record<string, string> {
  const raw = readFileSync(
    join(process.cwd(), "messages", `${locale}.json`),
    "utf8",
  );
  return JSON.parse(raw).Header;
}

describe("header page titles", () => {
  const routes = sidebarRoutes();

  it("finds the sidebar destinations", () => {
    // Guards the regex above: if navItems is reformatted and this
    // silently matches nothing, every assertion below would vacuously
    // pass.
    expect(routes.length).toBeGreaterThanOrEqual(8);
    expect(routes).toContain("/flows");
    expect(routes).toContain("/agents");
  });

  it.each(routes)("%s does not fall back to the dashboard title", (route) => {
    const key = getPageTitleKey(route);
    if (route === "/dashboard") {
      expect(key).toBe("dashboard");
      return;
    }
    expect(
      key,
      `${route} has no entry in pageTitles, so the header silently shows "Dashboard"`,
    ).not.toBe("dashboard");
  });

  it.each(["en", "ko"])("every title key exists in %s", (locale) => {
    const header = messages(locale);
    for (const route of routes) {
      const key = getPageTitleKey(route);
      expect(
        header[key],
        `Header.${key} is missing from ${locale}.json — the header would throw on ${route}`,
      ).toBeTruthy();
    }
  });

  it("still falls back rather than throwing on an unknown route", () => {
    // Sub-routes and anything unmapped must degrade, not crash.
    expect(getPageTitleKey("/definitely-not-a-route")).toBe("dashboard");
    expect(getPageTitleKey("/flows/abc-123/runs")).toBe("flows");
  });
});
