import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import { markNotificationRead, notificationsQuery, type AppNotification } from '@/api/notifications';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Sort = 'createdAt' | 'severity';

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = (['all', 'unread', 'read'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as 'all' | 'unread' | 'read';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['createdAt', 'severity'].includes(params.get('sort') ?? '') ? params.get('sort') : 'createdAt') as Sort;
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const query = useQuery(notificationsQuery({ search: search || undefined, status, page, pageSize, sort, direction }));
  const update = (values: Record<string, string | number | undefined>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value === undefined || value === '' || value === 'all' ? next.delete(key) : next.set(key, String(value))); if (!('page' in values)) next.delete('page'); setParams(next, { replace: true }); };
  const mutation = useMutation({ mutationFn: (item: AppNotification) => markNotificationRead(item.id, item.rowVersion), async onSuccess() { await queryClient.invalidateQueries({ queryKey: ['notifications'] }); }, onError: (error) => toast.error(getApiErrorMessage(error)) });
  const open = (item: AppNotification) => { if (!item.readAt) mutation.mutate(item); if (item.link) navigate(item.link); };
  const columns: Array<ServerColumn<AppNotification, Sort>> = [
    { key: 'notification', label: 'Notification', className: 'min-w-72', cell: (item) => <div className="flex items-start gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? 'bg-muted' : 'bg-primary'}`} /><div><p className={item.readAt ? 'font-medium' : 'font-semibold'}>{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.message}</p></div></div> },
    { key: 'severity', label: 'Type', sort: 'severity', cell: (item) => <Badge variant={item.severity === 'warning' ? 'destructive' : 'secondary'}>{item.severity}</Badge> },
    { key: 'createdAt', label: 'Received', sort: 'createdAt', className: 'whitespace-nowrap tabular-nums', cell: (item) => new Date(item.createdAt).toLocaleString() },
    { key: 'action', label: '', cell: (item) => item.readAt ? <span className="text-xs text-muted-foreground">Read</span> : <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={(event) => { event.stopPropagation(); mutation.mutate(item); }}><Check />Mark read</Button> },
  ];
  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div><p className="text-sm font-semibold text-primary">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Notifications</h1><p className="mt-2 text-muted-foreground">Assignment, deadline, review, and workflow updates addressed to you.</p></div><div className="mt-6"><ListToolbar search={search} onSearch={(value) => update({ search: value })} activeFilters={status === 'all' ? 0 : 1} onClear={() => update({ status: undefined })}><div className="space-y-2"><Label>Read state</Label><Select value={status} onValueChange={(value) => update({ status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All notifications</SelectItem><SelectItem value="unread">Unread</SelectItem><SelectItem value="read">Read</SelectItem></SelectContent></Select></div></ListToolbar></div><section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{query.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(query.error, 'Notifications are unavailable.')}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isPending} empty={<div><Bell className="mx-auto mb-2" />No notifications in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => update({ sort: nextSort, direction: nextDirection })} page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={(nextPage) => update({ page: nextPage })} onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })} onRowClick={open} />}</section></main>;
}
