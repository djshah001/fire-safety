import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type HealthStatus = {
  service: 'fire-safety-api';
  status: 'ok';
  timestamp: string;
};

export const healthQuery = queryOptions({
  queryKey: ['public', 'health', 'live'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<HealthStatus>>('/health/live', { signal });
    return response.data.data;
  },
  retry: 1,
  refetchInterval: 60_000,
});
