"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarCheck,
  CalendarDays,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";

// Phones get a bottom tab bar instead of the drawer-only navigation the
// app used to have on every size. Five slots is the practical ceiling for
// thumb-sized targets on a 375pt screen, so the four highest-traffic
// destinations get a tab and everything else lives behind "More", which
// opens the same drawer the tablet shell uses.
const CRM_TABS = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
] as const;

// HR is a different product, not a CRM sub-section, so its bottom tabs
// point at HR's own four highest-traffic destinations rather than
// reusing CRM's — a "Contacts" or "Pipelines" tab would be actively
// wrong context while inside HR. Same four-tabs-plus-More shape, no
// new navigation pattern introduced.
const HR_TABS = [
  { href: "/hr", labelKey: "hrHome", icon: LayoutDashboard },
  { href: "/hr/employees", labelKey: "hrEmployees", icon: Users },
  { href: "/hr/attendance", labelKey: "hrAttendance", icon: CalendarCheck },
  { href: "/hr/leave", labelKey: "hrLeave", icon: CalendarDays },
] as const;

interface MobileTabBarProps {
  /** Opens the nav drawer — the "More" tab's action. */
  onOpenMore: () => void;
}

export function MobileTabBar({ onOpenMore }: MobileTabBarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const totalUnread = useTotalUnread();

  // HR is a different product, not a CRM section — its own tabs, not
  // CRM's, whenever the current route is under /hr.
  const isHr = pathname === "/hr" || pathname.startsWith("/hr/");
  const TABS = isHr ? HR_TABS : CRM_TABS;
  // Both product roots ("/dashboard", "/hr") must match exactly —
  // otherwise the root tab would light up as "active" for every
  // sub-route too, since every other href in each list starts with it.
  const ROOT_HREFS = ["/dashboard", "/hr"];

  return (
    <nav
      aria-label="Primary"
      // `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the
      // home indicator on notched iPhones; without it the last few
      // pixels of the tap targets sit under the system gesture area.
      className="panel-glass sticky bottom-0 z-30 flex shrink-0 items-stretch gap-1 rounded-none border-x-0 border-b-0 px-1 pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => {
        const isActive =
          pathname === tab.href ||
          (!ROOT_HREFS.includes(tab.href) && pathname.startsWith(tab.href));
        const showUnread = tab.href === "/inbox" && totalUnread > 0;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground active:bg-muted/60",
            )}
          >
            <span className="relative">
              <tab.icon className="size-5" />
              {showUnread && (
                <span
                  aria-label={t("unreadConversations", { count: totalUnread })}
                  className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
                >
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </span>
            {t(tab.labelKey)}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onOpenMore}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-muted-foreground transition-colors active:bg-muted/60"
      >
        <MoreHorizontal className="size-5" />
        {t("more")}
      </button>
    </nav>
  );
}
