'use client';

// ============================================================
// HR — Recruitment: job openings + candidate pipeline + interviews.
//
// Admin-managed (RLS: job_openings/candidates require admin+ to
// write, any member to read — recruitment coordination is HR/admin
// work). Interviews are scoped tighter: an interviewer sees/updates
// their own assigned interviews even without admin role (RLS on
// `interviews`), which is why "My interviews" exists as a section
// separate from the admin-only candidate table.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Briefcase, Users, Plus, Loader2, CalendarPlus, Download, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface JobOpening {
  id: string;
  title: string;
  employment_type: string;
  openings_count: number;
  status: 'open' | 'on_hold' | 'closed';
}

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  job_opening_id: string | null;
  stage: string;
  resume_storage_path: string | null;
  converted_employee_id: string | null;
}

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

const DEFAULT_ONBOARDING_ITEMS = [
  'Collect signed offer/contract',
  'Set up email and system access',
  'Assign equipment',
  'Complete orientation',
];

const SOURCES = ['manual', 'email', 'whatsapp', 'website', 'referral', 'job_portal'] as const;
const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual upload',
  email: 'Email',
  whatsapp: 'WhatsApp',
  website: 'Website',
  referral: 'Referral',
  job_portal: 'Job portal',
};

function buildCvPath(accountId: string, fileName: string): string {
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split('.').pop()!.toLowerCase() : 'pdf';
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'cv';
  return `account-${accountId}/${Date.now()}-${safeBase}.${ext}`;
}

interface Interview {
  id: string;
  candidate_id: string;
  scheduled_at: string;
  type: string;
  result: string;
}

const STAGES = [
  'applied',
  'screening',
  'interview',
  'assessment',
  'offer',
  'hired',
  'rejected',
] as const;

const STAGE_LABEL: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  assessment: 'Assessment',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
};

