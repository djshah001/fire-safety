import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from './client';

export type InquiryItem = {
  itemId?: string;
  itemName: string;
  itemCode?: string;
  unit?: string;
  quantity?: string;
  specification?: string;
  brandOffered?: string;
  eligibleBrands?: Array<{
    id: string;
    name: string;
    code?: string;
    model?: string | null;
    isPreferred?: boolean;
  }>;
};

export type PriceInquiry = {
  id: string;
  inquiryCode: string;
  title: string;
  description?: string | null;
  items: InquiryItem[];
  status: string;
  responseDueDate?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PriceInquiryInvitation = {
  id: string;
  inquiryId: string;
  vendorId: string;
  token: string;
  whatsappNumber?: string | null;
  status: string;
  msg91MessageId?: string | null;
  sentAt?: string | null;
  expiresAt: string;
  respondedAt?: string | null;
  createdAt: string;
};

export type PriceInquiryResponse = {
  id: string;
  invitationId: string;
  inquiryId: string;
  vendorId: string;
  itemRef: InquiryItem;
  unitRate: string;
  currency: string;
  leadTimeDays?: number | null;
  notes?: string | null;
  moq?: string | null;
  validUntil?: string | null;
  submittedAt: string;
};

export type PriceInquiryVendor = {
  id: string;
  code: string;
  displayName: string;
  tradeName?: string | null;
};

export type PriceInquiryDetail = {
  inquiry: PriceInquiry;
  invitations: Array<{
    invitation: PriceInquiryInvitation;
    vendor: PriceInquiryVendor;
  }>;
  responses: PriceInquiryResponse[];
  priceListData: Array<{
    id: string;
    vendorId: string;
    itemId?: string | null;
    vendorProductName: string;
    unitRate: string;
    currency: string;
    leadTimeDays?: number | null;
    effectiveFrom: string;
  }>;
};

export const priceInquiriesQuery = (params: { page?: number; pageSize?: number; status?: string; search?: string }) =>
  queryOptions({
    queryKey: ['price-inquiries', params] as const,
    queryFn: async ({ signal }) => {
      const sp = new URLSearchParams();
      if (params.page) sp.set('page', String(params.page));
      if (params.pageSize) sp.set('pageSize', String(params.pageSize));
      if (params.status) sp.set('status', params.status);
      if (params.search) sp.set('search', params.search);
      const res = await apiClient.get<ApiEnvelope<{
        items: PriceInquiry[];
        total: number;
        page: number;
        pageSize: number;
      }>>(`/procurement/price-inquiries?${sp.toString()}`, { signal });
      return res.data.data;
    },
  });

export const priceInquiryDetailQuery = (inquiryId: string) =>
  queryOptions({
    queryKey: ['price-inquiry', inquiryId] as const,
    enabled: Boolean(inquiryId),
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<ApiEnvelope<PriceInquiryDetail>>(
        `/procurement/price-inquiries/${inquiryId}`,
        { signal },
      );
      return res.data.data;
    },
  });

export const publicPriceInquiryQuery = (token: string) =>
  queryOptions({
    queryKey: ['public-price-inquiry', token] as const,
    enabled: Boolean(token),
    queryFn: async ({ signal }) => {
      const res = await apiClient.get<ApiEnvelope<{
        inquiry: {
          id: string;
          inquiryCode: string;
          title: string;
          description?: string | null;
          items: InquiryItem[];
          responseDueDate?: string | null;
        };
        vendor: { id: string; code: string; displayName: string; tradeName?: string | null };
        invitationStatus: string;
        expiresAt: string;
      }>>(`/vendor-price/${token}`, { signal });
      return res.data.data;
    },
  });

export function useCreatePriceInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      items: InquiryItem[];
      responseDueDate?: string;
    }) => {
      const res = await apiClient.post<ApiEnvelope<{ inquiry: PriceInquiry }>>('/procurement/price-inquiries', data);
      return res.data.data.inquiry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-inquiries'] });
    },
  });
}

export function useInviteVendor(inquiryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      vendorId: string;
      whatsappNumber?: string;
      sendMsg91?: boolean;
      expiryDays?: number;
    }) => {
      const res = await apiClient.post<ApiEnvelope<{
        invitation: PriceInquiryInvitation;
        submissionUrl: string;
        msg91Result?: { success: boolean; status: string; error?: string } | null;
      }>>(`/procurement/price-inquiries/${inquiryId}/invite`, data);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-inquiry', inquiryId] });
      qc.invalidateQueries({ queryKey: ['price-inquiries'] });
    },
  });
}

export function useSendMsg91(inquiryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiClient.post<ApiEnvelope<{ result: { success: boolean; status: string; error?: string } }>>(
        `/procurement/price-inquiries/${inquiryId}/invitations/${invitationId}/send-msg91`,
        {},
      );
      return res.data.data.result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-inquiry', inquiryId] });
    },
  });
}

export function useSubmitPublicPriceResponse(token: string) {
  return useMutation({
    mutationFn: async (data: {
      responses: Array<{
        itemRef: InquiryItem;
        unitRate: string;
        currency: string;
        leadTimeDays?: number;
        notes?: string;
        moq?: string;
        validUntil?: string;
      }>;
      saveToPriceList?: boolean;
    }) => {
      const res = await apiClient.post<ApiEnvelope<{ submitted: number }>>(`/vendor-price/${token}/submit`, data);
      return res.data.data;
    },
  });
}

