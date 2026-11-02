import { QuotationTermsEditor } from './QuotationTermsEditor';
import { quotationPreviewUrl, updateQuotationDocumentDetails } from '@/api/quotations';
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
  quotationExcelUrl,
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

type Modal = 'document' | 'create' | 'header' | 'line' | 'payment' | 'return' | 'accepted' | 'declined';

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
      if (modal === 'document') return updateQuotationDocumentDetails(jobId, revision.id, {
        senderName: optional(form.get('senderName')), senderAddress: optional(form.get('senderAddress')),
        senderTagline: optional(form.get('senderTagline')),
        senderContact: optional(form.get('senderContact')), senderGstin: optional(form.get('senderGstin')),
        recipientAddress: optional(form.get('recipientAddress')), recipientGstin: optional(form.get('recipientGstin')),
        recipientContact: optional(form.get('recipientContact')), recipientPhone: optional(form.get('recipientPhone')),
        documentDate: optional(form.get('documentDate')), bankDetails: optional(form.get('bankDetails')),
        signatory: optional(form.get('signatory')),
      }, revision.rowVersion);
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
        offeringId: String(form.get('offeringId')),
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
      {capabilities.canWrite && current.status === 'draft' && <><Button variant="outline" onClick={() => open('header', current)}><Pencil />Terms & totals</Button><Button variant="outline" onClick={() => open('document', current)}><Pencil />Document details</Button><Button disabled={action.isPending || Number(current.grandTotal) <= 0 || current.lines.some((item) => !item.offeringId || !item.offeringOptions.some((option) => option.id === item.offeringId))} onClick={() => action.mutate({ revision: current, type: 'submit' })}><Send />Submit</Button></>}
      {capabilities.canApprove && current.status === 'submitted' && <><Button disabled={current.isContributor && !capabilities.canOverrideApprovals} variant="outline" onClick={() => open('return', current)}>Return</Button><Button disabled={(current.isContributor && !capabilities.canOverrideApprovals) || action.isPending} onClick={() => action.mutate({ revision: current, type: 'approve' })}><ShieldCheck />Approve</Button></>}
      {capabilities.canIssue && current.status === 'approved' && <Button disabled={action.isPending} onClick={() => action.mutate({ revision: current, type: 'issue' })}><FileText />Issue demo PDF</Button>}
      {capabilities.canRecordDecision && current.status === 'issued' && <><Button variant="outline" onClick={() => open('declined', current)}>Declined</Button><Button onClick={() => open('accepted', current)}>Accepted</Button></>}
      {current.issueDocument && <Button asChild variant="outline"><a href={quotationDocumentUrl(job.id, current.id, current.issueDocument.id)} target="_blank" rel="noreferrer"><Download />PDF snapshot</a></Button>}
      <Button asChild variant="outline"><a href={quotationPreviewUrl(job.id, current.id)} target="_blank" rel="noreferrer"><FileText />Preview PDF</a></Button>
      <Button asChild variant="outline"><a href={quotationExcelUrl(job.id, current.id)}><Download />Excel</a></Button>
    </div></div></CardHeader><CardContent className="space-y-7 pt-5">
      {current.status === 'submitted' && current.isContributor && capabilities.canApprove && !capabilities.canOverrideApprovals && <Alert><AlertTitle>Independent approval required</AlertTitle><AlertDescription>You contributed to this revision, so a different authorized reviewer must approve or return it.</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Subtotal" value={money(current.currency, current.subtotal)} /><Metric label="Discounts" value={money(current.currency, String(Number(current.lineDiscountTotal) + Number(current.additionalDiscount)))} /><Metric label={current.taxLabel ?? 'Tax (unconfigured)'} value={money(current.currency, current.taxAmount)} /><Metric label="Grand total" value={money(current.currency, current.grandTotal)} strong /></div>
      <div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Full quoted scope and pricing</h3><p className="text-xs text-muted-foreground">Select one purchase-approved brand/model cost option per item. Its immutable BOQ rates and markup become the quotation price.</p></div></div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Item / specification</TableHead><TableHead>Brand / model</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Supply</TableHead><TableHead className="text-right">Labour</TableHead><TableHead className="text-right">Misc.</TableHead><TableHead className="text-right">Markup</TableHead><TableHead className="text-right">Unit quote</TableHead><TableHead className="text-right">Amount</TableHead>{capabilities.canWrite && current.status === 'draft' && <TableHead className="w-14" />}</TableRow></TableHeader><TableBody>{current.lines.map((item) => <TableRow key={item.id}><TableCell>{item.lineNumber}</TableCell><TableCell className="min-w-72"><p className="font-medium">{item.itemName}</p><p className="text-xs text-muted-foreground">{item.section} · {item.itemCode}</p><p className="mt-1 max-w-xl whitespace-normal text-xs">{item.specification}</p></TableCell><TableCell>{item.offeringId ? <div><Badge variant="outline">{item.brandName ?? 'Unbranded'}</Badge><p className="mt-1 text-xs text-muted-foreground">{item.manufacturerModel}{item.manufacturerSku ? ` · ${item.manufacturerSku}` : ''}</p></div> : <span className="text-sm text-destructive">Not selected</span>}</TableCell><TableCell className="text-right tabular-nums">{item.quantity} {item.unitSymbol}</TableCell><TableCell className="text-right tabular-nums">{money(current.currency, item.supplyRate)}</TableCell><TableCell className="text-right tabular-nums">{money(current.currency, item.labourRate)}</TableCell><TableCell className="text-right tabular-nums">{money(current.currency, item.miscellaneousRate)}</TableCell><TableCell className="text-right tabular-nums">{item.markupPercent}%<span className="block text-xs text-muted-foreground">{money(current.currency, item.markupAmount)}</span></TableCell><TableCell className="text-right tabular-nums">{money(current.currency, item.quotedUnitRate)}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(current.currency, item.lineTotal)}</TableCell>{capabilities.canWrite && current.status === 'draft' && <TableCell><Button size="icon-sm" variant="ghost" aria-label={`Configure ${item.itemName}`} onClick={() => open('line', current, item)}><Pencil /></Button></TableCell>}</TableRow>)}</TableBody></Table></div></div>
      <div className="grid gap-4 lg:grid-cols-3"><TextCard title="Exclusions" value={current.exclusions} /><TextCard title="Delivery terms" value={current.deliveryTerms} /><TextCard title="Payment terms" value={current.paymentTerms} /></div>
      {capabilities.canViewPaymentPlan ? <Card className="bg-muted/30"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">Payment plan</CardTitle><CardDescription>Forecast against the full {money(current.currency, current.grandTotal)} basis; this is not proof of receipt.</CardDescription></div>{capabilities.canWritePaymentPlan && current.status === 'accepted' && <Button size="sm" variant="outline" onClick={() => open('payment', current)}><Pencil />Configure</Button>}</div></CardHeader><CardContent>{current.paymentPlan ? <div className="grid gap-3 sm:grid-cols-2"><Metric label="Cash plan" value={`${current.paymentPlan.cashPercentage}%`} /><Metric label="Non-cash plan" value={`${current.paymentPlan.nonCashPercentage}%`} /></div> : <p className="text-sm text-muted-foreground">The payment plan is configured after customer acceptance. Cash and non-cash must total 100%.</p>}</CardContent></Card> : <Alert><AlertTitle>Payment plan restricted</AlertTitle><AlertDescription>Sensitive cash/non-cash planning is omitted from your API response.</AlertDescription></Alert>}
      {current.review && <Alert><ShieldCheck /><AlertTitle>Sales review: {current.review.decision}</AlertTitle><AlertDescription>{current.review.reason || 'Approved without a return note.'}</AlertDescription></Alert>}
      {current.customerDecision && <Alert><AlertTitle>Customer: {current.customerDecision.decision}</AlertTitle><AlertDescription>Evidence: {current.customerDecision.evidenceReference}{current.customerDecision.customerOrderReference ? ` · Customer order: ${current.customerDecision.customerOrderReference}` : ''}</AlertDescription></Alert>}
    </CardContent></Card>)}</section>
    <QuotationDialog modal={modal} revision={revision} line={line} defaults={workspace.data.defaults} eligibleBoqs={eligibleBoqs} revisions={revisions} boqRevisionId={boqRevisionId} setBoqRevisionId={setBoqRevisionId} sourceRevisionId={sourceRevisionId} setSourceRevisionId={setSourceRevisionId} busy={editor.isPending} error={editor.isError ? getApiErrorMessage(editor.error) : undefined} onClose={close} onSubmit={(form) => editor.mutate(form)} />
  </main>;
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 tabular-nums ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</p></div>; }
function TextCard({ title, value }: { title: string; value: string }) { return <div className="rounded-lg border p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{value}</p></div>; }

function QuotationDialog({ defaults, modal, revision, line, eligibleBoqs, revisions, boqRevisionId, setBoqRevisionId, sourceRevisionId, setSourceRevisionId, busy, error, onClose, onSubmit }: {
  defaults: { exclusions: string; deliveryTerms: string; paymentTerms: string }; modal?: Modal; revision?: QuotationRevision; line?: QuotationLine;
  eligibleBoqs: Array<{ id: string; revisionNumber: number; title: string }>;
  revisions: QuotationRevision[]; boqRevisionId: string; setBoqRevisionId: (value: string) => void;
  sourceRevisionId: string; setSourceRevisionId: (value: string) => void; busy: boolean; error?: string;
  onClose: () => void; onSubmit: (form: FormData) => void;
}) {
  const title = modal === 'document' ? 'Edit document details' : modal === 'create' ? 'Create quotation revision' : modal === 'header' ? 'Edit terms and totals' : modal === 'line' ? 'Configure quotation line' : modal === 'payment' ? 'Configure payment plan' : modal === 'return' ? 'Return quotation' : `Record customer ${modal ?? 'decision'}`;
  return <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-3xl"><form className="flex max-h-[90dvh] min-h-0 flex-col" onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6"><DialogTitle>{title}</DialogTitle><DialogDescription>{modal === 'create' ? 'The complete approved BOQ scope is copied into this immutable revision chain.' : modal === 'payment' ? 'Cash and non-cash percentages must total exactly 100. This is a plan, not a receipt.' : modal === 'header' ? 'Tax and rounding are explicit demo inputs because production policy is not configured.' : modal === 'return' ? 'The submitted revision remains immutable; correction requires a new revision.' : modal === 'line' ? 'The backend recalculates every line and total using exact decimals.' : 'Record traceable evidence against this exact issued revision.'}</DialogDescription></DialogHeader><div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
      {modal === 'document' && revision && <>
        <Alert><AlertTitle>Document details</AlertTitle><AlertDescription>These details belong to this revision. Preview the PDF before submission; later corrections require a new revision.</AlertDescription></Alert>
        <Field label="Company / sender name" name="senderName" maxLength={160} defaultValue={revision.documentDetails.senderName ?? ''} />
        <Field label="Company tagline (optional)" name="senderTagline" maxLength={200} defaultValue={revision.documentDetails.senderTagline ?? ''} />
        <TextField label="Company address" name="senderAddress" maxLength={600} defaultValue={revision.documentDetails.senderAddress ?? ''} />
        <Field label="Phone / email" name="senderContact" maxLength={200} defaultValue={revision.documentDetails.senderContact ?? ''} />
        <Field label="Company GSTIN" name="senderGstin" maxLength={40} defaultValue={revision.documentDetails.senderGstin ?? ''} />
        <Field label="Document date" name="documentDate" type="date" defaultValue={revision.documentDetails.documentDate ?? ''} />
        <TextField label="Customer address" name="recipientAddress" maxLength={600} defaultValue={revision.documentDetails.recipientAddress ?? ''} />
        <Field label="Customer GSTIN" name="recipientGstin" maxLength={40} defaultValue={revision.documentDetails.recipientGstin ?? ''} />
        <Field label="Customer contact person" name="recipientContact" maxLength={160} defaultValue={revision.documentDetails.recipientContact ?? ''} />
        <Field label="Customer contact phone" name="recipientPhone" maxLength={40} defaultValue={revision.documentDetails.recipientPhone ?? ''} />
        <TextField label="Bank details (optional)" name="bankDetails" maxLength={1000} defaultValue={revision.documentDetails.bankDetails ?? ''} />
        <Field label="Authorized signatory" name="signatory" maxLength={160} defaultValue={revision.documentDetails.signatory ?? ''} />
      </>}
      {modal === 'create' && <><SelectField label="Approved BOQ" value={boqRevisionId} onValueChange={setBoqRevisionId} items={eligibleBoqs.map((item) => ({ value: item.id, label: `BOQ R${item.revisionNumber} · ${item.title}` }))} /><SelectField label="Copy make and notes from (optional)" value={sourceRevisionId} onValueChange={setSourceRevisionId} items={[{ value: 'none', label: 'Start without prior selections' }, ...revisions.filter((item) => ['returned', 'issued', 'declined'].includes(item.status)).map((item) => ({ value: item.id, label: `Quotation R${item.revisionNumber} · ${item.status}` }))]} /><Field label="Title" name="title" required /><QuotationTermsEditor name="exclusions" defaultValue={defaults.exclusions} /><TextField label="Delivery terms" name="deliveryTerms" required defaultValue={defaults.deliveryTerms} /><TextField label="Payment terms" name="paymentTerms" required defaultValue={defaults.paymentTerms} /></>}
      {modal === 'header' && revision && <><Field label="Title" name="title" required defaultValue={revision.title} /><Field label="Validity (days)" name="validityDays" type="number" min={1} max={365} required defaultValue={revision.validityDays} /><QuotationTermsEditor name="exclusions" defaultValue={revision.exclusions} /><TextField label="Delivery terms" name="deliveryTerms" required defaultValue={revision.deliveryTerms} /><TextField label="Payment terms" name="paymentTerms" required defaultValue={revision.paymentTerms} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Additional discount" name="additionalDiscount" inputMode="decimal" required defaultValue={revision.additionalDiscount} /><Field label="Tax amount" name="taxAmount" inputMode="decimal" required defaultValue={revision.taxAmount} /></div><Field label="Tax description (required above zero)" name="taxLabel" defaultValue={revision.taxLabel ?? ''} /><Field label="Rounding adjustment" name="roundingAdjustment" inputMode="decimal" required defaultValue={revision.roundingAdjustment} /></>}
      {modal === 'line' && line && <><Alert><AlertTitle>{line.itemName}</AlertTitle><AlertDescription>{line.quantity} {line.unitSymbol} · {line.specification}</AlertDescription></Alert><div className="space-y-2"><Label htmlFor="quote-offeringId">Approved brand / model cost option</Label><Select defaultValue={line.offeringId ?? undefined} name="offeringId" required><SelectTrigger className="w-full" id="quote-offeringId"><SelectValue placeholder="Choose a priced offering" /></SelectTrigger><SelectContent>{line.offeringOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.brandName ?? 'Unbranded'} · {option.manufacturerModel} · {money(revision?.currency ?? 'INR', option.quotedUnitRate)}/unit{option.isPreferred ? ' · Preferred' : ''}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><Metric label="Current supply" value={line.supplyRate} /><Metric label="Current labour / installation" value={line.labourRate} /><Metric label="Current miscellaneous" value={line.miscellaneousRate} /><Metric label={`Current markup (${line.markupPercent}%)`} value={line.markupAmount} /><Metric label="Current quoted unit rate" value={line.quotedUnitRate} strong /><Metric label="Current line amount" value={line.lineTotal} strong /></div><TextField label="Commercial note" name="notes" defaultValue={line.notes ?? ''} /></>}
      {modal === 'payment' && revision && <><Field label="Cash plan (%)" name="cashPercentage" inputMode="decimal" required defaultValue={revision.paymentPlan?.cashPercentage ?? ''} /><Field label="Non-cash plan (%)" name="nonCashPercentage" inputMode="decimal" required defaultValue={revision.paymentPlan?.nonCashPercentage ?? ''} /><Alert><AlertDescription>The plan applies to the full quotation value and does not record or imply any actual receipt.</AlertDescription></Alert></>}
      {modal === 'return' && <TextField label="Return reason" name="reason" required />}
      {(modal === 'accepted' || modal === 'declined') && <><Field label="Evidence reference" name="evidenceReference" required placeholder="Email date, signed page, meeting note, or other traceable reference" /><Field label="Customer order / PO reference (optional)" name="customerOrderReference" /><TextField label="Notes" name="notes" /></>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </div><DialogFooter className="mx-0 mt-0 mb-0 shrink-0 rounded-none px-5 py-4 sm:px-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (modal === 'create' && !boqRevisionId)}>Save</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`quote-${name}`}>{label}</Label><Input id={`quote-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) { return <div className="space-y-2"><Label htmlFor={`quote-${name}`}>{label}</Label><Textarea id={`quote-${name}`} name={name} rows={3} className="field-sizing-fixed max-h-48 min-h-24 resize-y overflow-y-auto text-sm leading-relaxed" {...props} /></div>; }
function SelectField({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
