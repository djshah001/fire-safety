import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CircleAlert, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createProcurementRfq,
  procurementWorkspaceQuery,
  recordVendorOffer,
  selectVendorOffer,
  type Equivalence,
  type ProcurementWorkspace,
} from '@/api/procurement';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type Modal = 'rfq' | 'offer' | 'select';

function amount(currency: string, value: string) {
  return `${currency} ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RequisitionWorkspacePage() {
  const { requisitionId } = useParams();
  const queryClient = useQueryClient();
  const workspace = useQuery(procurementWorkspaceQuery(requisitionId));
  const [modal, setModal] = useState<Modal>();
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [equivalence, setEquivalence] = useState<Record<string, Equivalence>>({});
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['procurement', 'requisitions', requisitionId] }),
      queryClient.invalidateQueries({ queryKey: ['procurement', 'requisitions'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };
  const close = () => { setModal(undefined); setVendorIds([]); setVendorId(''); setOfferId(''); setEquivalence({}); };

  const action = useMutation({
    mutationFn: async (form: FormData) => {
      if (!requisitionId || !workspace.data || !modal) throw new Error('Procurement action unavailable.');
      const data = workspace.data;
      if (modal === 'rfq') return createProcurementRfq(requisitionId, {
        vendorIds,
        responseDueDate: String(form.get('responseDueDate')),
        commercialTerms: String(form.get('commercialTerms')),
        expectedVersion: data.requisition.rowVersion,
      });
      if (modal === 'offer') return recordVendorOffer(requisitionId, {
        vendorId,
        vendorReference: String(form.get('vendorReference')),
        currency: String(form.get('currency')),
        taxBasis: String(form.get('taxBasis')),
        freightAmount: String(form.get('freightAmount')),
        leadTimeDays: form.get('leadTimeDays') ? Number(form.get('leadTimeDays')) : undefined,
        paymentTerms: String(form.get('paymentTerms')),
        warranty: String(form.get('warranty')),
        validUntil: String(form.get('validUntil') ?? '') || undefined,
        lines: data.rfqLines.map((line) => ({
          rfqLineId: line.id,
          unitRate: String(form.get(`rate:${line.id}`)),
          brandOffered: String(form.get(`brand:${line.id}`)),
          specificationOffered: String(form.get(`specification:${line.id}`)),
          equivalence: equivalence[line.id] ?? 'unknown',
          deviationNotes: String(form.get(`deviation:${line.id}`) ?? '').trim() || undefined,
        })),
      });
      if (!data.comparison) throw new Error('Comparison unavailable.');
      return selectVendorOffer(requisitionId, {
        offerId,
        selectionReason: String(form.get('selectionReason')),
        singleSourceExceptionReason: String(form.get('singleSourceExceptionReason') ?? '').trim() || undefined,
        expectedVersion: data.comparison.rowVersion,
      });
    },
    async onSuccess() { const message = modal === 'rfq' ? 'Internal RFQ workspace created.' : modal === 'offer' ? 'Vendor offer recorded.' : 'Supplier selected with an audit trail.'; await invalidate(); close(); toast.success(message); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (workspace.isPending) return <main className="mx-auto max-w-7xl space-y-5 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-36" /><Skeleton className="h-96" /></main>;
  if (workspace.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to="/procurement/requisitions"><ArrowLeft />Requisitions</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>Requisition unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(workspace.error, 'This requisition is unavailable or outside your assignment.')}</AlertDescription></Alert></main>;

  const data = workspace.data;
  const { requisition, lines, rfq, offers, comparison, selection, capabilities } = data;
  const selectedOffer = offers.find((offer) => offer.id === selection?.selectedOfferId);
  const canSelect = capabilities.canSelect && comparison?.status === 'open' && offers.length > 0;
  const openOffer = () => { setVendorId(data.invitedVendors.find((vendor) => !offers.some((offer) => offer.vendorId === vendor.id))?.id ?? ''); setEquivalence(Object.fromEntries(data.rfqLines.map((line) => [line.id, 'equivalent']))); setModal('offer'); };

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <Button asChild className="-ml-2" variant="ghost"><Link to="/procurement/requisitions"><ArrowLeft />Requisitions</Link></Button>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">{requisition.projectNumber} · approved BOQ demand</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{requisition.requisitionNumber}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{requisition.title} · {requisition.projectTitle}</p></div><div className="flex flex-wrap gap-2">{capabilities.canManageRfq && !rfq && <Button onClick={() => setModal('rfq')}><Send />Create RFQ</Button>}{capabilities.canRecordOffer && rfq?.status === 'open' && data.invitedVendors.some((vendor) => !offers.some((offer) => offer.vendorId === vendor.id)) && <Button onClick={openOffer}><Plus />Record offer</Button>}{canSelect && <Button onClick={() => { setOfferId(offers[0]!.id); setModal('select'); }}><CheckCircle2 />Select supplier</Button>}</div></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="State" value={<StatusBadge status={requisition.status} />} /><Metric label="Required by" value={new Date(`${requisition.requiredBy}T00:00:00`).toLocaleDateString()} /><Metric label="Assigned buyer" value={requisition.buyerName} /><Metric label="Purchase manager" value={requisition.purchaseManagerName} /></div>
    <Alert className="mt-6"><CircleAlert /><AlertTitle>Controlled sourcing workspace</AlertTitle><AlertDescription>This workspace records an internal RFQ and normalized offer evidence; it does not send anything to vendors. Quotation acceptance is not a procurement gate. Every deviation or unknown equivalence needs an immutable approval from the project’s assigned design head before that offer can be selected.</AlertDescription></Alert>
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"><section className="space-y-6"><Card><CardHeader><CardTitle>Approved demand</CardTitle><CardDescription>Exact project BOQ line snapshots and bounded requested quantities.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Item / specification</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow></TableHeader><TableBody>{lines.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell className="min-w-72"><p className="font-medium">{line.itemNameSnapshot}</p><p className="text-xs text-muted-foreground">{line.itemCodeSnapshot} · {line.specificationSnapshot}</p></TableCell><TableCell className="text-right tabular-nums">{line.quantity} {line.unitSymbolSnapshot}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
      {rfq ? <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><CardTitle>{rfq.rfqNumber}</CardTitle><StatusBadge status={rfq.status} /></div><CardDescription className="mt-1">Responses due {new Date(`${rfq.responseDueDate}T00:00:00`).toLocaleDateString()}</CardDescription></div><Badge variant="outline">{data.invitedVendors.length} invited</Badge></div></CardHeader><CardContent className="space-y-4"><div><p className="text-xs font-medium text-muted-foreground">Invited vendors</p><p className="mt-1 text-sm">{data.invitedVendors.map((vendor) => `${vendor.name} (${vendor.code})`).join(', ')}</p></div><TextBlock label="Internal commercial terms" value={rfq.commercialTerms} /><p className="text-xs text-muted-foreground">External delivery: not configured or claimed.</p></CardContent></Card> : <Card><CardContent className="py-14 text-center text-muted-foreground"><Send className="mx-auto mb-3" />The assigned buyer has not created the internal RFQ.</CardContent></Card>}
      {rfq && <Card><CardHeader><CardTitle>Commercial comparison</CardTitle><CardDescription>{offers.length} submitted offer{offers.length === 1 ? '' : 's'}. Two distinct offers are the default; a purchase-manager exception is required below two.</CardDescription></CardHeader><CardContent>{offers.length === 0 ? <div className="py-10 text-center text-muted-foreground">No vendor offers recorded.</div> : <div className="space-y-5">{offers.map((offer) => { const technicalLines = offer.lines.filter((line) => line.equivalence !== 'equivalent'); const pendingTechnical = technicalLines.some((line) => !line.substitutionReview); const rejectedTechnical = technicalLines.some((line) => line.substitutionReview?.decision === 'rejected'); return <div className={`rounded-xl border p-4 ${selection?.selectedOfferId === offer.id ? 'border-primary bg-primary/5' : ''}`} key={offer.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{offer.vendorName}</h3><Badge variant="outline">{offer.vendorReference}</Badge>{selection?.selectedOfferId === offer.id && <Badge>Selected</Badge>}{rejectedTechnical ? <Badge variant="destructive">Engineering rejected</Badge> : pendingTechnical ? <Badge variant="destructive">Technical review pending</Badge> : technicalLines.length > 0 && <Badge variant="secondary">Engineering approved</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{offer.vendorCode} · recorded {new Date(offer.submittedAt).toLocaleString()}</p></div><p className="text-xl font-semibold tabular-nums">{amount(offer.currency, offer.total)}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SmallMetric label="Subtotal" value={amount(offer.currency, offer.subtotal)} /><SmallMetric label="Freight" value={amount(offer.currency, offer.freightAmount)} /><SmallMetric label="Lead time" value={offer.leadTimeDays === null ? 'Not stated' : `${offer.leadTimeDays} days`} /><SmallMetric label="Validity" value={offer.validUntil ? new Date(`${offer.validUntil}T00:00:00`).toLocaleDateString() : 'Not stated'} /></div><div className="mt-4 grid gap-3 md:grid-cols-3"><TextBlock label="Tax basis" value={offer.taxBasis} /><TextBlock label="Payment" value={offer.paymentTerms} /><TextBlock label="Warranty" value={offer.warranty} /></div><div className="mt-4 overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Make / specification</TableHead><TableHead>Technical basis</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Line total</TableHead></TableRow></TableHeader><TableBody>{offer.lines.map((line) => <TableRow key={line.id}><TableCell>{line.lineNumber}</TableCell><TableCell className="min-w-64"><p className="font-medium">{line.brandOffered}</p><p className="text-xs text-muted-foreground">{line.specificationOffered}</p></TableCell><TableCell><div className="flex flex-wrap gap-1"><StatusBadge status={line.equivalence} />{line.substitutionReview && <StatusBadge status={line.substitutionReview.decision} />}</div>{line.deviationNotes && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{line.deviationNotes}</p>}{line.substitutionReview && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{line.substitutionReview.reviewedByName}: {line.substitutionReview.reason}</p>}</TableCell><TableCell className="text-right tabular-nums">{amount(offer.currency, line.unitRate)}</TableCell><TableCell className="text-right tabular-nums">{amount(offer.currency, line.lineTotal)}</TableCell></TableRow>)}</TableBody></Table></div></div>; })}</div>}</CardContent></Card>}
    </section><aside className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Delivery</CardTitle></CardHeader><CardContent><p className="text-sm">{requisition.deliveryLocation}</p><p className="mt-4 text-xs text-muted-foreground">{requisition.notes || 'No internal notes.'}</p></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Selection decision</CardTitle></CardHeader><CardContent>{selection && selectedOffer ? <div className="space-y-3"><Badge>Selected</Badge><p className="font-semibold">{selectedOffer.vendorName}</p><TextBlock label="Reason" value={selection.selectionReason} />{selection.singleSourceExceptionReason && <TextBlock label="Single-source exception" value={selection.singleSourceExceptionReason} />}</div> : <p className="text-sm text-muted-foreground">No supplier has been selected. Lowest price is not automatically preferred; the manager must record the basis.</p>}</CardContent></Card></aside></div>
    <ActionDialog modal={modal} data={data} vendorIds={vendorIds} setVendorIds={setVendorIds} vendorId={vendorId} setVendorId={setVendorId} offerId={offerId} setOfferId={setOfferId} equivalence={equivalence} setEquivalence={setEquivalence} busy={action.isPending} error={action.isError ? getApiErrorMessage(action.error) : undefined} onClose={close} onSubmit={(form) => action.mutate(form)} />
  </main>;
}

function ActionDialog({ modal, data, vendorIds, setVendorIds, vendorId, setVendorId, offerId, setOfferId, equivalence, setEquivalence, busy, error, onClose, onSubmit }: {
  modal?: Modal; data: ProcurementWorkspace; vendorIds: string[]; setVendorIds: (ids: string[]) => void; vendorId: string; setVendorId: (id: string) => void; offerId: string; setOfferId: (id: string) => void; equivalence: Record<string, Equivalence>; setEquivalence: React.Dispatch<React.SetStateAction<Record<string, Equivalence>>>; busy: boolean; error?: string; onClose: () => void; onSubmit: (form: FormData) => void;
}) {
  const availableVendors = data.invitedVendors.filter((vendor) => !data.offers.some((offer) => offer.vendorId === vendor.id));
  return <Dialog open={Boolean(modal)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{modal === 'rfq' ? 'Create internal RFQ' : modal === 'offer' ? 'Record submitted vendor offer' : 'Select supplier'}</DialogTitle><DialogDescription>{modal === 'rfq' ? 'Choose active vendors and capture internal terms. This action does not send an external message.' : modal === 'offer' ? 'Normalize the complete offer across currency, freight, tax basis, lead time, make, specification, payment, and warranty.' : 'Selection needs an explicit reason. Lowest price is not mandatory, and technical issues remain blocked.'}</DialogDescription></DialogHeader><div className="mt-5 space-y-5">
      {modal === 'rfq' && <><div className="space-y-2"><Label>Invite active vendors</Label><div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{data.activeVendors.map((vendor) => <label className="flex items-center gap-3 rounded-md p-2 hover:bg-muted" key={vendor.id}><Checkbox checked={vendorIds.includes(vendor.id)} onCheckedChange={(checked) => setVendorIds(checked === true ? [...vendorIds, vendor.id] : vendorIds.filter((id) => id !== vendor.id))} /><span className="text-sm">{vendor.name} <span className="text-muted-foreground">({vendor.code})</span></span></label>)}</div></div><Field label="Response due" name="responseDueDate" type="date" required /><TextField label="Internal commercial terms" name="commercialTerms" required /></>}
      {modal === 'offer' && <><SelectField label="Invited vendor" value={vendorId} onChange={setVendorId} items={availableVendors.map((vendor) => ({ value: vendor.id, label: `${vendor.name} (${vendor.code})` }))} /><div className="grid gap-4 sm:grid-cols-3"><Field label="Vendor reference" name="vendorReference" required /><Field label="Currency" name="currency" required defaultValue="INR" maxLength={3} /><Field label="Freight amount" name="freightAmount" required inputMode="decimal" defaultValue="0.00" /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Lead time (days)" name="leadTimeDays" type="number" min={0} /><Field label="Valid until (optional)" name="validUntil" type="date" /></div><TextField label="Tax basis" name="taxBasis" required /><TextField label="Payment terms" name="paymentTerms" required /><TextField label="Warranty" name="warranty" required /><div><Label>Offer lines</Label><div className="mt-2 space-y-4">{data.rfqLines.map((line) => <Card key={line.id}><CardHeader className="pb-3"><CardTitle className="text-base">{line.lineNumber}. {line.itemNameSnapshot}</CardTitle><CardDescription>{line.quantity} {line.unitSymbolSnapshot} · {line.specificationSnapshot}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="Unit rate" name={`rate:${line.id}`} inputMode="decimal" required /><Field label="Brand / make" name={`brand:${line.id}`} required /><div className="sm:col-span-2"><TextField label="Offered specification" name={`specification:${line.id}`} required defaultValue={line.specificationSnapshot} /></div><SelectField label="Technical equivalence" value={equivalence[line.id] ?? 'unknown'} onChange={(value) => setEquivalence((current) => ({ ...current, [line.id]: value as Equivalence }))} items={[{ value: 'equivalent', label: 'Equivalent' }, { value: 'deviation', label: 'Deviation' }, { value: 'unknown', label: 'Unknown' }]} /><Field label="Deviation notes" name={`deviation:${line.id}`} required={equivalence[line.id] === 'deviation'} /></CardContent></Card>)}</div></div></>}
      {modal === 'select' && <><SelectField label="Submitted offer" value={offerId} onChange={setOfferId} items={data.offers.map((offer) => { const technical = offer.lines.filter((line) => line.equivalence !== 'equivalent'); const state = technical.some((line) => line.substitutionReview?.decision === 'rejected') ? ' · engineering rejected' : technical.some((line) => !line.substitutionReview) ? ' · technical review pending' : technical.length > 0 ? ' · engineering approved' : ''; return { value: offer.id, label: `${offer.vendorName} · ${amount(offer.currency, offer.total)}${state}` }; })} /><TextField label="Selection reason" name="selectionReason" required />{data.offers.length < 2 && <><Alert variant="destructive"><AlertTitle>Single-source exception required</AlertTitle><AlertDescription>The default is at least two submitted vendor offers. Explain why selection may proceed with fewer.</AlertDescription></Alert><TextField label="Purchase-manager exception reason" name="singleSourceExceptionReason" required /></>}</>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (modal === 'rfq' && vendorIds.length === 0) || (modal === 'offer' && !vendorId) || (modal === 'select' && !offerId)}>{modal === 'select' ? 'Select supplier' : 'Save'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-base">{value}</CardTitle></CardHeader></Card>; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium tabular-nums">{value}</p></div>; }
function TextBlock({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value}</p></div>; }
function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`source-${name}`}>{label}</Label><Input id={`source-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) { return <div className="space-y-2"><Label htmlFor={`source-${name}`}>{label}</Label><Textarea id={`source-${name}`} name={name} {...props} /></div>; }
function SelectField({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
