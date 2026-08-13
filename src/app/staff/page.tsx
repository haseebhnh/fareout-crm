'use client';

// ============================================================
// Staff — My Dashboard.
//
// One glance across everything Staff surfaces — every number here is
// a real query against tables that already exist (HR + CRM), scoped
// to the signed-in user, computed at render time. No stored stats.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useMyEmployee } from '@/hooks/use-my-employee';
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  GitBranch,
  ListChecks,
  Loader2,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Card {
  href: string;
  label: string;
  icon: typeof CalendarCheck;
  value: string;
  sub: string;
}

export default function StaffDashboardPage() {
  const { profile } = useAuth();
  const { employeeId, loading: employeeLoading } = useMyEmployee();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [checkedInToday, setCheckedInToday] = useState<boolean | null>(null);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [upcomingShifts, setUpcomingShifts] = useState(0);
  const [openGoals, setOpenGoals] = useState(0);
  const [myDeals, setMyDeals] = useState(0);
  const [myCustomers, setMyCustomers] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);

    if (employeeId) {
      const [attRes, leaveRes, rosterRes, goalsRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('date', todayIso())
          .not('check_in_at', 'is', null)
          .maybeSingle(),
        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .eq('status', 'pending'),
        supabase
          .from('roster_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .gte('date', todayIso()),
        supabase
          .from('goals')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .in('status', ['not_started', 'in_progress']),
      ]);
      setCheckedInToday(!!attRes.data);
      setPendingLeave(leaveRes.count ?? 0);
      setUpcomingShifts(rosterRes.count ?? 0);
      setOpenGoals(goalsRes.count ?? 0);
    }

    if (profile?.id) {
      const { count } = await supabase
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', profile.id)
        .eq('status', 'active');
      setMyDeals(count ?? 0);

      const { data: dealContacts } = await supabase
        .from('deals')
        .select('contact_id')
        .eq('assigned_to', profile.id);
      setMyCustomers(new Set((dealContacts ?? []).map((d) => d.contact_id)).size);

      const { count: taskCount } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', profile.id)
        .in('status', ['open', 'in_progress']);
      setOpenTasks(taskCount ?? 0);
    }

    setLoading(false);
  }, [employeeId, profile, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!employeeLoading) void load();
  }, [employeeLoading, load]);

  if (loading || employeeLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const cards: Card[] = [
    {
      href: '/staff/attendance',
      label: 'Attendance',
      icon: CalendarCheck,
      value: checkedInToday === null ? '—' : checkedInToday ? 'Checked in' : 'Not checked in',
      sub: 'Today',
    },
    {
      href: '/staff/leave',
      label: 'Leave',
      icon: CalendarDays,
      value: String(pendingLeave),
      sub: 'Pending requests',
    },
    {
      href: '/staff/roster',
      label: 'Roster',
      icon: CalendarRange,
      value: String(upcomingShifts),
      sub: 'Upcoming shifts',
    },
    {
      href: '/staff/targets',
      label: 'Targets',
      icon: Target,
      value: String(openGoals),
      sub: 'In progress',
    },
    {
      href: '/staff/tasks',
      label: 'Tasks',
      icon: ListChecks,
      value: String(openTasks),
      sub: 'Open, assigned to you',
    },
    {
      href: '/staff/deals',
      label: 'Deals',
      icon: GitBranch,
      value: String(myDeals),
      sub: 'Active, assigned to you',
    },
    {
      href: '/staff/customers',
      label: 'Customers',
      icon: Users,
      value: String(myCustomers),
      sub: 'Linked to your deals',
    },
    {
      href: '/staff/performance',
      label: 'Performance',
      icon: TrendingUp,
      value: '',
      sub: 'View your reviews',
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}.` : 'Welcome back.'}
        </p>
      </div>

      {!employeeId && (
        <div className="mb-6 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          You&rsquo;re not linked to an employee record, so attendance, leave, roster and targets
          won&rsquo;t have data yet — CRM widgets below still work.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-border p-5 transition-colors hover:bg-muted"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="size-4" />
              <span className="text-sm">{c.label}</span>
            </div>
            {c.value && <p className="mt-2 text-2xl font-bold text-foreground">{c.value}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
