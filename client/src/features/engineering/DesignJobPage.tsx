import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Download, FileCode2, FileText, Plus, Send, ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  createDesignRevision,
  designFileUrl,
  designJobQuery,
  recordDesignCustomerDecision,
  reviewDesignRevision,
  sendDesignToCustomer,
  submitDesignRevision,
  uploadDesignFile,
  type DesignRevision,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type Action = 'create' | 'return' | 'customer-approved' | 'changes-requested';

export function DesignJobPage() {
  const { jobId } = useParams();
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const query = useQuery(designJobQuery(jobId));
  const [action, setAction] = useState<Action>();
  const [selectedRevision, setSelectedRevision] = useState<DesignRevision>();
  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ['engineering', 'design-job', jobId] });
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !query.data || !action) throw new Error('Design job is unavailable.');
      if (action === 'create') return createDesignRevision(jobId, { title: String(form.get('title')), changeSummary: String(form.get('changeSummary')), expectedJobVersion: query.data.job.rowVersion });
      if (!selectedRevision) throw new Error('Revision is unavailable.');
      if (action === 'return') return reviewDesignRevision(jobId, selectedRevision.id, { decision: 'returned', reason: String(form.get('reason')), expectedVersion: selectedRevision.rowVersion });
      return recordDesignCustomerDecision(jobId, selectedRevision.id, { decision: action === 'customer-approved' ? 'approved' : 'changes_requested', evidenceReference: String(form.get('evidenceReference')), notes: String(form.get('notes')) || undefined, expectedVersion: selectedRevision.rowVersion });
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
    mutationFn: async ({ revision, kind, file }: { revision: DesignRevision; kind: 'cad' | 'pdf'; file: File }) => { if (jobId) await uploadDesignFile(jobId, revision.id, kind, file); },
    async onSuccess() { await invalidate(); toast.success('Private design file uploaded.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (query.isPending) return <main className="mx-auto max-w-6xl space-y-6 p-6"><Skeleton className="h-9 w-64" /><Skeleton className="h-36" /><Skeleton className="h-80" /></main>;
  if (query.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to="/engineering/design-jobs"><ArrowLeft />Design jobs</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>Design job unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(query.error, 'This job is unavailable or outside your assignment.')}</AlertDescription></Alert></main>;
  const { job, revisions } = query.data;
  const isDesigner = user.id === job.designerUserId && user.permissions.includes('engineering.design.write');
  const isHead = user.id === job.designHeadUserId && user.permissions.includes('engineering.design.review');
  const isSales = user.permissions.includes('engineering.design.customer_decision');
  const canCreate = isDesigner && ['authorized', 'returned', 'changes_requested'].includes(job.status);

  return <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
    <Button asChild className="-ml-2" variant="ghost"><Link to="/engineering/design-jobs"><ArrowLeft />Design jobs</Link></Button>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-primary">Engineering · {job.leadNumber}</p><StatusBadge status={job.status} /></div><h1 className="mt-2 text-3xl font-semibold tracking-tight">{job.title}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{job.authorizationNotes}</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`/engineering/design-jobs/${job.id}/boq`}><ClipboardList />BOQ & estimate</Link></Button>{canCreate && <Button onClick={() => setAction('create')}><Plus />New revision</Button>}</div></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardDescription>Assigned designer</CardDescription><CardTitle className="text-base">{job.designerName ?? 'Assigned employee'}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Design head</CardDescription><CardTitle className="text-base">{job.designHeadName ?? 'Assigned reviewer'}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Site survey</CardDescription><CardTitle className="text-base">{job.surveyRequested ? 'Requested' : 'Optional · not requested'}</CardTitle></CardHeader></Card></div>
    <section className="mt-8 space-y-4"><div><h2 className="text-xl font-semibold">Package revisions</h2><p className="mt-1 text-sm text-muted-foreground">Submitted packages are frozen. Corrections and customer changes require a new revision.</p></div>{revisions.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><FileCode2 className="mx-auto mb-3" />No revision has been created.</CardContent></Card> : revisions.map((revision) => <RevisionCard key={revision.id} revision={revision} jobId={job.id} isDesigner={isDesigner} isHead={isHead} isSales={isSales} busy={quickMutation.isPending || uploadMutation.isPending} onQuick={(type) => quickMutation.mutate({ revision, type })} onDialog={(next) => { setSelectedRevision(revision); setAction(next); }} onUpload={(kind, file) => uploadMutation.mutate({ revision, kind, file })} />)}</section>
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) { setAction(undefined); setSelectedRevision(undefined); } }}><DialogContent><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{action === 'create' ? 'Create design revision' : action === 'return' ? 'Return revision' : action === 'customer-approved' ? 'Record customer approval' : 'Record changes requested'}</DialogTitle><DialogDescription>{action === 'create' ? 'A new mutable draft will be added to this job.' : action === 'return' ? 'The submitted revision stays immutable; the designer will create a corrected revision.' : 'Identify evidence for this exact revision. A note or plan is not proof of another event.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-4">{action === 'create' ? <><Field label="Revision title" name="title" required /><div className="space-y-2"><Label htmlFor="changeSummary">Change summary</Label><Textarea id="changeSummary" name="changeSummary" required /></div></> : action === 'return' ? <div className="space-y-2"><Label htmlFor="reason">Return reason</Label><Textarea id="reason" name="reason" required /></div> : <><Field label="Evidence reference" name="evidenceReference" placeholder="Email date, meeting note, signed page, or other traceable reference" required /><div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" /></div></>}{mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}</div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setAction(undefined)}>Cancel</Button><Button disabled={mutation.isPending} type="submit">Save</Button></DialogFooter></form></DialogContent></Dialog>
  </main>;
}

