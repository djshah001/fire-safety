import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, Pencil, Plus, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createQuotationRevision,
  issueQuotation,
  quotationDocumentUrl,
  quotationWorkspaceQuery,
  recordQuotationDecision,
  reviewQuotation,
  submitQuotation,
  updateQuotationHeader,
  updateQuotationLine,
  updateQuotationPaymentPlan,
  type QuotationLine,
  type QuotationRevision,
} from '@/api/quotations';
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

type Modal = 'create' | 'header' | 'line' | 'payment' | 'return' | 'accepted' | 'declined';

function optional(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

function money(currency: string, value: string) {
  return `${currency} ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function QuotationWorkspacePage() {
  const { jobId } = useParams();
  const queryClient = useQueryClient();
  const workspace = useQuery(quotationWorkspaceQuery(jobId));
  const [modal, setModal] = useState<Modal>();
  const [revision, setRevision] = useState<QuotationRevision>();
  const [line, setLine] = useState<QuotationLine>();
  const [boqRevisionId, setBoqRevisionId] = useState('');
  const [sourceRevisionId, setSourceRevisionId] = useState('none');
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['engineering', 'design-job', jobId, 'quotations'] }),
      queryClient.invalidateQueries({ queryKey: ['engineering', 'quotations'] }),
    ]);
  };
  const close = () => { setModal(undefined); setRevision(undefined); setLine(undefined); };

  const editor = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !modal) return;
      if (modal === 'create') return createQuotationRevision(jobId, {
        boqRevisionId,
        sourceRevisionId: sourceRevisionId === 'none' ? undefined : sourceRevisionId,
        title: String(form.get('title')),
        exclusions: String(form.get('exclusions')),
        deliveryTerms: String(form.get('deliveryTerms')),
        paymentTerms: String(form.get('paymentTerms')),
      });
      if (!revision) return;
      if (modal === 'header') return updateQuotationHeader(jobId, revision.id, {
        title: String(form.get('title')),
        validityDays: Number(form.get('validityDays')),
        exclusions: String(form.get('exclusions')),
        deliveryTerms: String(form.get('deliveryTerms')),
        paymentTerms: String(form.get('paymentTerms')),
        additionalDiscount: String(form.get('additionalDiscount')),
        taxLabel: optional(form.get('taxLabel')),
        taxAmount: String(form.get('taxAmount')),
        roundingAdjustment: String(form.get('roundingAdjustment')),
        expectedVersion: revision.rowVersion,
      });
      if (modal === 'line' && line) return updateQuotationLine(jobId, revision.id, line.id, {
        brandId: String(form.get('brandId')),
        unitRate: String(form.get('unitRate')),
        discountAmount: String(form.get('discountAmount')),
        notes: optional(form.get('notes')),
        expectedRevisionVersion: revision.rowVersion,
        expectedLineVersion: line.rowVersion,
      });
      if (modal === 'payment') return updateQuotationPaymentPlan(jobId, revision.id, {
        cashPercentage: String(form.get('cashPercentage')),
        nonCashPercentage: String(form.get('nonCashPercentage')),
        expectedVersion: revision.rowVersion,
      });
      if (modal === 'return') return reviewQuotation(jobId, revision.id, { decision: 'returned', reason: String(form.get('reason')), expectedVersion: revision.rowVersion });
      if (modal !== 'accepted' && modal !== 'declined') throw new Error('Quotation action is unavailable.');
      return recordQuotationDecision(jobId, revision.id, {
        decision: modal,
        evidenceReference: String(form.get('evidenceReference')),
        customerOrderReference: optional(form.get('customerOrderReference')),
        notes: optional(form.get('notes')),
        expectedVersion: revision.rowVersion,
      });
    },
    async onSuccess() { await invalidate(); close(); toast.success('Quotation updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  const action = useMutation({
    mutationFn: async ({ revision: current, type }: { revision: QuotationRevision; type: 'submit' | 'approve' | 'issue' }) => {
      if (!jobId) return;
      if (type === 'submit') return submitQuotation(jobId, current.id, current.rowVersion);
      if (type === 'approve') return reviewQuotation(jobId, current.id, { decision: 'approved', expectedVersion: current.rowVersion });
      return issueQuotation(jobId, current.id, current.rowVersion);
    },
    async onSuccess(_, variables) { await invalidate(); toast.success(variables.type === 'issue' ? 'Demo-labelled PDF issued and preserved.' : 'Quotation workflow updated.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (workspace.isPending) return <main className="mx-auto max-w-7xl space-y-5 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-36" /><Skeleton className="h-96" /></main>;
  if (workspace.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to="/engineering/quotations"><ArrowLeft />Quotations</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>Quotation unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(workspace.error, 'This quotation is unavailable or outside your assignment.')}</AlertDescription></Alert></main>;

  const { job, context, quotation, eligibleBoqs, revisions, capabilities } = workspace.data;
  const latest = revisions[0];
  const canCreate = capabilities.canWrite && eligibleBoqs.length > 0 && !revisions.some((item) => item.status === 'draft') && (!latest || ['returned', 'issued', 'declined'].includes(latest.status));
  const open = (next: Modal, current?: QuotationRevision, currentLine?: QuotationLine) => { setRevision(current); setLine(currentLine); setModal(next); };

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <Button asChild className="-ml-2" variant="ghost"><Link to="/engineering/quotations"><ArrowLeft />Quotations</Link></Button>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Commercial preparation · {context.leadNumber}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{quotation?.quotationNumber ?? 'New quotation'}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{job.title} · {context.customerName}</p></div>{canCreate && <Button onClick={() => { setBoqRevisionId(eligibleBoqs[0]!.id); setSourceRevisionId(latest && ['returned', 'issued', 'declined'].includes(latest.status) ? latest.id : 'none'); open('create'); }}><Plus />New quotation revision</Button>}</div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardDescription>Commercial state</CardDescription><CardTitle className="text-base"><StatusBadge status={context.opportunityCommercialState} /></CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Approved BOQ choices</CardDescription><CardTitle className="text-base">{eligibleBoqs.length}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Document mode</CardDescription><CardTitle className="text-base text-amber-700 dark:text-amber-400">Demo · not production</CardTitle></CardHeader></Card></div>
    {eligibleBoqs.length === 0 && <Alert className="mt-6"><AlertTitle>Approved BOQ required</AlertTitle><AlertDescription>An internally approved BOQ revision is required before quotation preparation. Project start remains a separate decision and does not wait for quotation acceptance.</AlertDescription></Alert>}
    <section className="mt-8 space-y-5">{revisions.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground"><FileText className="mx-auto mb-3" />No quotation revision has been prepared.</CardContent></Card> : revisions.map((current) => <Card key={current.id}><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Revision {current.revisionNumber}</Badge><StatusBadge status={current.status} />{current.issueDocument?.isDemo && <Badge variant="outline">Demo PDF</Badge>}</div><CardTitle className="mt-3">{current.title}</CardTitle><CardDescription className="mt-1">BOQ revision {eligibleBoqs.find((item) => item.id === current.boqRevisionId)?.revisionNumber ?? 'historical'} · valid {current.validityDays} days</CardDescription></div><div className="flex flex-wrap gap-2">
      {capabilities.canWrite && current.status === 'draft' && <><Button variant="outline" onClick={() => open('header', current)}><Pencil />Terms & totals</Button><Button disabled={action.isPending || Number(current.grandTotal) <= 0 || current.lines.some((item) => !item.brandId || !item.brandOptions.some((brand) => brand.id === item.brandId))} onClick={() => action.mutate({ revision: current, type: 'submit' })}><Send />Submit</Button></>}
      {capabilities.canApprove && current.status === 'submitted' && <><Button disabled={current.isContributor} variant="outline" onClick={() => open('return', current)}>Return</Button><Button disabled={current.isContributor || action.isPending} onClick={() => action.mutate({ revision: current, type: 'approve' })}><ShieldCheck />Approve</Button></>}
      {capabilities.canIssue && current.status === 'approved' && <Button disabled={action.isPending} onClick={() => action.mutate({ revision: current, type: 'issue' })}><FileText />Issue demo PDF</Button>}
      {capabilities.canRecordDecision && current.status === 'issued' && <><Button variant="outline" onClick={() => open('declined', current)}>Declined</Button><Button onClick={() => open('accepted', current)}>Accepted</Button></>}
      {current.issueDocument && <Button asChild variant="outline"><a href={quotationDocumentUrl(job.id, current.id, current.issueDocument.id)} target="_blank" rel="noreferrer"><Download />PDF snapshot</a></Button>}
    </div></div></CardHeader><CardContent className="space-y-7 pt-5">
      {current.status === 'submitted' && current.isContributor && capabilities.canApprove && <Alert><AlertTitle>Independent approval required</AlertTitle><AlertDescription>You contributed to this revision, so a different authorized sales manager must approve or return it.</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Subtotal" value={money(current.currency, current.subtotal)} /><Metric label="Discounts" value={money(current.currency, String(Number(current.lineDiscountTotal) + Number(current.additionalDiscount)))} /><Metric label={current.taxLabel ?? 'Tax (unconfigured)'} value={money(current.currency, current.taxAmount)} /><Metric label="Grand total" value={money(current.currency, current.grandTotal)} strong /></div>
      <div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Full quoted scope</h3><p className="text-xs text-muted-foreground">Copied from the complete approved BOQ; choose an allowed make and enter selling values for each line.</p></div></div>{current.status === 'draft' && current.lines.some((item) => item.brandOptions.length === 0) && <Alert className="mb-3" variant="destructive"><AlertTitle>Brand/make configuration required</AlertTitle><AlertDescription>At least one item has no active allowed make. Update the item master before submitting this quotation.</AlertDescription></Alert>}<div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Item / specification</TableHead><TableHead>Selected make</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="text-right">Total</TableHead>{capabilities.canWrite && current.status === 'draft' && <TableHead className="w-14" />}</TableRow></TableHeader><TableBody>{current.lines.map((item) => <TableRow key={item.id}><TableCell>{item.lineNumber}</TableCell><TableCell className="min-w-72"><p className="font-medium">{item.itemName}</p><p className="text-xs text-muted-foreground">{item.section} · {item.itemCode}</p><p className="mt-1 max-w-xl whitespace-normal text-xs">{item.specification}</p></TableCell><TableCell>{item.brandName ? <Badge variant="outline">{item.brandName}</Badge> : <span className="text-sm text-destructive">Not selected</span>}</TableCell><TableCell className="text-right tabular-nums">{item.quantity} {item.unitSymbol}</TableCell><TableCell className="text-right tabular-nums">{money(current.currency, item.unitRate)}</TableCell><TableCell className="text-right tabular-nums">{money(current.currency, item.discountAmount)}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(current.currency, item.lineTotal)}</TableCell>{capabilities.canWrite && current.status === 'draft' && <TableCell><Button size="icon-sm" variant="ghost" aria-label={`Configure ${item.itemName}`} onClick={() => open('line', current, item)}><Pencil /></Button></TableCell>}</TableRow>)}</TableBody></Table></div></div>
      <div className="grid gap-4 lg:grid-cols-3"><TextCard title="Exclusions" value={current.exclusions} /><TextCard title="Delivery terms" value={current.deliveryTerms} /><TextCard title="Payment terms" value={current.paymentTerms} /></div>
      {capabilities.canViewPaymentPlan ? <Card className="bg-muted/30"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">Payment plan</CardTitle><CardDescription>Forecast against the full {money(current.currency, current.grandTotal)} basis; this is not proof of receipt.</CardDescription></div>{capabilities.canWritePaymentPlan && current.status === 'draft' && <Button size="sm" variant="outline" onClick={() => open('payment', current)}><Pencil />Configure</Button>}</div></CardHeader><CardContent>{current.paymentPlan ? <div className="grid gap-3 sm:grid-cols-2"><Metric label="Cash plan" value={`${current.paymentPlan.cashPercentage}%`} /><Metric label="Non-cash plan" value={`${current.paymentPlan.nonCashPercentage}%`} /></div> : <p className="text-sm text-muted-foreground">Not configured. Submission will remain blocked until an authorized sales manager records a 100% reconciled split.</p>}</CardContent></Card> : <Alert><AlertTitle>Payment plan restricted</AlertTitle><AlertDescription>Sensitive cash/non-cash planning is omitted from your API response.</AlertDescription></Alert>}
      {current.review && <Alert><ShieldCheck /><AlertTitle>Sales review: {current.review.decision}</AlertTitle><AlertDescription>{current.review.reason || 'Approved without a return note.'}</AlertDescription></Alert>}
      {current.customerDecision && <Alert><AlertTitle>Customer: {current.customerDecision.decision}</AlertTitle><AlertDescription>Evidence: {current.customerDecision.evidenceReference}{current.customerDecision.customerOrderReference ? ` · Customer order: ${current.customerDecision.customerOrderReference}` : ''}</AlertDescription></Alert>}
    </CardContent></Card>)}</section>
    <QuotationDialog modal={modal} revision={revision} line={line} eligibleBoqs={eligibleBoqs} revisions={revisions} boqRevisionId={boqRevisionId} setBoqRevisionId={setBoqRevisionId} sourceRevisionId={sourceRevisionId} setSourceRevisionId={setSourceRevisionId} busy={editor.isPending} error={editor.isError ? getApiErrorMessage(editor.error) : undefined} onClose={close} onSubmit={(form) => editor.mutate(form)} />
  </main>;
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 tabular-nums ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</p></div>; }
function TextCard({ title, value }: { title: string; value: string }) { return <div className="rounded-lg border p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{value}</p></div>; }

function QuotationDialog({ modal, revision, line, eligibleBoqs, revisions, boqRevisionId, setBoqRevisionId, sourceRevisionId, setSourceRevisionId, busy, error, onClose, onSubmit }: {
  modal?: Modal; revision?: QuotationRevision; line?: QuotationLine;
  eligibleBoqs: Array<{ id: string; revisionNumber: number; title: string }>;
  revisions: QuotationRevision[]; boqRevisionId: string; setBoqRevisionId: (value: string) => void;
  sourceRevisionId: string; setSourceRevisionId: (value: string) => void; busy: boolean; error?: string;
  onClose: () => void; onSubmit: (form: FormData) => void;
}) {
  const title = modal === 'create' ? 'Create quotation revision' : modal === 'header' ? 'Edit terms and totals' : modal === 'line' ? 'Set selling price' : modal === 'payment' ? 'Configure payment plan' : modal === 'return' ? 'Return quotation' : `Record customer ${modal ?? 'decision'}`;
  return <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{modal === 'create' ? 'The complete approved BOQ scope is copied into this immutable revision chain.' : modal === 'payment' ? 'Cash and non-cash percentages must total exactly 100. This is a plan, not a receipt.' : modal === 'header' ? 'Tax and rounding are explicit demo inputs because production policy is not configured.' : modal === 'return' ? 'The submitted revision remains immutable; correction requires a new revision.' : modal === 'line' ? 'The backend recalculates every line and total using exact decimals.' : 'Record traceable evidence against this exact issued revision.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-4">
      {modal === 'create' && <><SelectField label="Approved BOQ" value={boqRevisionId} onValueChange={setBoqRevisionId} items={eligibleBoqs.map((item) => ({ value: item.id, label: `BOQ R${item.revisionNumber} · ${item.title}` }))} /><SelectField label="Copy pricing from (optional)" value={sourceRevisionId} onValueChange={setSourceRevisionId} items={[{ value: 'none', label: 'Start with zero rates' }, ...revisions.filter((item) => ['returned', 'issued', 'declined'].includes(item.status)).map((item) => ({ value: item.id, label: `Quotation R${item.revisionNumber} · ${item.status}` }))]} /><Field label="Title" name="title" required /><TextField label="Exclusions" name="exclusions" required /><TextField label="Delivery terms" name="deliveryTerms" required /><TextField label="Payment terms" name="paymentTerms" required /></>}
      {modal === 'header' && revision && <><Field label="Title" name="title" required defaultValue={revision.title} /><Field label="Validity (days)" name="validityDays" type="number" min={1} max={365} required defaultValue={revision.validityDays} /><TextField label="Exclusions" name="exclusions" required defaultValue={revision.exclusions} /><TextField label="Delivery terms" name="deliveryTerms" required defaultValue={revision.deliveryTerms} /><TextField label="Payment terms" name="paymentTerms" required defaultValue={revision.paymentTerms} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Additional discount" name="additionalDiscount" inputMode="decimal" required defaultValue={revision.additionalDiscount} /><Field label="Tax amount" name="taxAmount" inputMode="decimal" required defaultValue={revision.taxAmount} /></div><Field label="Tax description (required above zero)" name="taxLabel" defaultValue={revision.taxLabel ?? ''} /><Field label="Rounding adjustment" name="roundingAdjustment" inputMode="decimal" required defaultValue={revision.roundingAdjustment} /></>}
      {modal === 'line' && line && <><Alert><AlertTitle>{line.itemName}</AlertTitle><AlertDescription>{line.quantity} {line.unitSymbol} · {line.specification}</AlertDescription></Alert>{line.brandOptions.length === 0 ? <Alert variant="destructive"><AlertDescription>No active brand/make is assigned to this item. Configure it in Masters → Items first.</AlertDescription></Alert> : <div className="space-y-2"><Label htmlFor="quote-brandId">Brand / make</Label><Select defaultValue={line.brandId ?? undefined} name="brandId" required><SelectTrigger className="w-full" id="quote-brandId"><SelectValue placeholder="Choose an allowed make" /></SelectTrigger><SelectContent>{line.brandOptions.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name} ({brand.code})</SelectItem>)}</SelectContent></Select></div>}<Field label="Unit selling rate" name="unitRate" inputMode="decimal" required defaultValue={line.unitRate} /><Field label="Line discount amount" name="discountAmount" inputMode="decimal" required defaultValue={line.discountAmount} /><TextField label="Commercial note" name="notes" defaultValue={line.notes ?? ''} /></>}
      {modal === 'payment' && revision && <><Field label="Cash plan (%)" name="cashPercentage" inputMode="decimal" required defaultValue={revision.paymentPlan?.cashPercentage ?? ''} /><Field label="Non-cash plan (%)" name="nonCashPercentage" inputMode="decimal" required defaultValue={revision.paymentPlan?.nonCashPercentage ?? ''} /><Alert><AlertDescription>The plan applies to the full quotation value and does not record or imply any actual receipt.</AlertDescription></Alert></>}
      {modal === 'return' && <TextField label="Return reason" name="reason" required />}
      {(modal === 'accepted' || modal === 'declined') && <><Field label="Evidence reference" name="evidenceReference" required placeholder="Email date, signed page, meeting note, or other traceable reference" /><Field label="Customer order / PO reference (optional)" name="customerOrderReference" /><TextField label="Notes" name="notes" /></>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (modal === 'create' && !boqRevisionId) || (modal === 'line' && line?.brandOptions.length === 0)}>Save</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`quote-${name}`}>{label}</Label><Input id={`quote-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) { return <div className="space-y-2"><Label htmlFor={`quote-${name}`}>{label}</Label><Textarea id={`quote-${name}`} name={name} {...props} /></div>; }
function SelectField({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
