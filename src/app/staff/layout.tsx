import { redirect } from 'next/navigation';
import { getCurrentAccount } from '@/lib/auth/account';
import { hasProductAccess } from '@/lib/products/access';
import { DashboardShell } from '@/app/(dashboard)/dashboard-shell';

/**
 * Server-side gate for every /staff/* page — same pattern as
 * `HrLayout`: product access is enforced here, not just hidden in a
 * switcher UI.
 *
 * Staff is a personal portal, not an admin console: every page under
 * this route reads/writes only the signed-in user's own linked
 * `employees` row (or rows assigned to their `profiles.id`), reusing
 * the same tables and RLS policies HR's admin pages already use — no
 * new tables, no new permission engine, just a self-scoped view.
 */
export default async function StaffLayout({
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

  const allowed = await hasProductAccess(supabase, accountId, 'staff');
  if (!allowed) {
    redirect('/dashboard');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
