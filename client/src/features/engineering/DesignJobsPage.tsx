import { useQuery } from '@tanstack/react-query';
import { ClipboardPenLine } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { designJobsQuery, type DesignJob, type DesignStatus } from '@/api/engineering';
import { getApiErrorMessage } from '@/api/client';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statuses: DesignStatus[] = ['authorized', 'draft', 'under_review', 'returned', 'internally_approved', 'sent_to_customer', 'customer_approved', 'changes_requested'];
type Sort = 'title' | 'status' | 'updatedAt';

export function DesignJobsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = statuses.includes(params.get('status') as DesignStatus) ? params.get('status') as DesignStatus : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['title', 'status', 'updatedAt'].includes(params.get('sort') ?? '') ? params.get('sort') : 'updatedAt') as Sort;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = useQuery(designJobsQuery({ search: search || undefined, status, page, pageSize, sort, direction }));
  const update = (values: Record<string, string | number | undefined>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value))); if (!('page' in values)) next.delete('page'); setParams(next, { replace: true }); };
  const columns: Array<ServerColumn<DesignJob, Sort>> = [
    { key: 'title', label: 'Design job', sort: 'title', className: 'min-w-64', cell: (job) => <div><p className="font-medium">{job.title}</p><p className="text-xs text-muted-foreground">{job.leadNumber}</p></div> },
    { key: 'status', label: 'Technical state', sort: 'status', cell: (job) => <StatusBadge status={job.status} /> },
    { key: 'survey', label: 'Survey', cell: (job) => job.surveyRequested ? 'Requested' : 'Optional / not requested' },
    { key: 'updated', label: 'Updated', sort: 'updatedAt', className: 'tabular-nums', cell: (job) => new Date(job.updatedAt).toLocaleDateString() },
  ];
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div><p className="text-sm font-semibold text-primary">Engineering</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Design jobs</h1><p className="mt-2 text-muted-foreground">Assigned free-design work, exact package revisions, and review progress.</p></div><div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={status ? 1 : 0} onClear={() => update({ status: undefined })}><div className="space-y-2"><Label>Technical state</Label><Select value={status ?? 'all'} onValueChange={(value) => update({ status: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div><section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{query.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(query.error, 'Design jobs are unavailable or outside your assigned scope.')}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={query.data?.items ?? []} rowKey={(job) => job.id} loading={query.isPending} empty={<div><ClipboardPenLine className="mx-auto mb-2" />No assigned design jobs in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} onRowClick={(job) => navigate(`/engineering/design-jobs/${job.id}`)} />}</section></main>;
}
