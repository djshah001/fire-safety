import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ListTodo } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { completeReminder, remindersQuery, type Reminder } from '@/api/crm';
import { getApiErrorMessage } from '@/api/client';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Sort = 'dueAt' | 'title' | 'status';

export function FollowUpsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = (['pending', 'completed', 'cancelled'].includes(params.get('status') ?? '') ? params.get('status') : undefined) as Reminder['status'] | undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['dueAt', 'title', 'status'].includes(params.get('sort') ?? '') ? params.get('sort') : 'dueAt') as Sort;
  const direction = params.get('direction') === 'desc' ? 'desc' : 'asc';
  const reminders = useQuery(remindersQuery({ search: search || undefined, status, page, pageSize, sort, direction }));
  const queryClient = useQueryClient();
  const completion = useMutation({ mutationFn: completeReminder, async onSuccess() { await queryClient.invalidateQueries({ queryKey: ['crm', 'reminders'] }); toast.success('Follow-up marked complete.'); }, onError(error) { toast.error(getApiErrorMessage(error)); } });
  function update(values: Record<string, string | number | undefined>) { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value === undefined || value === '' ? next.delete(key) : next.set(key, String(value))); if (!('page' in values)) next.delete('page'); setParams(next, { replace: true }); }
  const columns: Array<ServerColumn<Reminder, Sort>> = [
    { key: 'title', label: 'Follow-up', sort: 'title', className: 'min-w-64', cell: (item) => <div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.leadNumber} · {item.leadName}</p></div> },
    { key: 'due', label: 'Due', sort: 'dueAt', className: 'tabular-nums', cell: (item) => <div><p>{new Date(item.dueAt).toLocaleString()}</p><p className="text-xs text-muted-foreground">{item.timezone}</p></div> },
    { key: 'repeat', label: 'Repeats', cell: (item) => <span className="capitalize">{item.recurrence}</span> },
    { key: 'status', label: 'Status', sort: 'status', cell: (item) => <StatusBadge status={item.status} /> },
    { key: 'action', label: '', className: 'text-right', cell: (item) => item.status === 'pending' ? <Button disabled={completion.isPending} onClick={(event) => { event.stopPropagation(); completion.mutate(item); }} size="sm" variant="outline"><Check />Complete</Button> : null },
  ];
  return <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8"><div><p className="text-sm font-semibold text-primary">CRM</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">My follow-ups</h1><p className="mt-2 text-muted-foreground">Each recurring occurrence is tracked separately and only your assigned reminders appear here.</p></div><div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={status ? 1 : 0} onClear={() => update({ status: undefined })}><div className="space-y-2"><Label>Status</Label><Select value={status ?? 'all'} onValueChange={(value) => update({ status: value === 'all' ? undefined : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div></ListToolbar></div><section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{reminders.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(reminders.error)}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={reminders.data?.items ?? []} rowKey={(item) => item.id} loading={reminders.isPending} empty={<div><ListTodo className="mx-auto mb-2" />No follow-ups in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={reminders.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} />}</section></main>;
}
