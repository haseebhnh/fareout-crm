'use client';

// ============================================================
// HR — Dashboard (the /hr landing page). Employees moved to
// /hr/employees so this route could become a real dashboard rather
// than defaulting to whichever module happened to be built first.
//
// KPIs are admin-only (cross-employee data); the module grid is
// visible to everyone with HR access — a non-admin member still
// needs to get to their own Attendance/Leave/Performance pages.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Users,
  CalendarCheck,
  CalendarDays,
  Clock3,
  CalendarRange,
  CalendarHeart,
  Briefcase,
  Target,
  FileText,
  BarChart3,
  Loader2,
} from 'lucide-react';

const MODULES = [
  { href: '/hr/employees', label: 'Employees', icon: Users, desc: 'Directory & profiles' },
  { href: '/hr/attendance', label: 'Attendance', icon: CalendarCheck, desc: 'Check in / out' },
  { href: '/hr/leave', label: 'Leave', icon: CalendarDays, desc: 'Requests & balances' },
  { href: '/hr/shifts', label: 'Shifts', icon: Clock3, desc: 'Shift definitions' },
  { href: '/hr/roster', label: 'Roster', icon: CalendarRange, desc: 'Weekly assignments' },
  { href: '/hr/holidays', label: 'Holidays', icon: CalendarHeart, desc: 'Company holidays' },
  { href: '/hr/recruitment', label: 'Recruitment', icon: Briefcase, desc: 'Openings & candidates' },
  { href: '/hr/performance', label: 'Performance', icon: Target, desc: 'Goals & reviews' },
  { href: '/hr/documents', label: 'Documents', icon: FileText, desc: 'Files & expiry' },
  { href: '/hr/reports', label: 'Reports', icon: BarChart3, desc: 'Headcount & trends' },
] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HrDashboardPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [presentToday, setPresentToday] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);

  const load = useCallback(async () => {
    if (!accountId || !canManageMembers) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [empRes, attRes, leaveRes] = await Promise.all([
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('employment_status', 'active'),
      supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('date', todayIso())
        .not('check_in_at', 'is', null),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setTotalEmployees(empRes.count ?? 0);
    setPresentToday(attRes.count ?? 0);
    setPendingLeave(leaveRes.count ?? 0);
    setLoading(false);
  }, [accountId, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">HR</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Employees, attendance, leave, and everything in between.
        </p>
      </div>

      {canManageMembers && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              <span className="text-sm">Active employees</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {loading ? <Loader2 className="size-5 animate-spin" /> : totalEmployees}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarCheck className="size-4" />
              <span className="text-sm">Checked in today</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {loading ? <Loader2 className="size-5 animate-spin" /> : presentToday}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="size-4" />
              <span className="text-sm">Pending leave requests</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {loading ? <Loader2 className="size-5 animate-spin" /> : pendingLeave}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center gap-3 rounded-2xl border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <m.icon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