export default function RecruitmentPage() {
  const { accountId, canManageMembers, profileLoading, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [myInterviews, setMyInterviews] = useState<
    (Interview & { candidate_name: string })[]
  >([]);

  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState<string | null>(null);
  const [hireDialogCandidate, setHireDialogCandidate] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);

  const [jobForm, setJobForm] = useState({ title: '', employment_type: 'full_time' });
  const [candidateForm, setCandidateForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    source: 'manual',
    job_opening_id: '',
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [interviewForm, setInterviewForm] = useState({
    scheduled_at: '',
    type: 'video',
    location_or_link: '',
  });
  const [hireForm, setHireForm] = useState({
    department_id: '',
    designation_id: '',
    branch_id: '',
    hired_at: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    if (!accountId || !user) return;
    setLoading(true);

    if (canManageMembers) {
      const [jobRes, candRes, deptRes, desigRes, branchRes] = await Promise.all([
        supabase
          .from('job_openings')
          .select('id, title, employment_type, openings_count, status')
          .order('created_at', { ascending: false }),
        supabase
          .from('candidates')
          .select(
            'id, full_name, email, phone, source, job_opening_id, stage, resume_storage_path, converted_employee_id',
          )
          .order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('designations').select('id, title').order('title'),
        supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      ]);
      setJobs((jobRes.data as JobOpening[]) ?? []);
      setCandidates((candRes.data as Candidate[]) ?? []);
      setDepartments((deptRes.data as Department[]) ?? []);
      setDesignations((desigRes.data as Designation[]) ?? []);
      setBranches((branchRes.data as Branch[]) ?? []);
    }

    const { data: interviewRows } = await supabase
      .from('interviews')
      .select('id, candidate_id, scheduled_at, type, result, candidates(full_name)')
      .eq('interviewer_id', user.id)
      .order('scheduled_at', { ascending: true });
    setMyInterviews(
      ((interviewRows ?? []) as unknown as (Interview & {
        candidates: { full_name: string } | null;
      })[]).map((i) => ({ ...i, candidate_name: i.candidates?.full_name ?? '—' })),
    );

    setLoading(false);
  }, [accountId, user, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleCreateJob = async () => {
    if (!jobForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('job_openings').insert({
      account_id: accountId,
      title: jobForm.title.trim(),
      employment_type: jobForm.employment_type,
    });
    if (error) toast.error(error.message || 'Failed to create opening');
    else {
      toast.success('Opening created');
      setJobDialogOpen(false);
      setJobForm({ title: '', employment_type: 'full_time' });
      await load();
    }
    setSaving(false);
  };

  // Priority per spec: email, then phone. Both are optional fields, so
  // this only runs the checks that have something to match against —
  // an empty string would otherwise match every candidate with a null
  // email/phone, which is the opposite of a duplicate check.
  const findExistingCandidate = async (): Promise<Candidate | null> => {
    const email = candidateForm.email.trim();
    const phone = candidateForm.phone.trim();
    if (!email && !phone) return null;

    let query = supabase
      .from('candidates')
      .select('id, full_name, email, phone, source, job_opening_id, stage, resume_storage_path');
    if (email && phone) query = query.or(`email.eq.${email},phone.eq.${phone}`);
    else if (email) query = query.eq('email', email);
    else query = query.eq('phone', phone);

    const { data } = await query.limit(1).maybeSingle();
    return (data as Candidate) ?? null;
  };

  const uploadCvIfAny = async (): Promise<string | null> => {
    if (!cvFile || !accountId) return null;
    const path = buildCvPath(accountId, cvFile.name);
    const { error } = await supabase.storage.from('candidate-cvs').upload(path, cvFile);
    if (error) {
      toast.error(error.message || 'CV upload failed');
      return null;
    }
    return path;
  };

  const resetCandidateForm = () => {
    setCandidateForm({ full_name: '', email: '', phone: '', source: 'manual', job_opening_id: '' });
    setCvFile(null);
  };

  const handleCreateCandidate = async () => {
    if (!candidateForm.full_name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);

    const existing = await findExistingCandidate();

    if (existing) {
      // Rule #9: do not create a duplicate candidate. If they're
      // applying for a (different) job, that's a new application
      // against the SAME candidate row — candidate_applications'
      // UNIQUE(candidate_id, job_opening_id) also backstops this at
      // the database level if this check ever races.
      if (!candidateForm.job_opening_id) {
        toast.error(
          `${existing.full_name} already exists as a candidate. Select a job to add a new application, or open their existing record to update it.`,
        );
        setSaving(false);
        return;
      }
      if (existing.job_opening_id === candidateForm.job_opening_id) {
        toast.error(`${existing.full_name} has already applied for this job.`);
        setSaving(false);
        return;
      }
      const cvPath = await uploadCvIfAny();
      const { error } = await supabase.from('candidate_applications').insert({
        account_id: accountId,
        candidate_id: existing.id,
        job_opening_id: candidateForm.job_opening_id,
        source: candidateForm.source || null,
      });
      if (cvPath) {
        await supabase.from('candidates').update({ resume_storage_path: cvPath }).eq('id', existing.id);
      }
      if (error) {
        toast.error(error.message || 'Failed to add application');
      } else {
        toast.success(`Existing candidate matched — new application added for ${existing.full_name}`);
        setCandidateDialogOpen(false);
        resetCandidateForm();
        await load();
      }
      setSaving(false);
      return;
    }

    const cvPath = await uploadCvIfAny();
    const { error } = await supabase.from('candidates').insert({
      account_id: accountId,
      full_name: candidateForm.full_name.trim(),
      email: candidateForm.email.trim() || null,
      phone: candidateForm.phone.trim() || null,
      source: candidateForm.source || null,
      job_opening_id: candidateForm.job_opening_id || null,
      resume_storage_path: cvPath,
    });
    if (error) toast.error(error.message || 'Failed to add candidate');
    else {
      toast.success('Candidate added');
      setCandidateDialogOpen(false);
      resetCandidateForm();
      await load();
    }
    setSaving(false);
  };

  const handleDownloadCv = async (candidate: Candidate) => {
    if (!candidate.resume_storage_path) return;
    const { data, error } = await supabase.storage
      .from('candidate-cvs')
      .createSignedUrl(candidate.resume_storage_path, 60);
    if (error || !data) {
      toast.error('Failed to generate download link');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleStageChange = async (candidate: Candidate, stage: string) => {
    const { error } = await supabase
      .from('candidates')
      .update({ stage })
      .eq('id', candidate.id);
    if (error) toast.error(error.message || 'Failed to update stage');
    else {
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, stage } : c)),
      );
    }
  };

  const handleScheduleInterview = async (candidateId: string) => {
    if (!interviewForm.scheduled_at) {
      toast.error('Date/time is required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('interviews').insert({
      account_id: accountId,
      candidate_id: candidateId,
      interviewer_id: user?.id,
      scheduled_at: new Date(interviewForm.scheduled_at).toISOString(),
      type: interviewForm.type,
      location_or_link: interviewForm.location_or_link.trim() || null,
    });
    if (error) toast.error(error.message || 'Failed to schedule interview');
    else {
      toast.success('Interview scheduled');
      setInterviewDialogOpen(null);
      setInterviewForm({ scheduled_at: '', type: 'video', location_or_link: '' });
      await load();
    }
    setSaving(false);
  };

  const handleResult = async (interview: Interview, result: 'pass' | 'fail') => {
    const { error } = await supabase
      .from('interviews')
      .update({ result })
      .eq('id', interview.id);
    if (error) toast.error(error.message || 'Failed to record result');
    else {
      toast.success('Result recorded');
      await load();
    }
  };

  // Rule #23: "Do not create another employee record" — this maps
  // the existing candidate onto the existing `employees` table (044),
  // it does not invent a parallel record. `converted_employee_id`
  // both records the link and, once set, is what the UI checks to
  // stop a second conversion of the same candidate.
  const handleCreateEmployee = async () => {
    if (!hireDialogCandidate || !accountId) return;
    setSaving(true);
    const { data: employee, error } = await supabase
      .from('employees')
      .insert({
        account_id: accountId,
        full_name: hireDialogCandidate.full_name,
        email: hireDialogCandidate.email,
        phone: hireDialogCandidate.phone,
        department_id: hireForm.department_id || null,
        designation_id: hireForm.designation_id || null,
        branch_id: hireForm.branch_id || null,
        hired_at: hireForm.hired_at || null,
        employment_status: 'active',
      })
      .select('id')
      .single();

    if (error || !employee) {
      toast.error(error?.message || 'Failed to create employee');
      setSaving(false);
      return;
    }

    // Onboarding checklist — seeded with sensible defaults an admin
    // can edit/extend afterwards; this isn't meant to be exhaustive,
    // just a starting point so onboarding isn't a blank page.
    await supabase.from('employee_onboarding_items').insert(
      DEFAULT_ONBOARDING_ITEMS.map((title) => ({
        account_id: accountId,
        employee_id: employee.id,
        title,
      })),
    );

    const { error: linkErr } = await supabase
      .from('candidates')
      .update({ converted_employee_id: employee.id })
      .eq('id', hireDialogCandidate.id);
    if (linkErr) toast.error(linkErr.message || 'Employee created, but failed to link candidate');

    toast.success(`${hireDialogCandidate.full_name} added as an employee`);
    setHireDialogCandidate(null);
    setHireForm({ department_id: '', designation_id: '', branch_id: '', hired_at: new Date().toISOString().slice(0, 10) });
    await load();
    setSaving(false);
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Recruitment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Job openings, candidates, and interviews.
        </p>
      </div>

      {canManageMembers && (
        <>
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Job openings</h2>
              <Button size="sm" onClick={() => setJobDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> New opening
              </Button>
            </div>
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
                <Briefcase className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No openings yet.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Openings</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="font-medium text-foreground">{j.title}</TableCell>
                        <TableCell className="capitalize">
                          {j.employment_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell>{j.openings_count}</TableCell>
                        <TableCell className="capitalize">{j.status.replace('_', ' ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Candidates</h2>
              <Button size="sm" onClick={() => setCandidateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add candidate
              </Button>
            </div>
            {candidates.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
                <Users className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No candidates yet.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-foreground">
                          {c.full_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.email || c.phone || '—'}
                        </TableCell>
                        <TableCell>{SOURCE_LABEL[c.source ?? ''] ?? c.source ?? '—'}</TableCell>
                        <TableCell>
                          <Select
                            value={c.stage}
                            onValueChange={(v) => v && handleStageChange(c, v)}
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STAGE_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {c.resume_storage_path && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadCv(c)}
                                title="Download CV"
                              >
                                <Download className="size-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setInterviewDialogOpen(c.id)}
                              title="Schedule interview"
                            >
                              <CalendarPlus className="size-4" />
                            </Button>
                            {c.stage === 'hired' && !c.converted_employee_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setHireDialogCandidate(c)}
                                title="Create employee"
                                className="text-emerald-600 hover:text-emerald-600"
                              >
                                <UserPlus className="size-4" />
                              </Button>
                            )}
                            {c.converted_employee_id && (
                              <span className="flex items-center px-2 text-xs text-muted-foreground">
                                Employee
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">My interviews</h2>
        {myInterviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No interviews assigned to you.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {myInterviews.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium text-foreground">
                      {i.candidate_name}
                    </TableCell>
                    <TableCell>{new Date(i.scheduled_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{i.type}</TableCell>
                    <TableCell className="capitalize">{i.result}</TableCell>
                    <TableCell>
                      {i.result === 'pending' && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResult(i, 'pass')}
                            className="text-emerald-600 hover:text-emerald-600"
                          >
                            Pass
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResult(i, 'fail')}
                            className="text-destructive hover:text-destructive"
                          >
                            Fail
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New job opening</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="job-title">Title</Label>
              <Input
                id="job-title"
                value={jobForm.title}
                onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Employment type</Label>
              <Select
                value={jobForm.employment_type}
                onValueChange={(v) => v && setJobForm((f) => ({ ...f, employment_type: v }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreateJob} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candidateDialogOpen} onOpenChange={setCandidateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cand-name">Full name</Label>
              <Input
                id="cand-name"
                value={candidateForm.full_name}
                onChange={(e) =>
                  setCandidateForm((f) => ({ ...f, full_name: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cand-email">Email</Label>
                <Input
                  id="cand-email"
                  type="email"
                  value={candidateForm.email}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cand-phone">Phone</Label>
                <Input
                  id="cand-phone"
                  value={candidateForm.phone}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={candidateForm.source}
                onValueChange={(v) => v && setCandidateForm((f) => ({ ...f, source: v }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-cv">CV</Label>
              <Input
                id="cand-cv"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Applied for</Label>
              <Select
                value={candidateForm.job_opening_id || '__none__'}
                onValueChange={(v) =>
                  setCandidateForm((f) => ({
                    ...f,
                    job_opening_id: v === '__none__' || !v ? '' : v,
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCandidateDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCandidate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={interviewDialogOpen !== null}
        onOpenChange={(open) => !open && setInterviewDialogOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="int-when">Date &amp; time</Label>
              <Input
                id="int-when"
                type="datetime-local"
                value={interviewForm.scheduled_at}
                onChange={(e) =>
                  setInterviewForm((f) => ({ ...f, scheduled_at: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={interviewForm.type}
                onValueChange={(v) => v && setInterviewForm((f) => ({ ...f, type: v }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="int-location">Location / link</Label>
              <Textarea
                id="int-location"
                value={interviewForm.location_or_link}
                onChange={(e) =>
                  setInterviewForm((f) => ({ ...f, location_or_link: e.target.value }))
                }
                rows={2}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInterviewDialogOpen(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => interviewDialogOpen && handleScheduleInterview(interviewDialogOpen)}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hireDialogCandidate !== null}
        onOpenChange={(open) => !open && setHireDialogCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {hireDialogCandidate?.full_name} — name, email, and phone carry over from their
              candidate record.
            </p>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={hireForm.department_id || '__none__'}
                onValueChange={(v) =>
                  setHireForm((f) => ({ ...f, department_id: v === '__none__' || !v ? '' : v }))
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
                value={hireForm.designation_id || '__none__'}
                onValueChange={(v) =>
                  setHireForm((f) => ({ ...f, designation_id: v === '__none__' || !v ? '' : v }))
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
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select
                value={hireForm.branch_id || '__none__'}
                onValueChange={(v) =>
                  setHireForm((f) => ({ ...f, branch_id: v === '__none__' || !v ? '' : v }))
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
              <Label htmlFor="hire-date">Joining date</Label>
              <Input
                id="hire-date"
                type="date"
                value={hireForm.hired_at}
                onChange={(e) => setHireForm((f) => ({ ...f, hired_at: e.target.value }))}
                disabled={saving}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Creates a real employee record and a starter onboarding checklist (visible on the
              Employees page).
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHireDialogCandidate(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateEmployee} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
