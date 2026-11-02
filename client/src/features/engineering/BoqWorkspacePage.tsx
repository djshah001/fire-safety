import { boqPdfUrl } from '@/api/engineering';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, ClipboardList, Pencil, Plus, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  boqWorkspaceQuery, createBoqRevision, reviewBoq, saveBoqMarkup, saveBoqQuantity,
  submitBoq, submitBoqCosting, type BoqLine, type BoqRevision, type EstimateLine,
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

type Modal = 'create' | 'quantity' | 'markup' | 'return-purchase' | 'return-final';

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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['engineering', 'design-job', jobId, 'boqs'] });
  const close = () => { setModal(undefined); setBoq(undefined); setTechnicalLine(undefined); setEstimateLine(undefined); };

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
      if (modal === 'markup' && estimateLine) return saveBoqMarkup(jobId, boq.id, estimateLine, String(form.get('markupPercent')), boq.rowVersion);
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
        <Button asChild variant="outline"><a href={boqPdfUrl(job.id, revision.id)} target="_blank" rel="noreferrer">BOQ PDF</a></Button>
        {revision.canEditQuantity && <Button disabled={workflow.isPending || revision.technicalLines.some((line) => Number(line.quantity) <= 0)} onClick={() => workflow.mutate({ revision, action: 'submit-quantity' })}><Send />Send to costing</Button>}
        {revision.canEditCosting && <Button disabled={workflow.isPending || (revision.estimateLines?.length ?? 0) === 0 || revision.estimateLines?.some((line) => line.markupPercent === null)} onClick={() => workflow.mutate({ revision, action: 'submit-costing' })}><Send />Send to purchase head</Button>}
        {revision.canPurchaseReview && <><Button variant="outline" onClick={() => { setBoq(revision); setModal('return-purchase'); }}>Return</Button><Button onClick={() => workflow.mutate({ revision, action: 'approve-purchase' })}><ShieldCheck />Purchase approve</Button></>}
        {revision.canFinalReview && <><Button variant="outline" onClick={() => { setBoq(revision); setModal('return-final'); }}>Return</Button><Button onClick={() => workflow.mutate({ revision, action: 'approve-final' })}><ShieldCheck />Final approve</Button></>}
      </div></div></CardHeader>
      <CardContent className="space-y-7 pt-5">
        <div><h3 className="font-semibold">Template technical scope</h3><p className="mb-3 text-xs text-muted-foreground">Items are selected by market sector; the design engineer only records full quantities.</p><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Section / item</TableHead><TableHead>Specification</TableHead><TableHead className="text-right">Quantity</TableHead>{revision.canEditQuantity && <TableHead className="w-16" />}</TableRow></TableHeader><TableBody>{revision.technicalLines.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell><p className="font-medium">{line.itemName}</p><p className="text-xs text-muted-foreground">{line.section} · {line.itemCode}</p></TableCell><TableCell>{line.specification}</TableCell><TableCell className="text-right tabular-nums">{line.quantity} {line.unitSymbol}</TableCell>{revision.canEditQuantity && <TableCell><Button aria-label={`Edit ${line.itemName} quantity`} size="icon-sm" variant="ghost" onClick={() => { setBoq(revision); setTechnicalLine(line); setModal('quantity'); }}><Pencil /></Button></TableCell>}</TableRow>)}</TableBody></Table></div></div>
        {revision.canViewEstimate ? <div><div className="mb-3"><h3 className="font-semibold">Brand/model costing matrix</h3><p className="text-xs text-muted-foreground">Each offering has an independent fixed rate snapshot. Purchase confirms markup for every option; quotation later selects one approved option.</p></div>{(revision.estimateLines?.length ?? 0) === 0 && <Alert className="mb-3" variant="destructive"><AlertTitle>Pricing is incomplete</AlertTitle><AlertDescription>Configure offerings and effective rates in Masters, then create a new BOQ revision.</AlertDescription></Alert>}<div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Description / offering</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Supply</TableHead><TableHead className="text-right">Labour</TableHead><TableHead className="text-right">Misc.</TableHead><TableHead className="text-right">Markup</TableHead><TableHead className="text-right">Unit rate</TableHead><TableHead className="text-right">Amount</TableHead>{revision.canEditCosting && <TableHead className="w-14" />}</TableRow></TableHeader><TableBody>{(revision.estimateLines ?? []).length === 0 ? <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No effective offering rates were available.</TableCell></TableRow> : revision.estimateLines!.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell><p>{line.description}</p><p className="text-xs text-muted-foreground">{line.brandName ?? 'Unbranded'} · {line.manufacturerModel}{line.manufacturerSku ? ` · ${line.manufacturerSku}` : ''}{line.isPreferredOffering ? ' · Preferred' : ''}</p></TableCell><TableCell className="text-right tabular-nums">{line.quantity}</TableCell><TableCell className="text-right tabular-nums">₹{line.supplyRate}</TableCell><TableCell className="text-right tabular-nums">₹{line.labourRate}</TableCell><TableCell className="text-right tabular-nums">₹{line.miscellaneousRate}</TableCell><TableCell className="text-right tabular-nums">{line.markupPercent === null ? <span className="text-destructive">Not confirmed</span> : `${line.markupPercent}% · ₹${line.markupAmount}`}</TableCell><TableCell className="text-right tabular-nums">{line.quotedUnitRate === null ? '—' : `₹${line.quotedUnitRate}`}</TableCell><TableCell className="text-right font-medium tabular-nums">₹{line.lineTotal}</TableCell>{revision.canEditCosting && <TableCell><Button size="icon-sm" variant="ghost" aria-label={`Set markup for ${line.description} ${line.manufacturerModel ?? ''}`} onClick={() => { setBoq(revision); setEstimateLine(line); setModal('markup'); }}><Pencil /></Button></TableCell>}</TableRow>)}</TableBody></Table></div><div className="mt-3 flex justify-end"><Badge variant="secondary"><Calculator />Preferred-option total ₹{revision.estimateTotals?.total ?? '0.00'}</Badge></div></div> : <Alert><AlertTitle>Commercial costing is restricted</AlertTitle><AlertDescription>You can see the complete technical quantities, but costing is only visible to the explicitly assigned purchase and approval users.</AlertDescription></Alert>}
        {revision.reviews.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{revision.reviews.map((review) => <Alert key={review.reviewStage}><ShieldCheck /><AlertTitle className="capitalize">{review.reviewStage} review: {review.decision}</AlertTitle><AlertDescription>{review.reason || 'Approved without a note.'}</AlertDescription></Alert>)}</div>}
      </CardContent>
    </Card>)}</section>
    <BoqDialog modal={modal} line={technicalLine} estimate={estimateLine} eligible={eligibleDesignRevisions} designRevisionId={designRevisionId} setDesignRevisionId={setDesignRevisionId} error={formMutation.isError ? getApiErrorMessage(formMutation.error) : undefined} busy={formMutation.isPending} onClose={close} onSubmit={(form) => formMutation.mutate(form)} />
  </main>;
}

