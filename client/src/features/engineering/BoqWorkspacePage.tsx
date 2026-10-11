import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, ClipboardList, Pencil, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  boqCatalogQuery, boqWorkspaceQuery, createBoqRevision, deleteBoqLine, deleteEstimateLine,
  reviewBoq, saveBoqLine, saveEstimateLine, submitBoq,
  type BoqLine, type BoqRevision, type EstimateCategory, type EstimateLine,
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

type Modal = 'create' | 'technical' | 'estimate' | 'return' | 'delete-technical' | 'delete-estimate';
const categories: EstimateCategory[] = ['material', 'labour', 'transport', 'subcontracting', 'overhead', 'wastage', 'margin'];

export function BoqWorkspacePage() {
  const { jobId } = useParams();
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const workspace = useQuery(boqWorkspaceQuery(jobId));
  const catalog = useQuery(boqCatalogQuery(jobId));
  const [modal, setModal] = useState<Modal>();
  const [boq, setBoq] = useState<BoqRevision>();
  const [technicalLine, setTechnicalLine] = useState<BoqLine>();
  const [estimateLine, setEstimateLine] = useState<EstimateLine>();
  const [itemId, setItemId] = useState('');
  const [category, setCategory] = useState<EstimateCategory>('material');
  const [linkedLineId, setLinkedLineId] = useState('none');
  const [designRevisionId, setDesignRevisionId] = useState('');
  const close = () => { setModal(undefined); setBoq(undefined); setTechnicalLine(undefined); setEstimateLine(undefined); setItemId(''); setCategory('material'); setLinkedLineId('none'); };
  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ['engineering', 'design-job', jobId, 'boqs'] });

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !workspace.data || !modal) throw new Error('BOQ workspace is unavailable.');
      if (modal === 'create') {
        const latest = workspace.data.boqs[0];
        return createBoqRevision(jobId, { designRevisionId, sourceBoqRevisionId: latest && ['returned', 'approved'].includes(latest.status) ? latest.id : undefined, title: String(form.get('title')), changeSummary: String(form.get('changeSummary')) });
      }
      if (!boq) throw new Error('BOQ revision is unavailable.');
      if (modal === 'technical') return saveBoqLine(jobId, boq.id, technicalLine?.id, { itemId, section: String(form.get('section')), specification: String(form.get('specification')), brand: String(form.get('brand')) || undefined, model: String(form.get('model')) || undefined, quantity: String(form.get('quantity')), drawingReference: String(form.get('drawingReference')) || undefined, notes: String(form.get('notes')) || undefined, expectedBoqVersion: boq.rowVersion, expectedLineVersion: technicalLine?.rowVersion });
      if (modal === 'estimate') return saveEstimateLine(jobId, boq.id, estimateLine?.id, { boqLineId: linkedLineId === 'none' ? undefined : linkedLineId, category, description: String(form.get('description')), quantity: String(form.get('quantity')), unitRate: String(form.get('unitRate')), notes: String(form.get('notes')) || undefined, expectedBoqVersion: boq.rowVersion, expectedLineVersion: estimateLine?.rowVersion });
      if (modal === 'return') return reviewBoq(jobId, boq.id, { decision: 'returned', reason: String(form.get('reason')), expectedVersion: boq.rowVersion });
      if (modal === 'delete-technical' && technicalLine) return deleteBoqLine(jobId, boq.id, technicalLine, boq.rowVersion);
      if (modal === 'delete-estimate' && estimateLine) return deleteEstimateLine(jobId, boq.id, estimateLine, boq.rowVersion);
    },
    async onSuccess() { await invalidate(); close(); toast.success('BOQ workspace updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const quick = useMutation({
    mutationFn: async ({ revision, action }: { revision: BoqRevision; action: 'submit' | 'approve' }) => {
      if (!jobId) return;
      return action === 'submit' ? submitBoq(jobId, revision.id, revision.rowVersion) : reviewBoq(jobId, revision.id, { decision: 'approved', expectedVersion: revision.rowVersion });
    },
    async onSuccess() { await invalidate(); toast.success('BOQ workflow updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (workspace.isPending) return <main className="mx-auto max-w-7xl space-y-5 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-36" /><Skeleton className="h-96" /></main>;
  if (workspace.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to={`/engineering/design-jobs/${jobId}`}><ArrowLeft />Design job</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>BOQ unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(workspace.error, 'This BOQ is unavailable or outside your assignment.')}</AlertDescription></Alert></main>;
  const { job, boqs, eligibleDesignRevisions, canViewEstimate, canEditEstimate } = workspace.data;
  const isDesigner = user.id === job.designerUserId && user.permissions.includes('engineering.design.write');
  const isHead = user.id === job.designHeadUserId && user.permissions.includes('engineering.design.review');
  const newestDesignId = eligibleDesignRevisions[0]?.id;
  const canCreate = isDesigner && canEditEstimate && Boolean(newestDesignId) && !boqs.some((revision) => revision.status === 'draft') && (boqs.length === 0 || boqs[0]?.status === 'returned' || (boqs[0]?.status === 'approved' && boqs[0].designRevisionId !== newestDesignId));
  const openTechnical = (revision: BoqRevision, line?: BoqLine) => { setBoq(revision); setTechnicalLine(line); setItemId(line?.itemId ?? ''); setModal('technical'); };
  const openEstimate = (revision: BoqRevision, line?: EstimateLine) => { setBoq(revision); setEstimateLine(line); setCategory(line?.category ?? 'material'); setLinkedLineId(line?.boqLineId ?? 'none'); setModal('estimate'); };

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <Button asChild className="-ml-2" variant="ghost"><Link to={`/engineering/design-jobs/${jobId}`}><ArrowLeft />{job.title}</Link></Button>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Engineering · {job.leadNumber}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">BOQ & internal estimate</h1><p className="mt-2 max-w-3xl text-muted-foreground">The technical BOQ always represents the full physical scope. Costing is separate and permission controlled.</p></div>{canCreate && <Button onClick={() => { setDesignRevisionId(eligibleDesignRevisions[0]!.id); setModal('create'); }}><Plus />New BOQ revision</Button>}</div>
    {eligibleDesignRevisions.length === 0 && <Alert className="mt-6"><AlertTitle>Customer-approved design required</AlertTitle><AlertDescription>Record customer approval for an exact design package before preparing its BOQ baseline.</AlertDescription></Alert>}
    <section className="mt-8 space-y-5">{boqs.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground"><ClipboardList className="mx-auto mb-3" />No BOQ revision has been created.</CardContent></Card> : boqs.map((revision) => <Card key={revision.id}><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="secondary">BOQ R{revision.revisionNumber}</Badge><StatusBadge status={revision.status} /></div><CardTitle className="mt-3">{revision.title}</CardTitle><CardDescription className="mt-1">{revision.changeSummary} · Design revision {eligibleDesignRevisions.find((item) => item.id === revision.designRevisionId)?.revisionNumber ?? 'historical'}</CardDescription></div><div className="flex flex-wrap gap-2">{isDesigner && revision.status === 'draft' && <Button disabled={quick.isPending || revision.technicalLines.length === 0 || (revision.estimateLines?.length ?? 0) === 0} onClick={() => quick.mutate({ revision, action: 'submit' })}><Send />Submit BOQ</Button>}{isHead && revision.status === 'submitted' && <><Button variant="outline" onClick={() => { setBoq(revision); setModal('return'); }}>Return</Button><Button onClick={() => quick.mutate({ revision, action: 'approve' })}><ShieldCheck />Approve BOQ</Button></>}</div></div></CardHeader><CardContent className="space-y-7 pt-5">
        <div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Complete technical scope</h3><p className="text-xs text-muted-foreground">{revision.technicalLines.length} line{revision.technicalLines.length === 1 ? '' : 's'} · quantities are independent from payment methods</p></div>{isDesigner && revision.status === 'draft' && <Button size="sm" variant="outline" onClick={() => openTechnical(revision)}><Plus />Add line</Button>}</div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Section / item</TableHead><TableHead>Specification</TableHead><TableHead>Brand / model</TableHead><TableHead className="text-right">Full quantity</TableHead><TableHead>Drawing</TableHead>{isDesigner && revision.status === 'draft' && <TableHead className="w-20" />}</TableRow></TableHeader><TableBody>{revision.technicalLines.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Add the complete physical scope.</TableCell></TableRow> : revision.technicalLines.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell><p className="font-medium">{line.itemName}</p><p className="text-xs text-muted-foreground">{line.section} · {line.itemCode}</p></TableCell><TableCell className="max-w-72 whitespace-normal">{line.specification}</TableCell><TableCell>{[line.brand, line.model].filter(Boolean).join(' / ') || '—'}</TableCell><TableCell className="text-right font-medium tabular-nums">{line.quantity} {line.unitSymbol}</TableCell><TableCell>{line.drawingReference || '—'}</TableCell>{isDesigner && revision.status === 'draft' && <TableCell><div className="flex"><Button size="icon-sm" variant="ghost" aria-label="Edit technical line" onClick={() => openTechnical(revision, line)}><Pencil /></Button><Button size="icon-sm" variant="ghost" aria-label="Delete technical line" onClick={() => { setBoq(revision); setTechnicalLine(line); setModal('delete-technical'); }}><Trash2 /></Button></div></TableCell>}</TableRow>)}</TableBody></Table></div></div>
        {canViewEstimate ? <div><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Calculator className="size-4" />Internal cost estimate</h3><p className="text-xs text-muted-foreground">Separate from technical quantities · {revision.estimateCurrency}</p></div><div className="flex items-center gap-3">{revision.estimateTotals && <p className="text-lg font-semibold tabular-nums">₹{Number(revision.estimateTotals.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>}{canEditEstimate && revision.status === 'draft' && <Button size="sm" variant="outline" onClick={() => openEstimate(revision)}><Plus />Add cost</Button>}</div></div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Total</TableHead>{canEditEstimate && revision.status === 'draft' && <TableHead className="w-20" />}</TableRow></TableHeader><TableBody>{(revision.estimateLines?.length ?? 0) === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Add material, labour, transport, subcontracting, overhead, wastage or margin costs.</TableCell></TableRow> : revision.estimateLines!.map((line) => <TableRow key={line.id}><TableCell><StatusBadge status={line.category} /></TableCell><TableCell>{line.description}</TableCell><TableCell className="text-right tabular-nums">{line.quantity}</TableCell><TableCell className="text-right tabular-nums">₹{line.unitRate}</TableCell><TableCell className="text-right font-medium tabular-nums">₹{line.lineTotal}</TableCell>{canEditEstimate && revision.status === 'draft' && <TableCell><div className="flex"><Button size="icon-sm" variant="ghost" aria-label="Edit estimate line" onClick={() => openEstimate(revision, line)}><Pencil /></Button><Button size="icon-sm" variant="ghost" aria-label="Delete estimate line" onClick={() => { setBoq(revision); setEstimateLine(line); setModal('delete-estimate'); }}><Trash2 /></Button></div></TableCell>}</TableRow>)}</TableBody></Table></div></div> : <Alert><AlertTitle>Internal estimate restricted</AlertTitle><AlertDescription>Your assigned role can view the complete technical BOQ but does not receive cost fields from the API.</AlertDescription></Alert>}
        {revision.review && <Alert><ShieldCheck /><AlertTitle>BOQ review: {revision.review.decision}</AlertTitle><AlertDescription>{revision.review.reason || 'Approved without a return note.'}</AlertDescription></Alert>}
      </CardContent></Card>)}</section>
    <EditorDialog modal={modal} boq={boq} technicalLine={technicalLine} estimateLine={estimateLine} catalog={catalog.data ?? []} eligible={eligibleDesignRevisions} itemId={itemId} setItemId={setItemId} category={category} setCategory={setCategory} linkedLineId={linkedLineId} setLinkedLineId={setLinkedLineId} designRevisionId={designRevisionId} setDesignRevisionId={setDesignRevisionId} busy={mutation.isPending} error={mutation.isError ? getApiErrorMessage(mutation.error) : undefined} onClose={close} onSubmit={(form) => mutation.mutate(form)} />
  </main>;
}

function EditorDialog({ modal, boq, technicalLine, estimateLine, catalog, eligible, itemId, setItemId, category, setCategory, linkedLineId, setLinkedLineId, designRevisionId, setDesignRevisionId, busy, error, onClose, onSubmit }: { modal?: Modal; boq?: BoqRevision; technicalLine?: BoqLine; estimateLine?: EstimateLine; catalog: Array<{ id: string; code: string; name: string; specification: string | null; unitSymbol: string }>; eligible: Array<{ id: string; revisionNumber: number; title: string }>; itemId: string; setItemId: (value: string) => void; category: EstimateCategory; setCategory: (value: EstimateCategory) => void; linkedLineId: string; setLinkedLineId: (value: string) => void; designRevisionId: string; setDesignRevisionId: (value: string) => void; busy: boolean; error?: string; onClose: () => void; onSubmit: (form: FormData) => void }) {
  const deletion = modal === 'delete-technical' || modal === 'delete-estimate';
  const title = modal === 'create' ? 'Create BOQ revision' : modal === 'technical' ? `${technicalLine ? 'Edit' : 'Add'} technical line` : modal === 'estimate' ? `${estimateLine ? 'Edit' : 'Add'} estimate line` : modal === 'return' ? 'Return BOQ revision' : 'Delete line';
  return <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{deletion ? 'This removes the draft line. Submitted revisions cannot be changed.' : modal === 'create' ? 'Bind the complete BOQ and separate estimate to an exact customer-approved design revision.' : modal === 'return' ? 'The submitted revision remains immutable. The designer can copy it into a corrected revision.' : 'All calculations and validation are repeated by the server.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-4">
    {modal === 'create' && <><SelectField label="Customer-approved design" value={designRevisionId} onValueChange={setDesignRevisionId} items={eligible.map((item) => ({ value: item.id, label: `R${item.revisionNumber} · ${item.title}` }))} /><Field label="BOQ title" name="title" required defaultValue={boq?.title} /><TextField label="Change summary" name="changeSummary" required /></>}
    {modal === 'technical' && <><SelectField label="Item" value={itemId} onValueChange={setItemId} items={catalog.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unitSymbol})` }))} /><Field label="Section" name="section" required defaultValue={technicalLine?.section} /><TextField label="Specification snapshot" name="specification" required defaultValue={technicalLine?.specification ?? catalog.find((item) => item.id === itemId)?.specification ?? ''} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Brand" name="brand" defaultValue={technicalLine?.brand ?? ''} /><Field label="Model" name="model" defaultValue={technicalLine?.model ?? ''} /></div><Field label="Full quantity" name="quantity" inputMode="decimal" required defaultValue={technicalLine?.quantity} /><Field label="Drawing reference" name="drawingReference" defaultValue={technicalLine?.drawingReference ?? ''} /><TextField label="Notes" name="notes" defaultValue={technicalLine?.notes ?? ''} /></>}
    {modal === 'estimate' && <><SelectField label="Cost category" value={category} onValueChange={(value) => setCategory(value as EstimateCategory)} items={categories.map((value) => ({ value, label: value.replaceAll('_', ' ') }))} /><SelectField label="Technical BOQ line (optional)" value={linkedLineId} onValueChange={setLinkedLineId} items={[{ value: 'none', label: 'General cost' }, ...(boq?.technicalLines ?? []).map((line) => ({ value: line.id, label: `${line.lineNumber} · ${line.itemName}` }))]} /><Field label="Description" name="description" required defaultValue={estimateLine?.description} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Quantity" name="quantity" inputMode="decimal" required defaultValue={estimateLine?.quantity} /><Field label="Unit rate (INR)" name="unitRate" inputMode="decimal" required defaultValue={estimateLine?.unitRate} /></div><TextField label="Notes" name="notes" defaultValue={estimateLine?.notes ?? ''} /></>}
    {modal === 'return' && <TextField label="Return reason" name="reason" required />}
    {deletion && <Alert variant="destructive"><AlertDescription>Remove {technicalLine?.itemName ?? estimateLine?.description} from this draft?</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (modal === 'technical' && !itemId) || (modal === 'create' && !designRevisionId)} variant={deletion ? 'destructive' : 'default'}>{deletion ? 'Delete' : 'Save'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`boq-${name}`}>{label}</Label><Input id={`boq-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) { return <div className="space-y-2"><Label htmlFor={`boq-${name}`}>{label}</Label><Textarea id={`boq-${name}`} name={name} {...props} /></div>; }
function SelectField({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
