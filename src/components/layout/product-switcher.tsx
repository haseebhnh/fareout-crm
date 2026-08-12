"use client";

import Link from "next/link";
import { LayoutGrid, Lock } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/use-auth";
import { PRODUCTS } from "@/lib/products/registry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Global product switcher (rule #20 in the Ootrix platform spec).
 * Lists every registered product; only ones the account has enabled
 * AND that actually have an implementation (`status: 'available'` in
 * the registry) are clickable. Everything else renders locked — the
 * spec's own "🔒 Upgrade" treatment — rather than linking to a page
 * that doesn't exist.
 *
 * This is a rendering convenience only. The real gate is server-side
 * (`src/lib/products/access.ts`) — a user editing this component or
 * its state client-side gains nothing, because every product's own
 * routes check `enabled_products` themselves.
 */
export function ProductSwitcher() {
  const t = useTranslations("Header");
  const { account } = useAuth();
  const enabled = new Set(account?.enabled_products ?? []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:outline-none data-popup-open:bg-muted"
        aria-label={t("productSwitcher")}
      >
        <LayoutGrid className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="min-w-56 bg-popover text-popover-foreground ring-border"
      >
        {PRODUCTS.map((product) => {
          const unlocked = product.status === "available" && enabled.has(product.id);
          if (unlocked) {
            // No route yet even though the account has it enabled
            // (shouldn't happen — enabled_products for a product with
            // no path is a data inconsistency — but render inert
            // rather than link nowhere).
            if (!product.path) {
              return (
                <DropdownMenuItem
                  key={product.id}
                  disabled
                  className="text-popover-foreground"
                >
                  {product.label}
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem
                key={product.id}
                render={<Link href={product.path} />}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                {product.label}
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem
              key={product.id}
              className="cursor-not-allowed text-muted-foreground opacity-60 focus:bg-transparent"
              onClick={(e) => {
                e.preventDefault();
                toast.info(
                  product.status === "planned"
                    ? t("productComingSoon", { product: product.label })
                    : t("productLocked", { product: product.label }),
                );
              }}
            >
              {product.label}
              <Lock className="ml-auto size-3.5" />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
