"use client";

// ============================================================
// App Launcher — the "app.ootrix.com" home. A grid of boxes, one per
// registered product (src/lib/products/registry.ts). Clicking a box
// expands it in place to show what that product includes, rather than
// navigating immediately — the user sees the services before leaving
// the page they're on.
//
// Subdomain-aware by design but not subdomain-ACTIVE yet: real per-
// product hosting (crm.ootrix.com, hr.ootrix.com, ...) isn't
// provisioned, so `launchHref` resolves to the in-app path every
// product already uses today. The one place that changes once
// subdomains go live is `launchHref` itself — every call site here
// stays the same.
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  Headphones,
  Lock,
  Send,
  TrendingUp,
  Users,
  UserCircle,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { PRODUCTS, type ProductId } from "@/lib/products/registry";
import { cn } from "@/lib/utils";

const ICON: Record<ProductId, LucideIcon> = {
  crm: Users,
  hr: Building2,
  staff: UserCircle,
  task: BarChart3,
  sales: TrendingUp,
  marketing: Send,
  support: Headphones,
  finance: CircleDollarSign,
  operations: Workflow,
  reports: BarChart3,
};

// Grounded in what each product actually does today (for shipped
// products) or is scoped to build (for planned ones) — not aspirational
// marketing copy. Kept here rather than in the registry because it's
// launcher-specific presentation, not the product's identity.
const SERVICES: Record<ProductId, string[]> = {
  crm: ["Contacts", "WhatsApp shared inbox", "Sales pipeline", "Broadcasts & automations"],
  hr: ["Employees & branches", "Attendance & leave", "Recruitment", "Performance & reports"],
  staff: ["My attendance & leave", "My targets & performance", "My deals & customers", "My tasks"],
  task: ["Assign & prioritize work", "Link tasks to contacts & deals", "Due dates & status tracking"],
  sales: ["Pipeline value & forecast", "Win rate", "Monthly rep leaderboard"],
  marketing: ["Campaigns", "Customer journeys", "Broadcast automation"],
  support: ["Ticketing", "Shared customer record with CRM"],
  finance: ["Invoices", "Payments", "Margins"],
  operations: ["Multi-branch management", "Process tracking"],
  reports: ["Cross-product analytics", "Custom dashboards"],
};

/**
 * Where a click on this product's box should go. Same-origin in-app
 * path today; the seam where a real subdomain redirect would slot in
 * once crm.ootrix.com / hr.ootrix.com / etc. are actually provisioned
 * (see module comment above).
 */
function launchHref(path: string | undefined): string | null {
  return path ?? null;
}

export default function AppLauncherPage() {
  const router = useRouter();
  const { account, profile } = useAuth();
  const enabled = new Set(account?.enabled_products ?? []);
  const [expanded, setExpanded] = useState<ProductId | null>(null);

  const handleOpen = (path: string | undefined) => {
    const href = launchHref(path);
    if (href) router.push(href);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}.` : "Welcome back."}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything OOTRIX runs on your business — pick where you want to go.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((product) => {
          const Icon = ICON[product.id];
          const unlocked = product.status === "available" && enabled.has(product.id) && !!product.path;
          const isExpanded = expanded === product.id;

          return (
            <div
              key={product.id}
              className={cn(
                "rounded-2xl border border-border p-5 transition-colors",
                unlocked ? "cursor-pointer hover:bg-muted" : "cursor-pointer",
              )}
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(isExpanded ? null : product.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded(isExpanded ? null : product.id);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
                >
                  <Icon className="size-5" />
                </div>
                {!unlocked && <Lock className="size-4 text-muted-foreground" />}
              </div>

              <h3 className="mt-4 text-base font-semibold text-foreground">{product.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {product.status === "available"
                  ? unlocked
                    ? "Included in your plan"
                    : "Not enabled for this account"
                  : "Coming soon"}
              </p>

              {isExpanded && (
                <div className="mt-4 border-t border-border pt-4">
                  <ul className="space-y-1.5">
                    {SERVICES[product.id].map((service) => (
                      <li key={service} className="text-sm text-muted-foreground">
                        · {service}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (unlocked) handleOpen(product.path);
                    }}
                    disabled={!unlocked}
                    className={cn(
                      "mt-4 w-full rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                      unlocked
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "cursor-not-allowed bg-muted text-muted-foreground",
                    )}
                  >
                    {unlocked
                      ? `Open ${product.label}`
                      : product.status === "available"
                        ? "Ask your admin to enable"
                        : "Coming soon"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
