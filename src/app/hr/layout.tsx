import { redirect } from 'next/navigation';
import { getCurrentAccount } from '@/lib/auth/account';
import { hasProductAccess } from '@/lib/products/access';
import { DashboardShell } from '@/app/(dashboard)/dashboard-shell';

/**
 * Server-side gate for every /hr/* page — rule: product access must
 * be enforced server-side, not just hidden in a switcher UI. Mirrors
 * the pattern `requireRole` uses for RBAC, but for product-level
 * entitlement instead of role.
 *
 * Not linked from the main nav yet (HR is still a partial product —
 * only Employees/Departments/Designations exist so far), so this is
 * reachable only by direct URL. That's deliberate: the routes
 * underneath are real and fully gated, they're just not advertised
 * as "HR is complete" until the rest of the product exists.
 */
export default async function HrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let accountId: string;
  let supabase: Awaited<ReturnType<typeof getCurrentAccount>>['supabase'];
  try {
    const ctx = await getCurrentAccount();
    accountId = ctx.accountId;
    supabase = ctx.supabase;
  } catch {
    redirect('/login');
  }

  const allowed = await hasProductAccess(supabase, accountId, 'hr');
  if (!allowed) {
    redirect('/dashboard');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
