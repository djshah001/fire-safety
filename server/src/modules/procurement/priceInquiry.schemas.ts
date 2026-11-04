import { z } from 'zod';

export const inquiryItemSchema = z.object({
  itemId: z.string().uuid().optional(),
  itemName: z.string().min(1).max(200),
  itemCode: z.string().max(60).optional(),
  unit: z.string().max(30).optional(),
  quantity: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  specification: z.string().max(500).optional(),
  brandOffered: z.string().max(160).optional(),
  eligibleBrands: z.array(z.object({
    id: z.string(),
    name: z.string(),
    code: z.string().optional(),
    model: z.string().nullish(),
    isPreferred: z.boolean().optional(),
  })).optional(),
});

export const createPriceInquirySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  items: z.array(inquiryItemSchema).min(1).max(100),
  responseDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const inviteVendorSchema = z.object({
  vendorId: z.string().uuid(),
  whatsappNumber: z.string().max(30).optional(),
  sendMsg91: z.boolean().default(false),
  expiryDays: z.number().int().min(1).max(90).default(14),
});

export const priceInquiryParamsSchema = z.object({
  inquiryId: z.string().uuid(),
});

export const priceInquiryInvitationParamsSchema = z.object({
  inquiryId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const priceInquiryTokenParamsSchema = z.object({
  token: z.string().min(10).max(64),
});

export const submitPriceResponseSchema = z.object({
  responses: z.array(z.object({
    itemRef: inquiryItemSchema,
    unitRate: z.string().regex(/^\d+(\.\d+)?$/),
    currency: z.string().length(3).default('INR'),
    leadTimeDays: z.number().int().min(0).max(999).optional(),
    notes: z.string().max(500).optional(),
    moq: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).min(1),
  saveToPriceList: z.boolean().default(true).optional(),
});

export const priceInquiryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  search: z.string().max(100).optional(),
});

export type InquiryItemInput = z.infer<typeof inquiryItemSchema>;
export type CreatePriceInquiryInput = z.infer<typeof createPriceInquirySchema>;
export type InviteVendorInput = z.infer<typeof inviteVendorSchema>;
export type SubmitPriceResponseInput = z.infer<typeof submitPriceResponseSchema>;
export type PriceInquiryListQuery = z.infer<typeof priceInquiryListQuerySchema>;

