import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type Employee = {
  id: string;
  employeeCode: string | null;
  name: string;
  email: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  rowVersion: number;
  lastLoginAt: string | null;
  roles: Array<{ id: string; code: string; name: string }>;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  rowVersion: number;
  permissionCodes: string[];
};

export type Permission = { code: string; description: string };

export const employeesQuery = queryOptions({
  queryKey: ['admin', 'employees'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{
      items: Employee[]; total: number; page: number; pageSize: number;
    }>>('/admin/users', { signal });
    return response.data.data;
  },
});

export const rolesQuery = (includeInactive = false) => queryOptions({
  queryKey: ['admin', 'roles', { includeInactive }] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Role[] }>>('/admin/roles', {
      params: includeInactive ? { includeInactive: true } : undefined,
      signal,
    });
    return response.data.data.items;
  },
});

export const permissionsQuery = queryOptions({
  queryKey: ['admin', 'permissions'] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<{ items: Permission[] }>>('/admin/permissions', { signal });
    return response.data.data.items;
  },
});

export async function createEmployee(input: {
  employeeCode?: string;
  name: string;
  email: string;
  temporaryPassword: string;
  roleIds: string[];
}) {
  const response = await apiClient.post<ApiEnvelope<{ user: Employee }>>('/admin/users', input);
  return response.data.data.user;
}

export async function changeEmployeeAccess(input: {
  employee: Employee;
  action: 'disable' | 'enable';
  reason: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ user: Employee }>>(
    `/admin/users/${input.employee.id}/${input.action}`,
    { rowVersion: input.employee.rowVersion, reason: input.reason },
  );
  return response.data.data.user;
}

export async function resetEmployeePassword(input: {
  employee: Employee;
  temporaryPassword: string;
  reason: string;
}) {
  const response = await apiClient.post<ApiEnvelope<{ user: Employee }>>(
    `/admin/users/${input.employee.id}/reset-password`,
    {
      rowVersion: input.employee.rowVersion,
      temporaryPassword: input.temporaryPassword,
      reason: input.reason,
    },
  );
  return response.data.data.user;
}

export async function replaceEmployeeRoles(input: {
  employee: Employee; roleIds: string[]; reason: string;
}) {
  const response = await apiClient.put<ApiEnvelope<{ user: Employee }>>(
    `/admin/users/${input.employee.id}/roles`,
    { rowVersion: input.employee.rowVersion, roleIds: input.roleIds, reason: input.reason },
  );
  return response.data.data.user;
}

export async function createRole(input: {
  code: string; name: string; description?: string; permissionCodes: string[];
}) {
  const response = await apiClient.post<ApiEnvelope<{ role: Role }>>('/admin/roles', input);
  return response.data.data.role;
}

export async function updateRole(input: {
  role: Role; name: string; description?: string; permissionCodes: string[]; reason: string;
}) {
  const response = await apiClient.put<ApiEnvelope<{ role: Role }>>(`/admin/roles/${input.role.id}`, {
    expectedVersion: input.role.rowVersion,
    name: input.name,
    description: input.description,
    permissionCodes: input.permissionCodes,
    reason: input.reason,
  });
  return response.data.data.role;
}

export async function updateRolePermissions(input: {
  role: Role; permissionCodes: string[]; reason: string;
}) {
  const response = await apiClient.put<ApiEnvelope<{ role: Role }>>(
    `/admin/roles/${input.role.id}/permissions`,
    { expectedVersion: input.role.rowVersion, permissionCodes: input.permissionCodes, reason: input.reason },
  );
  return response.data.data.role;
}

export async function deactivateRole(input: { role: Role; reason: string }) {
  const response = await apiClient.post<ApiEnvelope<{ role: Role }>>(
    `/admin/roles/${input.role.id}/deactivate`,
    { expectedVersion: input.role.rowVersion, reason: input.reason },
  );
  return response.data.data.role;
}
