'use client';

// ============================================================
// HR — Reports.
//
// Admin-only (data here aggregates across every employee — headcount,
// attendance, leave, recruitment, document expiry — so it's gated the
// same as every other cross-employee view in HR). Every number is a
// real query against the tables built this session, computed at
// render time — no stored/cached statistics, no mock data. A shared,
// cross-product Reports engine (rule #23) doesn't exist yet; this is
// HR's own reporting until that lands, the same way the CRM dashboard
// predates any shared dashboard-builder.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Users,
  CalendarCheck,
  CalendarDays,
  Briefcase,
  FileWarning,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface DeptCount {
  name: string;
  count: number;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export default function HrReportsPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  const [totalEmployees, setTotalEmployees] = useState(0);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [headcountByDept, setHeadcountByDept] = useState<DeptCount[]>([]);
  const [headcountByBranch, setHeadcountByBranch] = useState<DeptCount[]>([]);

  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});

  const [leaveCounts, setLeaveCounts] = useState<Record<string, number>>({});

  const [candidateCounts, setCandidateCounts] = useState<Record<string, number>>({});

  const [expiredDocs, setExpiredDocs] = useState(0);
  const [expiringSoonDocs, setExpiringSoonDocs] = useState(0);

  const load = useCallback(async () => {
    if (!accountId || !canManageMembers) return;
    setLoading(true);

    const [
      employeesRes,
      deptRes,
      branchRes,
      attendanceRes,
      leaveRes,
      candidatesRes,
      docsRes,
    ] = await Promise.all([
      supabase.from('employees').select('id, employment_status, department_id, branch_id'),
      supabase.from('departments').select('id, name'),
      supabase.from('branches').select('id, name'),
      (() => {
        const { from, to } = monthRange();
        return supabase
          .from('attendance_records')
          .select('status')
          .gte('date', from)
          .lte('date', to);
      })(),
      supabase.from('leave_requests').select('status'),
      supabase.from('candidates').select('stage'),
      supabase.from('employee_documents').select('expiry_date').not('expiry_date', 'is', null),
    ]);

    if (employeesRes.error) toast.error('Failed to load report data');

    const employees = employeesRes.data ?? [];
    setTotalEmployees(employees.length);
    setActiveEmployees(employees.filter((e) => e.employment_status === 'active').length);

    const departments = (deptRes.data ?? []) as { id: string; name: string }[];
    const deptCounts = new Map<string, number>();
    for (const e of employees) {
      const key = e.department_id ?? '__none__';
      deptCounts.set(key, (deptCounts.get(key) ?? 0) + 1);
    }
    setHeadcountByDept(
      Array.from(deptCounts.entries())
        .map(([id, count]) => ({
          name: departments.find((d) => d.id === id)?.name ?? 'Unassigned',
          count,
        }))
        .sort((a, b) => b.count - a.count),
    );

    const branches = (branchRes.data ?? []) as { id: string; name: string }[];
    const branchCounts = new Map<string, number>();
    for (const e of employees) {
      const key = e.branch_id ?? '__none__';
      branchCounts.set(key, (branchCounts.get(key) ?? 0) + 1);
    }
    setHeadcountByBranch(
      Array.from(branchCounts.entries())
        .map(([id, count]) => ({
          name: branches.find((b) => b.id === id)?.name ?? 'Unassigned',
          count,
        }))
        .sort((a, b) => b.count - a.count),
    );

    const attCounts: Record<string, number> = {};
    for (const row of attendanceRes.data ?? []) {
      attCounts[row.status] = (attCounts[row.status] ?? 0) + 1;
    }
    setAttendanceCounts(attCounts);

    const lvCounts: Record<string, number> = {};
    for (const row of leaveRes.data ?? []) {
      lvCounts[row.status] = (lvCounts[row.status] ?? 0) + 1;
    }
    setLeaveCounts(lvCounts);

    const candCounts: Record<string, number> = {};
    for (const row of candidatesRes.data ?? []) {
      candCounts[row.stage] = (candCounts[row.stage] ?? 0) + 1;
    }
    setCandidateCounts(candCounts);

    const now = Date.now();
    let expired = 0;
    let soon = 0;
    for (const row of docsRes.data ?? []) {
      if (!row.expiry_date) continue;
      const days = Math.floor((new Date(row.expiry_date).getTime() - now) / 86_400_000);
      if (days < 0) expired += 1;
      else if (days <= 30) soon += 1;
    }
    setExpiredDocs(expired);
    setExpiringSoonDocs(soon);

    setLoading(false);
    // headcountByBranch/Dept are recomputed above rather than depended
    // on here — including them would just re-trigger this same
    // callback on every render since they're new arrays each time.
  }, [accountId, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!canManageMembers) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <FileWarning className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Reports are visible to account admins.
        </p>
      </div>
    );
  }

  const statCard = (
    icon: React.ReactNode,
    label: string,
    value: number | string,
    sub?: string,
  ) => (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Headcount, attendance, leave, recruitment, and document expiry — computed live.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCard(<Users className="size-4" />, 'Total employees', totalEmployees, `${activeEmployees} active`)}
        {statCard(
          <CalendarCheck className="size-4" />,
          'Present this month',
          attendanceCounts.present ?? 0,
          `${attendanceCounts.late ?? 0} late, ${attendanceCounts.absent ?? 0} absent`,
        )}
        {statCard(
          <CalendarDays className="size-4" />,
          'Pending leave requests',
          leaveCounts.pending ?? 0,
          `${leaveCounts.approved ?? 0} approved`,
        )}
        {statCard(
          <FileWarning className="size-4" />,
          'Documents needing attention',
          expiredDocs + expiringSoonDocs,
          `${expiredDocs} expired, ${expiringSoonDocs} expiring soon`,
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Headcount by department</h2>
        {headcountByDept.length === 0 ? (
          <p className="text-sm text-muted-foreground">No employees yet.</p>
        ) : (
          <div className="space-y-2">
            {headcountByDept.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-foreground">{d.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${totalEmployees > 0 ? (d.count / totalEmployees) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Headcount by branch</h2>
        {headcountByBranch.length === 0 ? (
          <p className="text-sm text-muted-foreground">No employees yet.</p>
        ) : (
          <div className="space-y-2">
            {headcountByBranch.map((b) => (
              <div key={b.name} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-foreground">{b.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${totalEmployees > 0 ? (b.count / totalEmployees) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Briefcase className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Recruitment pipeline</h2>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-7">
          {(['applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected'] as const).map(
            (stage) => (
              <div key={stage} className="rounded-xl border border-border p-3 text-center">
                <p className="text-lg font-bold text-foreground">{candidateCounts[stage] ?? 0}</p>
                <p className="text-xs capitalize text-muted-foreground">{stage}</p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
