import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  createProcurementRequisition,
  procurementCreateOptionsQuery,
  procurementRequisitionsQuery,
  type ProcurementRequisition,
  type RequisitionStatus,
} from '@/api/procurement';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type Sort = 'requisitionNumber' | 'title' | 'status' | 'requiredBy' | 'updatedAt';
const statuses: RequisitionStatus[] = ['open', 'sourcing', 'selected'];

export function RequisitionsPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [boqRevisionId, setBoqRevisionId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [selectedLines, setSelectedLines] = useState<Record<string, string>>({});
  const canCreate = user.permissions.includes('procurement.requisition.create');
  const search = params.get('search') ?? '';
  const status = statuses.includes(params.get('status') as RequisitionStatus) ? params.get('status') as RequisitionStatus : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['requisitionNumber', 'title', 'status', 'requiredBy', 'updatedAt'].includes(params.get('sort') ?? '') ? params.get('sort') : 'updatedAt') as Sort;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = useQuery(procurementRequisitionsQuery({ search: search || undefined, status, page, pageSize, sort, direction }));
  const options = useQuery(procurementCreateOptionsQuery(creating && canCreate));
  const project = options.data?.projects.find((item) => item.id === projectId);
  const boq = project?.boqs.find((item) => item.id === boqRevisionId);

  const update = (values: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value)));
    if (!('page' in values)) next.delete('page');
    setParams(next, { replace: true });
  };

  const resetCreate = () => { setCreating(false); setProjectId(''); setBoqRevisionId(''); setManagerId(''); setSelectedLines({}); };
  const create = useMutation({
    mutationFn: async (form: FormData) => createProcurementRequisition({
      projectId,
      boqRevisionId,
      purchaseManagerUserId: managerId,
      title: String(form.get('title')),
      requiredBy: String(form.get('requiredBy')),
      deliveryLocation: String(form.get('deliveryLocation')),
      notes: String(form.get('notes') ?? '').trim() || undefined,
      lines: Object.entries(selectedLines).map(([boqLineId, quantity]) => ({ boqLineId, quantity })),
    }),
    async onSuccess(requisition) {
      await queryClient.invalidateQueries({ queryKey: ['procurement', 'requisitions'] });
      resetCreate();
      toast.success('Procurement requisition created.');
      navigate(`/procurement/requisitions/${requisition.id}`);
    },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  const columns = useMemo<Array<ServerColumn<ProcurementRequisition, Sort>>>(() => [
    { key: 'requisition', label: 'Requisition', sort: 'requisitionNumber', className: 'min-w-64', cell: (item) => <div><p className="font-medium">{item.requisitionNumber}</p><p className="text-xs text-muted-foreground">{item.title}</p></div> },
    { key: 'project', label: 'Project', cell: (item) => <div><p>{item.projectNumber}</p><p className="text-xs text-muted-foreground">{item.projectTitle}</p></div> },
    { key: 'status', label: 'State', sort: 'status', cell: (item) => <StatusBadge status={item.status} /> },
    { key: 'offers', label: 'RFQ / offers', cell: (item) => <div><p>{item.rfqNumber ?? 'Not created'}</p><p className="text-xs text-muted-foreground">{item.offerCount} submitted</p></div> },
    { key: 'required', label: 'Required by', sort: 'requiredBy', className: 'whitespace-nowrap tabular-nums', cell: (item) => new Date(`${item.requiredBy}T00:00:00`).toLocaleDateString() },
  ], []);

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Procurement</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Requisitions & sourcing</h1><p className="mt-2 max-w-3xl text-muted-foreground">Create demand from an approved project BOQ, compare normalized vendor offers, and preserve the supplier-selection reason.</p></div>{canCreate && <Button onClick={() => setCreating(true)}><Plus />New requisition</Button>}</div>
    <div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={Number(Boolean(status))} onClear={() => update({ status: undefined })}><div className="space-y-2"><Label>Status</Label><Select value={status ?? 'all'} onValueChange={(value) => update({ status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div>
    <section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{query.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(query.error, 'Requisitions are unavailable or outside your assignment.')}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isPending} empty={<div><ClipboardList className="mx-auto mb-2" />No assigned requisitions in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} onRowClick={(item) => navigate(`/procurement/requisitions/${item.id}`)} />}</section>
    <Dialog open={creating} onOpenChange={(open) => { if (!open) resetCreate(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><form onSubmit={(event) => { event.preventDefault(); create.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>New project requisition</DialogTitle><DialogDescription>Only approved BOQ lines from a project you are assigned to can be requested. The assigned purchase manager must also be a project member.</DialogDescription></DialogHeader><div className="mt-5 space-y-5">
      {options.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(options.error, 'Creation options are unavailable.')}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Project" value={projectId} onChange={(value) => { setProjectId(value); setBoqRevisionId(''); setManagerId(''); setSelectedLines({}); }} items={(options.data?.projects ?? []).map((item) => ({ value: item.id, label: `${item.projectNumber} · ${item.title}` }))} /><SelectField label="Approved BOQ" value={boqRevisionId} onChange={(value) => { setBoqRevisionId(value); setSelectedLines({}); }} disabled={!projectId} items={(project?.boqs ?? []).map((item) => ({ value: item.id, label: `Revision ${item.revisionNumber} · ${item.title}` }))} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Requisition title" name="title" required minLength={2} /><SelectField label="Purchase manager" value={managerId} onChange={setManagerId} disabled={!projectId} items={(project?.managers ?? []).map((item) => ({ value: item.id, label: `${item.name} · ${item.email}` }))} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Required by" name="requiredBy" type="date" required /><Field label="Delivery location" name="deliveryLocation" required minLength={3} /></div><TextField label="Internal notes (optional)" name="notes" />
      {boq && <div><div className="mb-2"><Label>Approved demand lines</Label><p className="text-xs text-muted-foreground">Select at least one line. Requested quantity cannot exceed the approved quantity.</p></div><div className="max-h-80 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>Item / specification</TableHead><TableHead>Approved</TableHead><TableHead className="w-36">Request</TableHead></TableRow></TableHeader><TableBody>{boq.lines.map((line) => { const checked = line.id in selectedLines; return <TableRow key={line.id}><TableCell><Checkbox checked={checked} aria-label={`Select ${line.itemName}`} onCheckedChange={(value) => setSelectedLines((current) => { const next = { ...current }; if (value === true) next[line.id] = line.quantity; else delete next[line.id]; return next; })} /></TableCell><TableCell><p className="font-medium">{line.itemName}</p><p className="text-xs text-muted-foreground">{line.itemCode} · {line.specification}</p></TableCell><TableCell className="tabular-nums">{line.quantity} {line.unitSymbol}</TableCell><TableCell><Input aria-label={`Quantity for ${line.itemName}`} disabled={!checked} inputMode="decimal" max={line.quantity} min="0.0001" step="0.0001" value={selectedLines[line.id] ?? ''} onChange={(event) => setSelectedLines((current) => ({ ...current, [line.id]: event.target.value }))} /></TableCell></TableRow>; })}</TableBody></Table></div></div>}
      {projectId && project?.managers.length === 0 && <Alert variant="destructive"><AlertDescription>No other project member has purchase-manager selection permission. Add an eligible purchase manager to the project before creating this requisition.</AlertDescription></Alert>}
      {create.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(create.error)}</AlertDescription></Alert>}
    </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={resetCreate}>Cancel</Button><Button type="submit" disabled={create.isPending || !projectId || !boqRevisionId || !managerId || Object.keys(selectedLines).length === 0}>Create requisition</Button></DialogFooter></form></DialogContent></Dialog>
  </main>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`req-${name}`}>{label}</Label><Input id={`req-${name}`} name={name} {...props} /></div>; }
function TextField({ label, name }: { label: string; name: string }) { return <div className="space-y-2"><Label htmlFor={`req-${name}`}>{label}</Label><Textarea id={`req-${name}`} name={name} /></div>; }
function SelectField({ label, value, onChange, items, disabled = false }: { label: string; value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }>; disabled?: boolean }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