function BoqDialog({ modal, line, estimate, eligible, designRevisionId, setDesignRevisionId, error, busy, onClose, onSubmit }: {
  modal?: Modal; line?: BoqLine; estimate?: EstimateLine; eligible: Array<{ id: string; revisionNumber: number; title: string }>;
  designRevisionId: string; setDesignRevisionId: (value: string) => void;
  error?: string; busy: boolean; onClose: () => void; onSubmit: (form: FormData) => void;
}) {
  const returning = modal === 'return-purchase' || modal === 'return-final';
  const title = modal === 'create' ? 'Create BOQ from sector template' : modal === 'quantity' ? `Enter quantity · ${line?.itemName}` : modal === 'markup' ? `Confirm markup · ${estimate?.description}` : 'Return BOQ';
  return <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{modal === 'create' ? 'The lead market sector selects the item template and assigned costing/review chain.' : modal === 'quantity' ? 'Design engineering records quantity only. Purchase controls all costing.' : returning ? 'The submitted revision remains immutable; the designer can create a corrected revision.' : 'Server-side decimal validation and totals are authoritative.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-4">
    {modal === 'create' && <><SelectField label="Customer-approved design" value={designRevisionId} onValueChange={setDesignRevisionId} items={eligible.map((item) => ({ value: item.id, label: `R${item.revisionNumber} · ${item.title}` }))} /><Field label="BOQ title" name="title" required /><TextField label="Change summary" name="changeSummary" required /></>}
    {modal === 'quantity' && <Field label={`Full quantity (${line?.unitSymbol ?? ''})`} name="quantity" inputMode="decimal" min="0.0001" step="0.0001" defaultValue={line?.quantity} required />}
    {modal === 'markup' && <><Alert><AlertTitle>Fixed rate snapshot</AlertTitle><AlertDescription>Supply ₹{estimate?.supplyRate} + labour ₹{estimate?.labourRate}. Miscellaneous ₹{estimate?.miscellaneousRate} is added after markup and is not part of the markup base.</AlertDescription></Alert><Field label="Markup percentage" name="markupPercent" inputMode="decimal" min="0" max="1000" step="0.0001" required defaultValue={estimate?.markupPercent ?? ''} /></>}
    {returning && <TextField label="Return reason" name="reason" minLength={3} required />}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (modal === 'create' && !designRevisionId)}>{returning ? 'Return BOQ' : 'Save'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`boq-${name}`}>{label}</Label><Input id={`boq-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) { return <div className="space-y-2"><Label htmlFor={`boq-${name}`}>{label}</Label><Textarea id={`boq-${name}`} name={name} {...props} /></div>; }
function SelectField({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
