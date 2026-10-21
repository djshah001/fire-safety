import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/api/client';
import { projectsQuery, type CommercialState, type Project, type ProjectStatus } from '@/api/projects';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Sort = 'projectNumber' | 'title' | 'status' | 'startDate' | 'targetCompletionDate';
const statuses: ProjectStatus[] = ['started', 'on_hold', 'completed', 'cancelled'];
const commercialStates: CommercialState[] = ['unawarded', 'quoted', 'awarded', 'lost', 'on_hold'];

export function ProjectsPage() {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? ''; const status = statuses.includes(params.get('status') as ProjectStatus) ? params.get('status') as ProjectStatus : undefined; const commercialState = commercialStates.includes(params.get('commercialState') as CommercialState) ? params.get('commercialState') as CommercialState : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1); const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20; const sort = (['projectNumber', 'title', 'status', 'startDate', 'targetCompletionDate'].includes(params.get('sort') ?? '') ? params.get('sort') : 'startDate') as Sort; const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = useQuery(projectsQuery({ search: search || undefined, status, commercialState, page, pageSize, sort, direction }));
  const update = (values: Record<string, string | number | undefined>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value))); if (!('page' in values)) next.delete('page'); setParams(next, { replace: true }); };
  const columns: Array<ServerColumn<Project, Sort>> = [
    { key: 'project', label: 'Project', sort: 'projectNumber', className: 'min-w-64', cell: (item) => <div><p className="font-medium">{item.projectNumber}</p><p className="text-xs text-muted-foreground">{item.title}</p></div> },
    { key: 'customer', label: 'Customer / site', cell: (item) => <div><p>{item.customerName}</p><p className="text-xs text-muted-foreground">{item.siteName}</p></div> },
    { key: 'status', label: 'Project state', sort: 'status', cell: (item) => <StatusBadge status={item.status} /> },
    { key: 'commercial', label: 'Commercial state', cell: (item) => <StatusBadge status={item.commercialState} /> },
    { key: 'target', label: 'Target completion', sort: 'targetCompletionDate', className: 'whitespace-nowrap tabular-nums', cell: (item) => new Date(`${item.targetCompletionDate}T00:00:00`).toLocaleDateString() },
  ];
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div><p className="text-sm font-semibold text-primary">Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Projects</h1><p className="mt-2 text-muted-foreground">Started work with an immutable approved-design baseline and separately visible commercial state.</p></div><div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={Number(Boolean(status)) + Number(Boolean(commercialState))} onClear={() => update({ status: undefined, commercialState: undefined })}><div className="space-y-2"><Label>Project state</Label><Select value={status ?? 'all'} onValueChange={(value) => update({ status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{statuses.map((value) => <SelectItem value={value} key={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Commercial state</Label><Select value={commercialState ?? 'all'} onValueChange={(value) => update({ commercialState: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{commercialStates.map((value) => <SelectItem value={value} key={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div><section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{query.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(query.error, 'Projects are unavailable or outside your assignment.')}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isPending} empty={<div><FolderKanban className="mx-auto mb-2" />No assigned projects in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} onRowClick={(item) => navigate(`/projects/${item.id}`)} />}</section></main>;
}
