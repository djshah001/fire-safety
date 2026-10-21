import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type NotificationSeverity = 'info' | 'success' | 'warning';
export type AppNotification = {
  id: string; type: string; severity: NotificationSeverity; title: string; message: string;
  link: string | null; targetType: string | null; targetId: string | null;
  readAt: string | null; rowVersion: number; createdAt: string;
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const notificationSummaryQuery = queryOptions({
  queryKey: ['notifications', 'summary'] as const,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<{ items: AppNotification[]; unreadCount: number }>>('/notifications/summary', { signal })).data.data,
  refetchInterval: 30_000,
});

export const notificationsQuery = (filters: { search?: string; status: 'all' | 'unread' | 'read'; page: number; pageSize: number; sort: 'createdAt' | 'severity'; direction: 'asc' | 'desc' }) => queryOptions({
  queryKey: ['notifications', 'list', filters] as const,
  queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<Page<AppNotification>>>('/notifications', { params: filters, signal })).data.data,
});

export async function markNotificationRead(notificationId: string, expectedVersion: number) {
  await apiClient.post(`/notifications/${notificationId}/read`, { expectedVersion });
}

export async function markAllNotificationsRead() {
  await apiClient.post('/notifications/read-all');
}
