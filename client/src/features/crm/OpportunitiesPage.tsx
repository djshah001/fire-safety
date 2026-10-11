import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { opportunitiesQuery, type CommercialState, type Opportunity } from '@/api/crm';
import { getApiErrorMessage } from '@/api/client';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const states: CommercialState[] = ['unawarded', 'quoted', 'awarded', 'lost', 'on_hold'];
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
type Sort = 'title' | 'customerName' | 'state' | 'updatedAt';

export function OpportunitiesPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const state = (states.includes(params.get('state') as CommercialState) ? params.get('state') : undefined) as CommercialState | undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['title', 'customerName', 'state', 'updatedAt'].includes(params.get('sort') ?? '') ? params.get('sort') : 'updatedAt') as Sort;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const opportunities = useQuery(opportunitiesQuery({ search: search || undefined, state, page, pageSize, sort, direction }));
  function update(values: Record<string, string | number | undefined>) { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value))); if (!('page' in values)) next.delete('page'); setParams(next, { replace: true }); }
  const columns: Array<ServerColumn<Opportunity, Sort>> = [
    { key: 'title', label: 'Opportunity', sort: 'title', className: 'min-w-64', cell: (item) => <div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.leadNumber}</p></div> },
    { key: 'customer', label: 'Customer', sort: 'customerName', cell: (item) => item.customerName },
    { key: 'state', label: 'Commercial state', sort: 'state', cell: (item) => <StatusBadge label={label(item.commercialState)} status={item.commercialState} /> },
    { key: 'updated', label: 'Updated', sort: 'updatedAt', className: 'tabular-nums', cell: (item) => new Date(item.updatedAt).toLocaleDateString() },
  ];
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div><p className="text-sm font-semibold text-primary">CRM</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Opportunities</h1><p className="mt-2 text-muted-foreground">Qualified, assigned work appears here. Commercial award remains independent from technical progression.</p></div><div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={state ? 1 : 0} onClear={() => update({ state: undefined })}><div className="space-y-2"><Label>Commercial state</Label><Select value={state ?? 'all'} onValueChange={(value) => update({ state: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{states.map((item) => <SelectItem key={item} value={item}>{label(item)}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div><section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{opportunities.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(opportunities.error)}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={opportunities.data?.items ?? []} rowKey={(item) => item.id} loading={opportunities.isPending} empty={<div><BriefcaseBusiness className="mx-auto mb-2" />No opportunities in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={opportunities.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} />}</section></main>;
}
