import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Marketing shell.
 *
 * `data-brand="ootrix"` scopes the brand tokens (see globals.css) to
 * this subtree, and the explicit background/colour below pins the page
 * light regardless of the visitor's saved app theme — the CRM is
 * theme-switchable, the brand surface is not.
 */

export const metadata: Metadata = {
  // `absolute` escapes the root layout's "%s — Ootrix CRM" template.
  // The marketing site is its own brand and must not inherit the app's
  // product name in its title.
  title: { absolute: "OOTRIX — Connect · Manage · Grow" },
  description:
    "AI-powered CRM and business operating system. Connect with customers, automate operations, and manage sales, teams, and finance from one platform.",
  // The root layout sets noindex/nofollow, which is right for an
  // auth-gated CRM and exactly wrong for a public landing page — it
  // would keep the entire marketing site out of search results. Re-open
  // indexing for this subtree only.
  robots: { index: true, follow: true },
  openGraph: {
    title: "OOTRIX — Connect · Manage · Grow",
    description:
      "AI-powered CRM and business operating system for travel, retail, clinics, real estate and more.",
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      data-brand="ootrix"
      className="min-h-screen antialiased"
      style={{
        background: "var(--oo-surface)",
        color: "var(--oo-ink)",
      }}
    >
      {children}
    </div>
  );
}
