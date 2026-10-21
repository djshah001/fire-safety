import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import { markAllNotificationsRead, markNotificationRead, notificationSummaryQuery, type AppNotification } from '@/api/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(notificationSummaryQuery);
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const readMutation = useMutation({
    mutationFn: (notification: AppNotification) => notification.readAt ? Promise.resolve() : markNotificationRead(notification.id, notification.rowVersion),
    async onSuccess(_data, notification) { await refresh(); if (notification.link) navigate(notification.link); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });
  const allMutation = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh, onError: (error) => toast.error(getApiErrorMessage(error)) });
  const unread = query.data?.unreadCount ?? 0;

  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label={`${unread} unread notifications`}><Bell />{unread > 0 && <Badge className="absolute -right-1 -top-1 grid min-w-5 place-items-center px-1 text-[10px]" variant="destructive">{unread > 99 ? '99+' : unread}</Badge>}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-80"><div className="flex items-center justify-between px-2 py-1"><DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel><Button size="sm" variant="ghost" disabled={unread === 0 || allMutation.isPending} onClick={() => allMutation.mutate()}><CheckCheck />Mark all read</Button></div><DropdownMenuSeparator />{query.isPending ? <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p> : query.data?.items.length ? query.data.items.map((notification) => <DropdownMenuItem key={notification.id} className="block cursor-pointer p-3" onClick={() => readMutation.mutate(notification)}><div className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? 'bg-transparent' : 'bg-primary'}`} /><div><p className="text-sm font-medium">{notification.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</p></div></div></DropdownMenuItem>) : <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>}<DropdownMenuSeparator /><DropdownMenuItem className="justify-center font-medium" onClick={() => navigate('/notifications')}>View all notifications</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
