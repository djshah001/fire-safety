import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, ClipboardList, Pencil, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  boqWorkspaceQuery, createBoqRevision, deleteEstimateLine, reviewBoq, saveBoqQuantity,
  saveEstimateLine, submitBoq, submitBoqCosting, type BoqLine, type BoqRevision,
  type EstimateCategory, type EstimateLine,
} from '@/api/engineering';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type Modal = 'create' | 'quantity' | 'estimate' | 'return-purchase' | 'return-final' | 'delete-estimate';
const categories: EstimateCategory[] = ['material', 'labour', 'transport', 'subcontracting', 'overhead', 'wastage', 'margin'];

export function BoqWorkspacePage() {
  const { jobId } = useParams();
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const workspace = useQuery(boqWorkspaceQuery(jobId));
  const [modal, setModal] = useState<Modal>();
  const [boq, setBoq] = useState<BoqRevision>();
  const [technicalLine, setTechnicalLine] = useState<BoqLine>();
  const [estimateLine, setEstimateLine] = useState<EstimateLine>();
  const [designRevisionId, setDesignRevisionId] = useState('');
  const [category, setCategory] = useState<EstimateCategory>('material');
  const [linkedLineId, setLinkedLineId] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['engineering', 'design-job', jobId, 'boqs'] });
  const close = () => { setModal(undefined); setBoq(undefined); setTechnicalLine(undefined); setEstimateLine(undefined); setCategory('material'); setLinkedLineId(''); };

  const formMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !workspace.data || !modal) throw new Error('BOQ workspace is unavailable.');
      if (modal === 'create') {
        const source = workspace.data.boqs[0];
        return createBoqRevision(jobId, {
          designRevisionId,
          sourceBoqRevisionId: source && ['returned', 'approved'].includes(source.status) ? source.id : undefined,
          title: String(form.get('title')),
          changeSummary: String(form.get('changeSummary')),
        });
      }
      if (!boq) throw new Error('BOQ revision is unavailable.');
      if (modal === 'quantity' && technicalLine) return saveBoqQuantity(jobId, boq.id, technicalLine, String(form.get('quantity')), boq.rowVersion);
      if (modal === 'estimate') return saveEstimateLine(jobId, boq.id, estimateLine?.id, {
        boqLineId: linkedLineId || undefined,
        category,
        description: String(form.get('description')),
        quantity: String(form.get('quantity')),
        unitRate: String(form.get('unitRate')),
        notes: String(form.get('notes')) || undefined,
        expectedBoqVersion: boq.rowVersion,
        expectedLineVersion: estimateLine?.rowVersion,
      });
      if (modal === 'delete-estimate' && estimateLine) return deleteEstimateLine(jobId, boq.id, estimateLine, boq.rowVersion);
      const stage = modal === 'return-purchase' ? 'purchase' : 'final';
      return reviewBoq(jobId, boq.id, stage, { decision: 'returned', reason: String(form.get('reason')), expectedVersion: boq.rowVersion });
    },
    async onSuccess() { await invalidate(); close(); toast.success('BOQ updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  const workflow = useMutation({
    mutationFn: async ({ revision, action }: { revision: BoqRevision; action: 'submit-quantity' | 'submit-costing' | 'approve-purchase' | 'approve-final' }) => {
      if (!jobId) return;
      if (action === 'submit-quantity') return submitBoq(jobId, revision.id, revision.rowVersion);
      if (action === 'submit-costing') return submitBoqCosting(jobId, revision.id, revision.rowVersion);
      return reviewBoq(jobId, revision.id, action === 'approve-purchase' ? 'purchase' : 'final', { decision: 'approved', expectedVersion: revision.rowVersion });
    },
    async onSuccess() { await invalidate(); toast.success('BOQ moved to the next workflow stage.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (workspace.isPending) return <main className="mx-auto max-w-7xl space-y-5 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-36" /><Skeleton className="h-96" /></main>;
  if (workspace.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to={`/engineering/design-jobs/${jobId}`}><ArrowLeft />Design job</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>BOQ unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(workspace.error)}</AlertDescription></Alert></main>;

  const { job, boqs, eligibleDesignRevisions } = workspace.data;
  const latestDesignId = eligibleDesignRevisions[0]?.id;
  const canCreate = user.id === job.designerUserId && Boolean(latestDesignId) && !boqs.some((item) => item.status === 'draft') && (boqs.length === 0 || ['returned', 'approved'].includes(boqs[0]!.status));

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <Button asChild className="-ml-2" variant="ghost"><Link to={`/engineering/design-jobs/${jobId}`}><ArrowLeft />{job.title}</Link></Button>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Engineering · {job.leadNumber}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Technical BOQ & costing</h1><p className="mt-2 max-w-3xl text-muted-foreground">The sector template fixes the item scope. Design enters quantities; purchase prepares costs and reviews; the assigned administrative approver gives final approval.</p></div>{canCreate && <Button onClick={() => { setDesignRevisionId(latestDesignId!); setModal('create'); }}><Plus />Create BOQ from template</Button>}</div>
    {eligibleDesignRevisions.length === 0 && <Alert className="mt-6"><AlertTitle>Customer-approved design required</AlertTitle><AlertDescription>Approve an exact design package before creating its sector-based BOQ.</AlertDescription></Alert>}
    <section className="mt-8 space-y-5">{boqs.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground"><ClipboardList className="mx-auto mb-3" />No BOQ revision has been created. If creation is blocked, ask the purchase manager to configure a template for this lead’s market sector.</CardContent></Card> : boqs.map((revision) => <Card key={revision.id}>
      <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="secondary">BOQ R{revision.revisionNumber}</Badge><StatusBadge status={revision.status} /></div><CardTitle className="mt-3">{revision.title}</CardTitle><CardDescription className="mt-1">{revision.templateNameSnapshot ?? 'Legacy BOQ'} · {revision.changeSummary}</CardDescription></div><div className="flex flex-wrap gap-2">
        {revision.canEditQuantity && <Button disabled={workflow.isPending || revision.technicalLines.some((line) => Number(line.quantity) <= 0)} onClick={() => workflow.mutate({ revision, action: 'submit-quantity' })}><Send />Send to costing</Button>}
        {revision.canEditCosting && <Button disabled={workflow.isPending || (revision.estimateLines?.length ?? 0) === 0} onClick={() => workflow.mutate({ revision, action: 'submit-costing' })}><Send />Send to purchase head</Button>}
        {revision.canPurchaseReview && <><Button variant="outline" onClick={() => { setBoq(revision); setModal('return-purchase'); }}>Return</Button><Button onClick={() => workflow.mutate({ revision, action: 'approve-purchase' })}><ShieldCheck />Purchase approve</Button></>}
        {revision.canFinalReview && <><Button variant="outline" onClick={() => { setBoq(revision); setModal('return-final'); }}>Return</Button><Button onClick={() => workflow.mutate({ revision, action: 'approve-final' })}><ShieldCheck />Final approve</Button></>}
      </div></div></CardHeader>
      <CardContent className="space-y-7 pt-5">
        <div><h3 className="font-semibold">Template technical scope</h3><p className="mb-3 text-xs text-muted-foreground">Items are selected by market sector; the design engineer only records full quantities.</p><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Section / item</TableHead><TableHead>Specification</TableHead><TableHead className="text-right">Quantity</TableHead>{revision.canEditQuantity && <TableHead className="w-16" />}</TableRow></TableHeader><TableBody>{revision.technicalLines.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell><p className="font-medium">{line.itemName}</p><p className="text-xs text-muted-foreground">{line.section} · {line.itemCode}</p></TableCell><TableCell>{line.specification}</TableCell><TableCell className="text-right tabular-nums">{line.quantity} {line.unitSymbol}</TableCell>{revision.canEditQuantity && <TableCell><Button aria-label={`Edit ${line.itemName} quantity`} size="icon-sm" variant="ghost" onClick={() => { setBoq(revision); setTechnicalLine(line); setModal('quantity'); }}><Pencil /></Button></TableCell>}</TableRow>)}</TableBody></Table></div></div>
        {revision.canViewEstimate ? <div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Purchase costing</h3><p className="text-xs text-muted-foreground">Visible only to explicitly assigned costing and approval employees.</p></div>{revision.canEditCosting && <Button size="sm" variant="outline" onClick={() => { setBoq(revision); setLinkedLineId(revision.technicalLines[0]?.id ?? ''); setModal('estimate'); }}><Plus />Add cost</Button>}</div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Quantity × rate</TableHead><TableHead className="text-right">Total</TableHead>{revision.canEditCosting && <TableHead className="w-24" />}</TableRow></TableHeader><TableBody>{(revision.estimateLines ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Purchase costing has not been entered.</TableCell></TableRow> : revision.estimateLines!.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell>{line.description}</TableCell><TableCell className="capitalize">{line.category}</TableCell><TableCell className="text-right tabular-nums">{line.quantity} × ₹{line.unitRate}</TableCell><TableCell className="text-right font-medium tabular-nums">₹{line.lineTotal}</TableCell>{revision.canEditCosting && <TableCell><div className="flex"><Button size="icon-sm" variant="ghost" onClick={() => { setBoq(revision); setEstimateLine(line); setCategory(line.category); setLinkedLineId(line.boqLineId ?? ''); setModal('estimate'); }}><Pencil /></Button><Button size="icon-sm" variant="ghost" onClick={() => { setBoq(revision); setEstimateLine(line); setModal('delete-estimate'); }}><Trash2 /></Button></div></TableCell>}</TableRow>)}</TableBody></Table></div><div className="mt-3 flex justify-end"><Badge variant="secondary"><Calculator />Total ₹{revision.estimateTotals?.total ?? '0.00'}</Badge></div></div> : <Alert><AlertTitle>Commercial costing is restricted</AlertTitle><AlertDescription>You can see the complete technical quantities, but costing is only visible to the explicitly assigned purchase and approval users.</AlertDescription></Alert>}
        {revision.reviews.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{revision.reviews.map((review) => <Alert key={review.reviewStage}><ShieldCheck /><AlertTitle className="capitalize">{review.reviewStage} review: {review.decision}</AlertTitle><AlertDescription>{review.reason || 'Approved without a note.'}</AlertDescription></Alert>)}</div>}
      </CardContent>
    </Card>)}</section>
    <BoqDialog modal={modal} boq={boq} line={technicalLine} estimate={estimateLine} eligible={eligibleDesignRevisions} designRevisionId={designRevisionId} setDesignRevisionId={setDesignRevisionId} category={category} setCategory={setCategory} linkedLineId={linkedLineId} setLinkedLineId={setLinkedLineId} error={formMutation.isError ? getApiErrorMessage(formMutation.error) : undefined} busy={formMutation.isPending} onClose={close} onSubmit={(form) => formMutation.mutate(form)} />
  </main>;
}

function BoqDialog({ modal, boq, line, estimate, eligible, designRevisionId, setDesignRevisionId, category, setCategory, linkedLineId, setLinkedLineId, error, busy, onClose, onSubmit }: {
  modal?: Modal; boq?: BoqRevision; line?: BoqLine; estimate?: EstimateLine; eligible: Array<{ id: string; revisionNumber: number; title: string }>;
  designRevisionId: string; setDesignRevisionId: (value: string) => void; category: EstimateCategory; setCategory: (value: EstimateCategory) => void;
  linkedLineId: string; setLinkedLineId: (value: string) => void; error?: string; busy: boolean; onClose: () => void; onSubmit: (form: FormData) => void;
}) {
  const deleting = modal === 'delete-estimate';
  const returning = modal === 'return-purchase' || modal === 'return-final';
  const title = modal === 'create' ? 'Create BOQ from sector template' : modal === 'quantity' ? `Enter quantity · ${line?.itemName}` : modal === 'estimate' ? `${estimate ? 'Edit' : 'Add'} purchase cost` : returning ? 'Return BOQ' : 'Delete cost line';
  return <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{modal === 'create' ? 'The lead market sector selects the item template and assigned costing/review chain.' : modal === 'quantity' ? 'Design engineering records quantity only. Purchase controls all costing.' : returning ? 'The submitted revision remains immutable; the designer can create a corrected revision.' : 'Server-side decimal validation and totals are authoritative.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-4">
    {modal === 'create' && <><SelectField label="Customer-approved design" value={designRevisionId} onValueChange={setDesignRevisionId} items={eligible.map((item) => ({ value: item.id, label: `R${item.revisionNumber} · ${item.title}` }))} /><Field label="BOQ title" name="title" required /><TextField label="Change summary" name="changeSummary" required /></>}
    {modal === 'quantity' && <Field label={`Full quantity (${line?.unitSymbol ?? ''})`} name="quantity" inputMode="decimal" min="0.0001" step="0.0001" defaultValue={line?.quantity} required />}
    {modal === 'estimate' && <><SelectField label="Technical BOQ line" value={linkedLineId} onValueChange={setLinkedLineId} items={(boq?.technicalLines ?? []).map((item) => ({ value: item.id, label: `${item.lineNumber} · ${item.itemName}` }))} /><SelectField label="Cost category" value={category} onValueChange={(value) => setCategory(value as EstimateCategory)} items={categories.map((value) => ({ value, label: value.replaceAll('_', ' ') }))} /><Field label="Description" name="description" required defaultValue={estimate?.description} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Quantity" name="quantity" inputMode="decimal" min="0.0001" step="0.0001" required defaultValue={estimate?.quantity} /><Field label="Unit rate (INR)" name="unitRate" inputMode="decimal" min="0" step="0.01" required defaultValue={estimate?.unitRate} /></div><TextField label="Notes" name="notes" defaultValue={estimate?.notes ?? ''} /></>}
    {returning && <TextField label="Return reason" name="reason" minLength={3} required />}
    {deleting && <Alert variant="destructive"><AlertDescription>Delete “{estimate?.description}” from this costing draft?</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (modal === 'create' && !designRevisionId) || (modal === 'estimate' && !linkedLineId)} variant={deleting ? 'destructive' : 'default'}>{deleting ? 'Delete' : returning ? 'Return BOQ' : 'Save'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`boq-${name}`}>{label}</Label><Input id={`boq-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) { return <div className="space-y-2"><Label htmlFor={`boq-${name}`}>{label}</Label><Textarea id={`boq-${name}`} name={name} {...props} /></div>; }
function SelectField({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
