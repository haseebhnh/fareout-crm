import { redirect } from 'next/navigation';
import { getCurrentAccount } from '@/lib/auth/account';
import { hasProductAccess } from '@/lib/products/access';
import { DashboardShell } from '@/app/(dashboard)/dashboard-shell';

/**
 * Server-side gate for every /tasks/* page — same pattern as
 * `HrLayout`/`StaffLayout`: product access is enforced here, not
 * just hidden in a switcher UI.
 */
export default async function TasksLayout({
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

  const allowed = await hasProductAccess(supabase, accountId, 'task');
  if (!allowed) {
    redirect('/dashboard');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
