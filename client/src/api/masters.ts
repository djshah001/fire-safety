import { queryOptions } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '@/api/client';

export type MasterStatus = 'active' | 'inactive';
export type MasterSort = 'code' | 'name' | 'status' | 'updatedAt';
export type MasterFilters = {
  search?: string; status?: MasterStatus; page?: number; pageSize?: number;
  sort?: MasterSort; direction?: 'asc' | 'desc';
};
export type Unit = {
  id: string; code: string; name: string; symbol: string; status: MasterStatus;
  rowVersion: number; updatedAt: string;
};
export type ItemCategory = {
  id: string; code: string; name: string; status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type Brand = {
  id: string; code: string; name: string; status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type Item = {
  id: string; code: string; name: string; specification: string | null;
  categoryId: string; categoryName: string; unitId: string; unitName: string; unitSymbol: string;
  brands: Array<{ id: string; code: string; name: string; status: MasterStatus }>;
  status: MasterStatus; rowVersion: number; updatedAt: string;
};
export type Vendor = {
  id: string; code: string; displayName: string; legalName: string | null; taxIdentifier: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null;
  postalCode: string | null; country: string | null; status: MasterStatus; rowVersion: number; updatedAt: string;
  primaryContact: { id: string; name: string; jobTitle: string | null; phone: string | null; email: string | null } | null;
};
export type MasterPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type MasterResource = 'vendors' | 'items' | 'item-categories' | 'brands' | 'units';

const compact = (input: MasterFilters) => Object.fromEntries(
  Object.entries(input).filter(([, value]) => value !== undefined && value !== ''),
);

export const masterListQuery = <T>(resource: MasterResource, filters: MasterFilters) => queryOptions({
  queryKey: ['masters', resource, filters] as const,
  queryFn: async ({ signal }) => {
    const response = await apiClient.get<ApiEnvelope<MasterPage<T>>>(`/masters/${resource}`, {
      params: compact({ ...filters, page: filters.page ?? 1 }), signal,
    });
    return response.data.data;
  },
});

export const masterLookupsQuery = (resource: 'units' | 'item-categories' | 'brands') => masterListQuery<Unit | ItemCategory | Brand>(resource, {
  status: 'active', page: 1, pageSize: 100, sort: 'name', direction: 'asc',
});

export async function createMaster(resource: MasterResource, input: Record<string, unknown>) {
  await apiClient.post(`/masters/${resource}`, input);
}

export async function updateMaster(resource: MasterResource, id: string, input: Record<string, unknown>) {
  await apiClient.put(`/masters/${resource}/${id}`, input);
}

export async function deactivateMaster(resource: MasterResource, id: string, expectedVersion: number, reason: string) {
  await apiClient.post(`/masters/${resource}/${id}/deactivate`, { expectedVersion, reason });
}
