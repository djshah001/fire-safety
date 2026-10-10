import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type CurrentUser = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  permissions: string[];
};

type SessionData = { user: CurrentUser };

export const currentUserQuery = queryOptions({
  queryKey: ['auth', 'current-user'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<SessionData>>('/auth/me', { signal });
    return response.data.data.user;
  },
  retry: false,
  staleTime: 15_000,
});

export async function login(input: { email: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<SessionData>>('/auth/login', input);
  return response.data.data.user;
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function changePassword(input: { currentPassword: string; password: string }) {
  await apiClient.post('/auth/password/change', input);
}

export async function requestPasswordReset(email: string) {
  await apiClient.post('/auth/password-reset/request', { email });
}

export async function confirmPasswordReset(input: { token: string; password: string }) {
  await apiClient.post('/auth/password-reset/confirm', input);
}