function RevisionCard({ revision, jobId, isDesigner, isHead, isSales, busy, onQuick, onDialog, onUpload }: { revision: DesignRevision; jobId: string; isDesigner: boolean; isHead: boolean; isSales: boolean; busy: boolean; onQuick: (type: 'submit' | 'approve' | 'send') => void; onDialog: (action: Exclude<Action, 'create'>) => void; onUpload: (kind: 'cad' | 'pdf', file: File) => void }) {
  const cadFiles = revision.files.filter((file) => file.kind === 'cad'); const pdfFiles = revision.files.filter((file) => file.kind === 'pdf');
  return <Card><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="secondary">R{revision.revisionNumber}</Badge><StatusBadge status={revision.status} /></div><CardTitle className="mt-3">{revision.title}</CardTitle><CardDescription className="mt-1">{revision.changeSummary}</CardDescription></div><div className="flex flex-wrap gap-2">{isDesigner && revision.status === 'draft' && <Button disabled={busy || cadFiles.length === 0 || pdfFiles.length === 0} onClick={() => onQuick('submit')}><Send />Submit for review</Button>}{isHead && revision.status === 'submitted' && <><Button disabled={busy} variant="outline" onClick={() => onDialog('return')}>Return</Button><Button disabled={busy} onClick={() => onQuick('approve')}><ShieldCheck />Approve</Button></>}{isSales && revision.status === 'internally_approved' && <Button disabled={busy} onClick={() => onQuick('send')}><Send />Mark sent to customer</Button>}{isSales && revision.status === 'sent_to_customer' && <><Button disabled={busy} variant="outline" onClick={() => onDialog('changes-requested')}>Changes requested</Button><Button disabled={busy} onClick={() => onDialog('customer-approved')}>Customer approved</Button></>}</div></div></CardHeader><CardContent className="space-y-5 pt-5"><div className="grid gap-5 md:grid-cols-2"><FileGroup title="Original CAD" icon={<FileCode2 className="size-4" />} files={cadFiles} jobId={jobId} revisionId={revision.id} /> <FileGroup title="PDF preview" icon={<FileText className="size-4" />} files={pdfFiles} jobId={jobId} revisionId={revision.id} /></div>{isDesigner && revision.status === 'draft' && <><Separator /><div className="grid gap-4 sm:grid-cols-2"><UploadControl label="Upload DWG or DXF" accept=".dwg,.dxf" disabled={busy} onFile={(file) => onUpload('cad', file)} /><UploadControl label="Upload PDF preview" accept="application/pdf,.pdf" disabled={busy} onFile={(file) => onUpload('pdf', file)} /></div></>}{revision.review && <Alert><ShieldCheck /><AlertTitle>Internal review: {revision.review.decision}</AlertTitle><AlertDescription>{revision.review.reason || 'No return reason was required.'}</AlertDescription></Alert>}{revision.customerDecision && <Alert><AlertTitle>Customer: {revision.customerDecision.decision.replaceAll('_', ' ')}</AlertTitle><AlertDescription>Evidence: {revision.customerDecision.evidenceReference}{revision.customerDecision.notes ? ` · ${revision.customerDecision.notes}` : ''}</AlertDescription></Alert>}</CardContent></Card>;
}

function FileGroup({ title, icon, files, jobId, revisionId }: { title: string; icon: React.ReactNode; files: DesignRevision['files']; jobId: string; revisionId: string }) { return <div><h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3><div className="mt-2 space-y-2">{files.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Not uploaded</p> : files.map((file) => <div className="flex items-center justify-between gap-3 rounded-lg border p-3" key={file.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{file.originalName}</p><p className="text-xs text-muted-foreground">{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256 recorded</p></div><Button asChild size="icon-sm" variant="ghost"><a href={designFileUrl(jobId, revisionId, file.id)} target={file.kind === 'pdf' ? '_blank' : undefined} rel="noreferrer" aria-label={`${file.kind === 'pdf' ? 'Preview' : 'Download'} ${file.originalName}`}><Download /></a></Button></div>)}</div></div>; }
function UploadControl({ label, accept, disabled, onFile }: { label: string; accept: string; disabled: boolean; onFile: (file: File) => void }) { return <div className="space-y-2"><Label>{label}</Label><div className="relative"><Upload className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-10" type="file" accept={accept} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ''; }} /></div></div>; }
function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...props} /></div>; }
