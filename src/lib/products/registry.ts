// ============================================================
// Ootrix Core — product registry.
//
// The single source of truth for every product in the platform: its
// id, subdomain, display name, and whether it actually has a working
// implementation behind it yet. Everything else (the product
// switcher, subdomain-based routing, server-side access checks)
// reads from this list rather than hardcoding product ids anywhere
// else — adding a real product later means implementing its pages,
// then flipping `status` here, not touching N call sites.
//
// `status: 'available'` means a real product exists at that
// subdomain. `status: 'planned'` means the id is reserved (so it can
// appear in the switcher as a locked/"coming soon" entry per rule #19
// in the platform spec) but has no implementation — a bare
// `enabled_products` entry for a planned product must never unlock a
// route, because there is no route to unlock. Only 'crm' is
// 'available' today; every other product ships as 'planned' until it
// has real DB models + API + UI + tests behind it (see AGENTS.md/
// session history: "do not implement products as empty pages").
// ============================================================

export type ProductId =
  | 'crm'
  | 'hr'
  | 'staff'
  | 'task'
  | 'sales'
  | 'marketing'
  | 'support'
  | 'finance'
  | 'operations'
  | 'reports'

export type ProductStatus = 'available' | 'planned'

export interface ProductDefinition {
  id: ProductId
  /** Subdomain host, e.g. "crm.ootrix.com". */
  subdomain: string
  label: string
  status: ProductStatus
  /** In-app route to land on when clicked, for the single-deployment
   *  reality today (subdomain routing per rule #5/§22 is not built —
   *  everything serves from one Next.js instance). Undefined for a
   *  product with no routes yet, so the switcher has nothing to link
   *  to even if a future `enabled_products` entry somehow unlocked it. */
  path?: string
}

export const PRODUCTS: readonly ProductDefinition[] = [
  { id: 'crm', subdomain: 'crm.ootrix.com', label: 'CRM', status: 'available', path: '/dashboard' },
  { id: 'hr', subdomain: 'hr.ootrix.com', label: 'HR', status: 'available', path: '/hr' },
  { id: 'staff', subdomain: 'staff.ootrix.com', label: 'Staff', status: 'available', path: '/staff' },
  { id: 'task', subdomain: 'task.ootrix.com', label: 'Tasks', status: 'planned' },
  { id: 'sales', subdomain: 'sales.ootrix.com', label: 'Sales', status: 'planned' },
  { id: 'marketing', subdomain: 'marketing.ootrix.com', label: 'Marketing', status: 'planned' },
  { id: 'support', subdomain: 'support.ootrix.com', label: 'Support', status: 'planned' },
  { id: 'finance', subdomain: 'finance.ootrix.com', label: 'Finance', status: 'planned' },
  { id: 'operations', subdomain: 'operations.ootrix.com', label: 'Operations', status: 'planned' },
  { id: 'reports', subdomain: 'reports.ootrix.com', label: 'Reports', status: 'planned' },
] as const

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]))
const BY_HOST = new Map(PRODUCTS.map((p) => [p.subdomain, p]))

export function getProduct(id: ProductId): ProductDefinition {
  const product = BY_ID.get(id)
  if (!product) throw new Error(`Unknown product id: ${id}`)
  return product
}

/** Resolve a request's Host header to a product, or null for
 *  app.ootrix.com / ootrix.com / a dev host with no product prefix. */
export function productForHost(host: string): ProductDefinition | null {
  // Strip a port for local dev (localhost:3000 etc.) before lookup.
  const bareHost = host.split(':')[0]
  return BY_HOST.get(bareHost) ?? null
}

export function isProductId(value: string): value is ProductId {
  return BY_ID.has(value as ProductId)
}
