// ============================================================
// Ootrix Core — server-side product access.
//
// Rule #19 in the platform spec: "Product access must be enforced
// server-side." A locked product in the switcher UI is a courtesy,
// not a gate — this is the gate. Every product's route layer must
// call `hasProductAccess` (or the throwing variant) before serving a
// page or an API response, the same way `requireRole` gates RBAC.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { ForbiddenError } from '@/lib/auth/account'
import { isProductId, type ProductId } from './registry'

/**
 * True when the account's `enabled_products` includes this product.
 * A product with `status: 'planned'` (see registry.ts) has no route
 * to gate yet, so this being true for a planned id is inert — there
 * is nothing to unlock — but the DB-level whitelist stays honest
 * regardless of what's been built.
 */
export async function hasProductAccess(
  supabase: SupabaseClient,
  accountId: string,
  product: ProductId,
): Promise<boolean> {
  const { data } = await supabase
    .from('accounts')
    .select('enabled_products')
    .eq('id', accountId)
    .maybeSingle()
  const enabled = (data?.enabled_products as string[] | null) ?? []
  return enabled.includes(product)
}

/** Throws ForbiddenError (same shape `requireRole` uses, so route
 *  handlers can reuse one `toErrorResponse` catch) when the account
 *  doesn't have this product enabled. */
export async function requireProductAccess(
  supabase: SupabaseClient,
  accountId: string,
  product: ProductId,
): Promise<void> {
  const allowed = await hasProductAccess(supabase, accountId, product)
  if (!allowed) {
    throw new ForbiddenError(`This account does not have "${product}" enabled.`)
  }
}

export { isProductId }
