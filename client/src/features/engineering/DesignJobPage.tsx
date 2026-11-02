import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Camera, ClipboardList, Download, FileCode2, FileText, LockKeyhole, MapPinned, Plus, Send, ShieldCheck, Upload, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  createDesignRevision,
  createSurveyRevision,
  assignDesignEngineer,
  designFileUrl,
  designJobQuery,
  eligibleDesignersQuery,
  recordDesignCustomerDecision,
  finalizeSurveyRevision,
  reviewDesignRevision,
  sendDesignToCustomer,
  submitDesignRevision,
  surveyFileUrl,
  useDesignDeadlineBuffer,
  uploadDesignFile,
  uploadSurveyFile,
  type DesignRevision,
  type SurveyRevision,
} from '@/api/engineering';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { DesignDeadline } from './DesignDeadline';
import { StartProjectDialog } from '@/features/projects/StartProjectDialog';

type Action = 'assign' | 'create' | 'return' | 'customer-approved' | 'changes-requested';

export function DesignJobPage() {
  const { jobId } = useParams();
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const query = useQuery(designJobQuery(jobId));
  const designers = useQuery({ ...eligibleDesignersQuery(jobId), enabled: Boolean(jobId) && query.data?.job.status === 'awaiting_designer' });
  const [action, setAction] = useState<Action>();
  const [designerId, setDesignerId] = useState('');
  const [selectedRevision, setSelectedRevision] = useState<DesignRevision>();
  const [bufferOpen, setBufferOpen] = useState(false);
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['engineering', 'design-job', jobId] }), queryClient.invalidateQueries({ queryKey: ['engineering', 'design-jobs'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); };
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !query.data || !action) throw new Error('Design job is unavailable.');
      if (action === 'assign') return assignDesignEngineer(jobId, { designerUserId: designerId, expectedVersion: query.data.job.rowVersion });
      if (action === 'create') return createDesignRevision(jobId, { title: String(form.get('title')), changeSummary: String(form.get('changeSummary')), expectedJobVersion: query.data.job.rowVersion });
      if (!selectedRevision) throw new Error('Revision is unavailable.');
      if (action === 'return') return reviewDesignRevision(jobId, selectedRevision.id, { decision: 'returned', reason: String(form.get('reason')), expectedVersion: selectedRevision.rowVersion });
      return recordDesignCustomerDecision(jobId, selectedRevision.id, { decision: action === 'customer-approved' ? 'approved' : 'changes_requested', evidenceReference: String(form.get('evidenceReference') ?? '').trim(), notes: String(form.get('notes') ?? '').trim() || undefined, expectedVersion: selectedRevision.rowVersion });
    },
    async onSuccess() { await invalidate(); setAction(undefined); setSelectedRevision(undefined); toast.success('Design workflow updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const quickMutation = useMutation({
    mutationFn: async ({ revision, type }: { revision: DesignRevision; type: 'submit' | 'approve' | 'send' }) => {
      if (!jobId) return;
      if (type === 'submit') return submitDesignRevision(jobId, revision.id, revision.rowVersion);
      if (type === 'approve') return reviewDesignRevision(jobId, revision.id, { decision: 'approved', expectedVersion: revision.rowVersion });
      return sendDesignToCustomer(jobId, revision.id, revision.rowVersion);
    },
    async onSuccess() { await invalidate(); toast.success('Design workflow updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const uploadMutation = useMutation({
    mutationFn: async ({ revision, kind, files }: { revision: DesignRevision; kind: 'cad' | 'pdf'; files: File[] }) => { if (jobId) for (const file of files) await uploadDesignFile(jobId, revision.id, kind, file); },
    async onSuccess(_result, variables) { await invalidate(); toast.success(`${variables.files.length} private design file${variables.files.length === 1 ? '' : 's'} uploaded.`); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const bufferMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !query.data) throw new Error('Design job is unavailable.');
      return useDesignDeadlineBuffer(jobId, { reason: String(form.get('reason')), expectedVersion: query.data.job.rowVersion });
    },
    async onSuccess() { await invalidate(); setBufferOpen(false); toast.success('The deadline was extended by 3 calendar days.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const createSurveyMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId) throw new Error('Design job is unavailable.');
      return createSurveyRevision(jobId, {
        title: String(form.get('title')),
        changeSummary: String(form.get('changeSummary')),
        surveyedOn: String(form.get('surveyedOn')),
      });
    },
    async onSuccess() { await invalidate(); setSurveyDialogOpen(false); toast.success('Survey revision created.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const surveyUploadMutation = useMutation({
    mutationFn: async ({ revision, files }: { revision: SurveyRevision; files: File[] }) => {
      if (!jobId) throw new Error('Design job is unavailable.');
      for (const file of files) await uploadSurveyFile(jobId, revision.id, file);
    },
    async onSuccess(_result, variables) { await invalidate(); toast.success(`${variables.files.length} private survey file${variables.files.length === 1 ? '' : 's'} uploaded.`); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const finalizeSurveyMutation = useMutation({
    mutationFn: async (revision: SurveyRevision) => {
      if (!jobId) throw new Error('Design job is unavailable.');
      return finalizeSurveyRevision(jobId, revision.id, revision.rowVersion);
    },
    async onSuccess() { await invalidate(); toast.success('Survey revision finalized.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (query.isPending) return <main className="mx-auto max-w-6xl space-y-6 p-6"><Skeleton className="h-9 w-64" /><Skeleton className="h-36" /><Skeleton className="h-80" /></main>;
  if (query.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to="/engineering/design-jobs"><ArrowLeft />Design jobs</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>Design job unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(query.error, 'This job is unavailable or outside your assignment.')}</AlertDescription></Alert></main>;
  const { job, revisions, surveyRevisions, deadlineExtensions } = query.data;
  const isDesigner = (user.id === job.designerUserId || user.permissions.includes('system.access.all')) && user.permissions.includes('engineering.design.write');
  const isHead = (user.id === job.designHeadUserId || user.permissions.includes('system.access.all')) && user.permissions.includes('engineering.design.review');
  const canAssignDesigner = (user.id === job.designHeadUserId || user.permissions.includes('system.access.all')) && user.permissions.includes('engineering.design.assign_engineer') && job.status === 'awaiting_designer';
  const isSales = user.permissions.includes('engineering.design.customer_decision');
  const canCreate = isDesigner && ['authorized', 'returned', 'changes_requested'].includes(job.status);
  const canUseBuffer = isDesigner && !job.designerCompletedAt && Boolean(job.designDueAt) && job.bufferExtensionsUsed < 3;
  const canCreateSurvey = isDesigner && !surveyRevisions.some((revision) => revision.status === 'draft');

  return <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
    <Button asChild className="-ml-2" variant="ghost"><Link to="/engineering/design-jobs"><ArrowLeft />Design jobs</Link></Button>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-primary">Engineering · {job.leadNumber}</p><StatusBadge status={job.status} /></div><h1 className="mt-2 text-3xl font-semibold tracking-tight">{job.title}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{job.authorizationNotes}</p></div><div className="flex flex-wrap gap-2">{canAssignDesigner && <Button onClick={() => setAction('assign')}><UserRoundCheck />Assign design engineer</Button>}{job.status === 'customer_approved' && user.permissions.includes('project.start') && <StartProjectDialog jobId={job.id} jobTitle={job.title} />}<Button asChild variant="outline"><Link to={`/engineering/design-jobs/${job.id}/boq`}><ClipboardList />BOQ & estimate</Link></Button>{user.permissions.includes('engineering.quotation.read') && <Button asChild variant="outline"><Link to={`/engineering/design-jobs/${job.id}/quotations`}><FileText />Quotations</Link></Button>}{canCreate && <Button onClick={() => setAction('create')}><Plus />New revision</Button>}</div></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Card><CardHeader><CardDescription>Assigned designer</CardDescription><CardTitle className="text-base">{job.designerName ?? 'Awaiting assignment'}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Design head</CardDescription><CardTitle className="text-base">{job.designHeadName ?? 'Assigned reviewer'}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Site survey</CardDescription><CardTitle className="text-base">{job.surveyRequested ? 'Requested' : 'Optional · not requested'}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{surveyRevisions.length} recorded revision{surveyRevisions.length === 1 ? '' : 's'}</p></CardContent></Card><Card><CardHeader><CardDescription>First-submission timer</CardDescription><DesignDeadline job={job} /></CardHeader><CardContent>{canUseBuffer && <Button className="w-full" variant="outline" onClick={() => setBufferOpen(true)}>Use 3-day buffer</Button>}</CardContent></Card></div>
    {deadlineExtensions.length > 0 && <Card className="mt-4"><CardHeader><CardTitle className="text-base">Buffer history</CardTitle><CardDescription>Each extension adds exactly 3 calendar days and remains in the audit trail.</CardDescription></CardHeader><CardContent className="space-y-3">{deadlineExtensions.map((extension) => <div className="rounded-lg border p-3 text-sm" key={extension.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Buffer {extension.sequenceNumber} of 3</span><span className="text-xs text-muted-foreground">New deadline {new Date(extension.newDueAt).toLocaleString()}</span></div><p className="mt-1 text-muted-foreground">{extension.reason}</p></div>)}</CardContent></Card>}
    <section className="mt-8 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><MapPinned className="size-5 text-primary" />Site survey revisions</h2><p className="mt-1 text-sm text-muted-foreground">Survey evidence is optional and does not gate design work. Finalized revisions are immutable.</p></div>{canCreateSurvey && <Button variant="outline" onClick={() => setSurveyDialogOpen(true)}><Plus />New survey revision</Button>}</div>{surveyRevisions.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground"><Camera className="mx-auto mb-3" />No site survey evidence has been recorded. The CAD workflow can continue.</CardContent></Card> : surveyRevisions.map((revision) => <SurveyRevisionCard key={revision.id} revision={revision} jobId={job.id} canEdit={isDesigner} busy={surveyUploadMutation.isPending || finalizeSurveyMutation.isPending} onUpload={(files) => surveyUploadMutation.mutate({ revision, files })} onFinalize={() => finalizeSurveyMutation.mutate(revision)} />)}</section>
    <section className="mt-8 space-y-4"><div><h2 className="text-xl font-semibold">Package revisions</h2><p className="mt-1 text-sm text-muted-foreground">Submitted packages are frozen. Corrections and customer changes require a new revision.</p></div>{revisions.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><FileCode2 className="mx-auto mb-3" />{job.status === 'awaiting_designer' ? 'The design head must assign an engineer first.' : 'No revision has been created.'}</CardContent></Card> : revisions.map((revision) => <RevisionCard key={revision.id} revision={revision} jobId={job.id} isDesigner={isDesigner} isHead={isHead} isSales={isSales} busy={quickMutation.isPending || uploadMutation.isPending} onQuick={(type) => quickMutation.mutate({ revision, type })} onDialog={(next) => { mutation.reset(); setSelectedRevision(revision); setAction(next); }} onUpload={(kind, files) => uploadMutation.mutate({ revision, kind, files })} />)}</section>
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) { setAction(undefined); setSelectedRevision(undefined); setDesignerId(''); } }}><DialogContent><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{action === 'assign' ? 'Assign design engineer' : action === 'create' ? 'Create design revision' : action === 'return' ? 'Return revision' : action === 'customer-approved' ? 'Record customer approval' : 'Record changes requested'}</DialogTitle><DialogDescription>{action === 'assign' ? 'Only the assigned design head can select the engineer for this job.' : action === 'create' ? 'A new mutable draft will be added to this job.' : action === 'return' ? 'The submitted revision stays immutable; the designer will create a corrected revision.' : 'Identify evidence for this exact revision. A note or plan is not proof of another event.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-4">{action === 'assign' ? <div className="space-y-2"><Label>Design engineer</Label><Select value={designerId} onValueChange={setDesignerId}><SelectTrigger><SelectValue placeholder="Choose engineer" /></SelectTrigger><SelectContent>{designers.data?.map((designer) => <SelectItem key={designer.id} value={designer.id}>{designer.name} · {designer.email}</SelectItem>)}</SelectContent></Select></div> : action === 'create' ? <><Field label="Revision title" name="title" required /><div className="space-y-2"><Label htmlFor="changeSummary">Change summary</Label><Textarea id="changeSummary" name="changeSummary" required /></div></> : action === 'return' ? <div className="space-y-2"><Label htmlFor="reason">Return reason</Label><Textarea id="reason" name="reason" required /></div> : <><div className="space-y-2"><Field label="Evidence reference" name="evidenceReference" placeholder="Email date, meeting note, signed page, or other traceable reference" required minLength={3} maxLength={1_000} aria-describedby="evidenceReference-help" /><p id="evidenceReference-help" className="text-xs text-muted-foreground">Required: 3–1,000 characters identifying the customer response for this revision.</p></div><div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" maxLength={1_000} aria-describedby="customerNotes-help" /><p id="customerNotes-help" className="text-xs text-muted-foreground">Optional, up to 1,000 characters.</p></div></>}{mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}</div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setAction(undefined)}>Cancel</Button><Button disabled={mutation.isPending || (action === 'assign' && !designerId)} type="submit">{action === 'assign' ? 'Assign engineer' : 'Save'}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={bufferOpen} onOpenChange={setBufferOpen}><DialogContent><form onSubmit={(event) => { event.preventDefault(); bufferMutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>Use a 3-day buffer</DialogTitle><DialogDescription>This adds exactly 3 calendar days to the first-submission deadline. {3 - job.bufferExtensionsUsed} buffer{3 - job.bufferExtensionsUsed === 1 ? '' : 's'} remain before this request.</DialogDescription></DialogHeader><div className="mt-5 space-y-2"><Label htmlFor="bufferReason">Reason for buffer</Label><Textarea id="bufferReason" name="reason" minLength={3} maxLength={500} required />{bufferMutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(bufferMutation.error)}</AlertDescription></Alert>}</div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setBufferOpen(false)}>Cancel</Button><Button type="submit" disabled={bufferMutation.isPending}>{bufferMutation.isPending ? 'Extending…' : 'Extend deadline'}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={surveyDialogOpen} onOpenChange={setSurveyDialogOpen}><DialogContent><form onSubmit={(event) => { event.preventDefault(); createSurveyMutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>Create survey revision</DialogTitle><DialogDescription>Create a numbered draft for site photographs or a survey PDF. Upload at least one file before finalizing it.</DialogDescription></DialogHeader><div className="mt-5 space-y-4"><Field label="Survey title" name="title" minLength={2} maxLength={200} required /><div className="space-y-2"><Label htmlFor="surveyedOn">Survey date</Label><Input id="surveyedOn" name="surveyedOn" type="date" defaultValue={localDateValue(new Date())} required /></div><div className="space-y-2"><Label htmlFor="surveyChangeSummary">Revision summary</Label><Textarea id="surveyChangeSummary" name="changeSummary" minLength={2} maxLength={1000} placeholder="What this survey captures or what changed from the prior revision" required /></div>{createSurveyMutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(createSurveyMutation.error)}</AlertDescription></Alert>}</div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setSurveyDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createSurveyMutation.isPending}>{createSurveyMutation.isPending ? 'Creating…' : 'Create draft'}</Button></DialogFooter></form></DialogContent></Dialog>
  </main>;
}

function SurveyRevisionCard({ revision, jobId, canEdit, busy, onUpload, onFinalize }: { revision: SurveyRevision; jobId: string; canEdit: boolean; busy: boolean; onUpload: (files: File[]) => void; onFinalize: () => void }) {
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  return <Card><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">S{revision.revisionNumber}</Badge><StatusBadge status={revision.status} /><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{new Date(`${revision.surveyedOn}T00:00:00`).toLocaleDateString()}</span></div><CardTitle className="mt-3 text-lg">{revision.title}</CardTitle><CardDescription className="mt-1">{revision.changeSummary}</CardDescription></div>{revision.status === 'finalized' && <Badge className="gap-1" variant="outline"><LockKeyhole className="size-3" />Immutable</Badge>}</div></CardHeader><CardContent className="space-y-4 pt-5"><div className="grid gap-2 sm:grid-cols-2">{revision.files.map((file) => <div className="flex items-center justify-between gap-3 rounded-lg border p-3" key={file.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{file.originalName}</p><p className="text-xs text-muted-foreground">{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256 recorded</p></div><Button asChild size="icon-sm" variant="ghost"><a href={surveyFileUrl(jobId, revision.id, file.id)} target="_blank" rel="noreferrer" aria-label={`Open ${file.originalName}`}><Download /></a></Button></div>)}</div>{revision.files.length === 0 && <Alert><Camera /><AlertTitle>No survey file uploaded</AlertTitle><AlertDescription>This optional draft needs at least one PDF or image before it can be finalized.</AlertDescription></Alert>}{canEdit && revision.status === 'draft' && <><Separator /><div className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-64 flex-1"><UploadControl label="Upload survey PDF or photos" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onFile={onUpload} /></div><Button disabled={busy || revision.files.length === 0} onClick={() => setFinalizeOpen(true)}><LockKeyhole />Finalize revision</Button></div></>}{revision.status === 'finalized' && revision.finalizedAt && <p className="text-xs text-muted-foreground">Finalized {new Date(revision.finalizedAt).toLocaleString()}. Corrections require a new survey revision.</p>}</CardContent><Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}><DialogContent><DialogHeader><DialogTitle>Finalize survey S{revision.revisionNumber}?</DialogTitle><DialogDescription>This freezes the revision and its {revision.files.length} file{revision.files.length === 1 ? '' : 's'}. Later corrections require a new numbered survey revision.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setFinalizeOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => { setFinalizeOpen(false); onFinalize(); }}>Finalize revision</Button></DialogFooter></DialogContent></Dialog></Card>;
}

function RevisionCard({ revision, jobId, isDesigner, isHead, isSales, busy, onQuick, onDialog, onUpload }: { revision: DesignRevision; jobId: string; isDesigner: boolean; isHead: boolean; isSales: boolean; busy: boolean; onQuick: (type: 'submit' | 'approve' | 'send') => void; onDialog: (action: Exclude<Action, 'create' | 'assign'>) => void; onUpload: (kind: 'cad' | 'pdf', files: File[]) => void }) {
  const cadFiles = revision.files.filter((file) => file.kind === 'cad'); const pdfFiles = revision.files.filter((file) => file.kind === 'pdf');
  return <Card><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="secondary">R{revision.revisionNumber}</Badge><StatusBadge status={revision.status} /></div><CardTitle className="mt-3">{revision.title}</CardTitle><CardDescription className="mt-1">{revision.changeSummary}</CardDescription></div><div className="flex flex-wrap gap-2">{isDesigner && revision.status === 'draft' && <Button disabled={busy || cadFiles.length === 0 || pdfFiles.length === 0} onClick={() => onQuick('submit')}><Send />Submit for review</Button>}{isHead && revision.status === 'submitted' && <><Button disabled={busy} variant="outline" onClick={() => onDialog('return')}>Return</Button><Button disabled={busy} onClick={() => onQuick('approve')}><ShieldCheck />Approve</Button></>}{isSales && revision.status === 'internally_approved' && <Button disabled={busy} onClick={() => onQuick('send')}><Send />Mark sent to customer</Button>}{isSales && revision.status === 'sent_to_customer' && <><Button disabled={busy} variant="outline" onClick={() => onDialog('changes-requested')}>Changes requested</Button><Button disabled={busy} onClick={() => onDialog('customer-approved')}>Customer approved</Button></>}</div></div></CardHeader><CardContent className="space-y-5 pt-5"><div className="grid gap-5 md:grid-cols-2"><FileGroup title="Original CAD" icon={<FileCode2 className="size-4" />} files={cadFiles} jobId={jobId} revisionId={revision.id} /> <FileGroup title="PDF preview" icon={<FileText className="size-4" />} files={pdfFiles} jobId={jobId} revisionId={revision.id} /></div>{isDesigner && revision.status === 'draft' && <><Separator /><div className="grid gap-4 sm:grid-cols-2"><UploadControl label="Upload DWG or DXF" accept=".dwg,.dxf" disabled={busy} onFile={(file) => onUpload('cad', file)} /><UploadControl label="Upload PDF preview" accept="application/pdf,.pdf" disabled={busy} onFile={(file) => onUpload('pdf', file)} /></div></>}{revision.review && <Alert><ShieldCheck /><AlertTitle>Internal review: {revision.review.decision}</AlertTitle><AlertDescription>{revision.review.reason || 'No return reason was required.'}</AlertDescription></Alert>}{revision.customerDecision && <Alert><AlertTitle>Customer: {revision.customerDecision.decision.replaceAll('_', ' ')}</AlertTitle><AlertDescription>Evidence: {revision.customerDecision.evidenceReference}{revision.customerDecision.notes ? ` · ${revision.customerDecision.notes}` : ''}</AlertDescription></Alert>}</CardContent></Card>;
}

function FileGroup({ title, icon, files, jobId, revisionId }: { title: string; icon: React.ReactNode; files: DesignRevision['files']; jobId: string; revisionId: string }) { return <div><h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3><div className="mt-2 space-y-2">{files.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Not uploaded</p> : files.map((file) => <div className="flex items-center justify-between gap-3 rounded-lg border p-3" key={file.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{file.originalName}</p><p className="text-xs text-muted-foreground">{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256 recorded</p></div><Button asChild size="icon-sm" variant="ghost"><a href={designFileUrl(jobId, revisionId, file.id)} target={file.kind === 'pdf' ? '_blank' : undefined} rel="noreferrer" aria-label={`${file.kind === 'pdf' ? 'Preview' : 'Download'} ${file.originalName}`}><Download /></a></Button></div>)}</div></div>; }
function UploadControl({ label, accept, disabled, onFile }: { label: string; accept: string; disabled: boolean; onFile: (files: File[]) => void }) { return <div className="space-y-2"><Label>{label}</Label><div className="relative"><Upload className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-10" type="file" accept={accept} disabled={disabled} multiple onChange={(event) => { const files = [...(event.target.files ?? [])]; if (files.length) onFile(files); event.currentTarget.value = ''; }} /></div><p className="text-xs text-muted-foreground">Select one or more files.</p></div>; }
function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...props} /></div>; }
function localDateValue(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
