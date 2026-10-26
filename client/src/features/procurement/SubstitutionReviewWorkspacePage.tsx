import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import { reviewSubstitution, substitutionReviewWorkspaceQuery, type SubstitutionReviewWorkspace } from '@/api/procurement';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type Item = SubstitutionReviewWorkspace['items'][number];

export function SubstitutionReviewWorkspacePage() {
  const { requisitionId } = useParams();
  const queryClient = useQueryClient();
  const workspace = useQuery(substitutionReviewWorkspaceQuery(requisitionId));
  const [item, setItem] = useState<Item>();
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const mutation = useMutation({
    mutationFn: (form: FormData) => reviewSubstitution(requisitionId!, item!.offerLineId, { decision, reason: String(form.get('reason')) }),
    async onSuccess() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['procurement', 'substitution-reviews'] }), queryClient.invalidateQueries({ queryKey: ['procurement', 'requisitions'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); setItem(undefined); toast.success(`Technical substitution ${decision}.`); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  if (workspace.isPending) return <main className="mx-auto max-w-6xl space-y-5 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-36" /><Skeleton className="h-96" /></main>;
  if (workspace.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="ghost"><Link to="/procurement/substitution-reviews"><ArrowLeft />Technical reviews</Link></Button><Alert className="mt-6" variant="destructive"><AlertTitle>Review unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(workspace.error, 'This review is unavailable or outside your project assignment.')}</AlertDescription></Alert></main>;
  const { context, items, capabilities } = workspace.data;
  return <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8"><Button asChild className="-ml-2" variant="ghost"><Link to="/procurement/substitution-reviews"><ArrowLeft />Technical reviews</Link></Button><div className="mt-5"><p className="text-sm font-semibold text-primary">{context.projectNumber} · {context.designTitle}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{context.requisitionNumber}</h1><p className="mt-2 text-muted-foreground">{context.requisitionTitle} · {context.projectTitle}</p></div><Alert className="mt-6"><ShieldCheck /><AlertTitle>Technical scope only</AlertTitle><AlertDescription>Compare the offered make/specification with the approved RFQ specification. Prices, taxes, freight and payment terms are deliberately absent. An approval authorizes only this exact immutable offer line; it does not approve the supplier or purchase order.</AlertDescription></Alert><section className="mt-8 space-y-4">{items.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground">No technical deviations were submitted for this requisition.</CardContent></Card> : items.map((current) => <Card key={current.offerLineId}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{current.vendorName} · {current.vendorReference}</Badge><StatusBadge status={current.equivalence} />{current.decision && <StatusBadge status={current.decision} />}</div><CardTitle className="mt-3">{current.lineNumber}. {current.itemName}</CardTitle><CardDescription>{current.itemCode} · offered make {current.offeredBrand}</CardDescription></div>{capabilities.canReview && !current.decision && <div className="flex gap-2"><Button variant="outline" onClick={() => { setDecision('rejected'); setItem(current); }}>Reject</Button><Button onClick={() => { setDecision('approved'); setItem(current); }}><ShieldCheck />Approve substitution</Button></div>}</div></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><TechnicalBlock label="Approved specification" value={current.approvedSpecification} /><TechnicalBlock label="Offered specification" value={current.offeredSpecification} />{current.deviationNotes && <div className="md:col-span-2"><TechnicalBlock label="Vendor deviation note" value={current.deviationNotes} /></div>}{current.decision && <div className="md:col-span-2 rounded-lg border bg-muted/30 p-4"><p className="text-sm font-semibold">Engineering decision by {current.reviewedByName}</p><p className="mt-1 text-sm text-muted-foreground">{current.reviewReason}</p><p className="mt-2 text-xs text-muted-foreground">{current.reviewedAt ? new Date(current.reviewedAt).toLocaleString() : ''}</p></div>}</CardContent></Card>)}</section><Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) setItem(undefined); }}><DialogContent><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{decision === 'approved' ? 'Approve technical substitution' : 'Reject technical substitution'}</DialogTitle><DialogDescription>This immutable decision applies only to {item?.vendorName}’s offered {item?.itemName}. Record a specific engineering basis.</DialogDescription></DialogHeader><div className="mt-5 space-y-2"><Label htmlFor="substitution-reason">Engineering reason</Label><Textarea id="substitution-reason" name="reason" required minLength={3} placeholder="Compatibility, design impact, standards, interface or rejection basis" />{mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}</div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setItem(undefined)}>Cancel</Button><Button type="submit" variant={decision === 'rejected' ? 'destructive' : 'default'} disabled={mutation.isPending}>{decision === 'approved' ? 'Approve exact line' : 'Reject exact line'}</Button></DialogFooter></form></DialogContent></Dialog></main>;
}

function TechnicalBlock({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm">{value}</p></div>; }
