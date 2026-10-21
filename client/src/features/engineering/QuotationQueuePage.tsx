import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { quotationQueueQuery, type QuotationQueueItem, type QuotationStatus } from '@/api/quotations';
import { getApiErrorMessage } from '@/api/client';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statuses: QuotationStatus[] = ['draft', 'submitted', 'returned', 'approved', 'issued', 'accepted', 'declined'];
type Sort = 'quotationNumber' | 'title' | 'status' | 'updatedAt' | 'grandTotal';

export function QuotationQueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = statuses.includes(params.get('status') as QuotationStatus) ? params.get('status') as QuotationStatus : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['quotationNumber', 'title', 'status', 'updatedAt', 'grandTotal'].includes(params.get('sort') ?? '') ? params.get('sort') : 'updatedAt') as Sort;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = useQuery(quotationQueueQuery({ search: search || undefined, status, page, pageSize, sort, direction }));
  const update = (values: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value)));
    if (!('page' in values)) next.delete('page');
    setParams(next, { replace: true });
  };
  const columns: Array<ServerColumn<QuotationQueueItem, Sort>> = [
    { key: 'number', label: 'Quotation', sort: 'quotationNumber', className: 'min-w-48', cell: (row) => row.quotationNumber ? <div><p className="font-medium">{row.quotationNumber}</p><p className="text-xs text-muted-foreground">Revision {row.revisionNumber}</p></div> : <Badge variant="outline">Not prepared</Badge> },
    { key: 'job', label: 'Design job', sort: 'title', className: 'min-w-64', cell: (row) => <div><p className="font-medium">{row.jobTitle}</p><p className="text-xs text-muted-foreground">{row.leadNumber}</p></div> },
    { key: 'status', label: 'Quote status', sort: 'status', cell: (row) => row.status ? <StatusBadge status={row.status} /> : <span className="text-muted-foreground">Pending</span> },
    { key: 'commercial', label: 'Commercial state', cell: (row) => <StatusBadge status={row.opportunityCommercialState} /> },
    { key: 'total', label: 'Total', sort: 'grandTotal', className: 'text-right tabular-nums', cell: (row) => row.grandTotal ? `${row.currency} ${Number(row.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—' },
    { key: 'updated', label: 'Updated', sort: 'updatedAt', className: 'tabular-nums', cell: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—' },
  ];
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <div><p className="text-sm font-semibold text-primary">Engineering · Commercial preparation</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Quotations</h1><p className="mt-2 max-w-3xl text-muted-foreground">Versioned selling scope, approval, demo-labelled issue snapshots and customer decisions for assigned opportunities.</p></div>
    <Alert className="mt-6"><FileText /><AlertTitle>Demo document mode</AlertTitle><AlertDescription>Production tax, rounding, numbering and company template settings are not confirmed. Issued PDFs are preserved but visibly labelled “DEMO / NOT FOR PRODUCTION”.</AlertDescription></Alert>
    <div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={status ? 1 : 0} onClear={() => update({ status: undefined })}><div className="space-y-2"><Label>Quotation status</Label><Select value={status ?? 'all'} onValueChange={(value) => update({ status: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div>
    <section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{query.isError ? <Alert className="m-4" variant="destructive"><AlertTitle>Quotations unavailable</AlertTitle><AlertDescription>{getApiErrorMessage(query.error, 'Quotations are unavailable or outside your assignment.')}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.jobId} loading={query.isPending} empty={<div><FileText className="mx-auto mb-2" />No assigned quotation workspaces in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} onRowClick={(row) => navigate(`/engineering/design-jobs/${row.jobId}/quotations`)} />}</section>
  </main>;
}
