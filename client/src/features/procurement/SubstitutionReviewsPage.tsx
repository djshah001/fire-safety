import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/api/client';
import { substitutionReviewsQuery, type SubstitutionReviewQueueItem } from '@/api/procurement';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Status = 'pending' | 'approved' | 'rejected';
type Sort = 'requisitionNumber' | 'vendorName' | 'itemName' | 'status' | 'updatedAt';
const statuses: Status[] = ['pending', 'approved', 'rejected'];

export function SubstitutionReviewsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = statuses.includes(params.get('status') as Status) ? params.get('status') as Status : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['requisitionNumber', 'vendorName', 'itemName', 'status', 'updatedAt'].includes(params.get('sort') ?? '') ? params.get('sort') : 'updatedAt') as Sort;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = useQuery(substitutionReviewsQuery({ search: search || undefined, status, page, pageSize, sort, direction }));
  const update = (values: Record<string, string | number | undefined>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value))); if (!('page' in values)) next.delete('page'); setParams(next, { replace: true }); };
  const columns: Array<ServerColumn<SubstitutionReviewQueueItem, Sort>> = [
    { key: 'requisition', label: 'Requisition / project', sort: 'requisitionNumber', className: 'min-w-56', cell: (item) => <div><p className="font-medium">{item.requisitionNumber}</p><p className="text-xs text-muted-foreground">{item.projectNumber} · {item.projectTitle}</p></div> },
    { key: 'vendor', label: 'Vendor', sort: 'vendorName', cell: (item) => item.vendorName },
    { key: 'item', label: 'Technical item', sort: 'itemName', className: 'min-w-56', cell: (item) => <div><p>{item.itemName}</p><p className="text-xs text-muted-foreground">{item.itemCode} · offered make {item.offeredBrand}</p></div> },
    { key: 'equivalence', label: 'Offer state', cell: (item) => <StatusBadge status={item.equivalence} /> },
    { key: 'status', label: 'Engineering decision', sort: 'status', cell: (item) => <StatusBadge status={item.status} /> },
  ];
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div><p className="text-sm font-semibold text-primary">Engineering authorization</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Technical substitution reviews</h1><p className="mt-2 max-w-3xl text-muted-foreground">Review only technical make/specification differences for projects where you are both the baseline design head and an explicit member. Commercial values are intentionally omitted.</p></div><div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={Number(Boolean(status))} onClear={() => update({ status: undefined })}><div className="space-y-2"><Label>Decision</Label><Select value={status ?? 'all'} onValueChange={(value) => update({ status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All decisions</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div><section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{query.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(query.error, 'Technical reviews are unavailable or outside your project assignment.')}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isPending} empty={<div><ShieldCheck className="mx-auto mb-2" />No technical deviations in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} onRowClick={(item) => navigate(`/procurement/substitution-reviews/${item.requisitionId}`)} />}</section></main>;
}
