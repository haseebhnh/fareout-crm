'use client';

// ============================================================
// HR — Employees.
//
// First real HR module: employee directory backed by `employees`,
// `departments`, `designations` (migration 044). Follows the same
// convention as /contacts and /pipelines — direct client-side
// Supabase calls, RLS is the enforcement boundary, no bespoke API
// route needed since there's no server-only logic (no encryption, no
// third-party call) in play here. Product-level access ("does this
// account have HR enabled") is gated one layer up in hr/layout.tsx,
// server-side — RLS only proves account membership, not product
// entitlement, so both gates matter and neither substitutes for the
// other.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

interface Department {
  id: string;
  name: string;
}

interface Designation {
  id: string;
  title: string;
}

interface Branch {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  designation_id: string | null;
  manager_id: string | null;
  branch_id: string | null;
  employment_status: 'active' | 'on_leave' | 'terminated';
  hired_at: string | null;
}

const STATUS_LABEL: Record<Employee['employment_status'], string> = {
  active: 'Active',
  on_leave: 'On leave',
  terminated: 'Terminated',
};

const STATUS_BADGE_CLASS: Record<Employee['employment_status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  on_leave: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  terminated: 'bg-muted text-muted-foreground',
};

interface EmployeeFormState {
  id: string | null;
  full_name: string;
  email: string;
  phone: string;
  department_id: string;
  designation_id: string;
  manager_id: string;
  branch_id: string;
  employment_status: Employee['employment_status'];
}

const EMPTY_FORM: EmployeeFormState = {
  id: null,
  full_name: '',
  email: '',
  phone: '',
  department_id: '',
  designation_id: '',
  manager_id: '',
  branch_id: '',
  employment_status: 'active',
};

export default function HrEmployeesPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [employeesRes, deptRes, desigRes, branchRes] = await Promise.all([
      supabase
        .from('employees')
        .select(
          'id, full_name, email, phone, department_id, designation_id, manager_id, branch_id, employment_status, hired_at',
        )
        .order('full_name', { ascending: true }),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('designations').select('id, title').order('title'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    ]);
    if (employeesRes.error) {
      toast.error('Failed to load employees');
    } else {
      setEmployees((employeesRes.data as Employee[]) ?? []);
    }
    setDepartments((deptRes.data as Department[]) ?? []);
    setDesignations((desigRes.data as Designation[]) ?? []);
    setBranches((branchRes.data as Branch[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // `load` sets state inside an async function body, not
    // synchronously in the effect itself — the linter can't trace
    // through the async boundary. Same pattern/justification as
    // pipelines/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const departmentName = (id: string | null) =>
    departments.find((d) => d.id === id)?.name ?? '—';
  const designationTitle = (id: string | null) =>
    designations.find((d) => d.id === id)?.title ?? '—';
  const managerName = (id: string | null) =>
    employees.find((e) => e.id === id)?.full_name ?? '—';
  const branchName = (id: string | null) =>
    branches.find((b) => b.id === id)?.name ?? '—';

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setForm({
      id: employee.id,
      full_name: employee.full_name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      department_id: employee.department_id ?? '',
      designation_id: employee.designation_id ?? '',
      manager_id: employee.manager_id ?? '',
      branch_id: employee.branch_id ?? '',
      employment_status: employee.employment_status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (form.manager_id && form.manager_id === form.id) {
      toast.error('An employee cannot be their own manager');
      return;
    }
    setSaving(true);
    const payload = {
      account_id: accountId,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department_id: form.department_id || null,
      designation_id: form.designation_id || null,
      manager_id: form.manager_id || null,
      branch_id: form.branch_id || null,
      employment_status: form.employment_status,
    };

    const { error } = form.id
      ? await supabase.from('employees').update(payload).eq('id', form.id)
      : await supabase.from('employees').insert(payload);

    if (error) {
      toast.error(error.message || 'Failed to save employee');
    } else {
      toast.success(form.id ? 'Employee updated' : 'Employee added');
      setDialogOpen(false);
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async (employee: Employee) => {
    const { error } = await supabase.from('employees').delete().eq('id', employee.id);
    if (error) {
      toast.error(error.message || 'Failed to remove employee');
    } else {
      toast.success('Employee removed');
      setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            HR directory — one record per person, whether or not they have an Ootrix login.
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add employee
          </Button>
        )}
      </div>

      {employees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No employees yet. {canManageMembers ? 'Add the first one to get started.' : ''}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact</TableHead>
                {canManageMembers && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium text-foreground">
                    {employee.full_name}
                  </TableCell>
                  <TableCell>{departmentName(employee.department_id)}</TableCell>
                  <TableCell>{designationTitle(employee.designation_id)}</TableCell>
                  <TableCell>{managerName(employee.manager_id)}</TableCell>
                  <TableCell>{branchName(employee.branch_id)}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[employee.employment_status]}`}
                    >
                      {STATUS_LABEL[employee.employment_status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {employee.email || employee.phone || '—'}
                  </TableCell>
                  {canManageMembers && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(employee)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(employee)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit employee' : 'Add employee'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="emp-name">Full name</Label>
              <Input
                id="emp-name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emp-email">Email</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-phone">Phone</Label>
                <Input
                  id="emp-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={form.department_id || '__none__'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, department_id: v === '__none__' || !v ? '' : v }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Select
                  value={form.designation_id || '__none__'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, designation_id: v === '__none__' || !v ? '' : v }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {designations.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Manager</Label>
              <Select
                value={form.manager_id || '__none__'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, manager_id: v === '__none__' || !v ? '' : v }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {employees
                    .filter((e) => e.id !== form.id)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines who can see and act on this employee&rsquo;s attendance,
                leave, goals, performance, and documents without needing admin access.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select
                value={form.branch_id || '__none__'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, branch_id: v === '__none__' || !v ? '' : v }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.employment_status}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    employment_status: v as Employee['employment_status'],
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
