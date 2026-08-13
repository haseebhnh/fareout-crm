'use client';

// ============================================================
// Staff — My Profile.
//
// Work info (department, designation, manager, employment dates) from
// the employee's own `employees` row — read-only, since editing it is
// an HR action. Personal info (name, avatar) is already editable at
// /settings; this page links there instead of duplicating that form.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface EmployeeProfile {
  full_name: string;
  email: string | null;
  phone: string | null;
  employment_status: string;
  hired_at: string | null;
  department_name: string | null;
  designation_name: string | null;
  manager_name: string | null;
}

export default function StaffProfilePage() {
  const { user, profile, profileLoading } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('employees')
      .select(
        'full_name, email, phone, employment_status, hired_at, manager_id, departments(name), designations(title)',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      const row = data as unknown as {
        full_name: string;
        email: string | null;
        phone: string | null;
        employment_status: string;
        hired_at: string | null;
        manager_id: string | null;
        departments: { name: string } | null;
        designations: { title: string } | null;
      };
      let managerName: string | null = null;
      if (row.manager_id) {
        const { data: manager } = await supabase
          .from('employees')
          .select('full_name')
          .eq('id', row.manager_id)
          .maybeSingle();
        managerName = (manager?.full_name as string | undefined) ?? null;
      }
      setEmployee({
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        employment_status: row.employment_status,
        hired_at: row.hired_at,
        department_name: row.departments?.name ?? null,
        designation_name: row.designations?.title ?? null,
        manager_name: managerName,
      });
    } else {
      setEmployee(null);
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!profileLoading) void load();
  }, [profileLoading, load]);

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your work details.{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Edit name & photo in Settings
          </Link>
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-border p-6">
        <Avatar className="size-16">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback>{(profile?.full_name ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-lg font-semibold text-foreground">{profile?.full_name}</p>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
        </div>
      </div>

      {!employee ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <UserCircle className="size-5" />
          You&rsquo;re not linked to an employee record yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ['Department', employee.department_name ?? '—'],
            ['Designation', employee.designation_name ?? '—'],
            ['Manager', employee.manager_name ?? '—'],
            ['Status', employee.employment_status],
            ['Hired', employee.hired_at ?? '—'],
            ['Work phone', employee.phone ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-medium capitalize text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
