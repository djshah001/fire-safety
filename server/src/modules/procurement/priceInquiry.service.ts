import crypto from 'crypto';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db.js';
import {
  vendorContacts,
  vendorPriceInquiries,
  vendorPriceInquiryInvitations,
  vendorPriceInquiryResponses,
  vendorPriceLists,
  vendors,
} from '../../infrastructure/database/schema/masters.js';
import { msg91WhatsAppService } from '../../infrastructure/notifications/msg91.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/logger.js';
import { AppError } from '../../core/errors/appError.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import type {
  CreatePriceInquiryInput,
  InviteVendorInput,
  PriceInquiryListQuery,
  SubmitPriceResponseInput,
} from './priceInquiry.schemas.js';

async function generateInquiryCode(companyId: string): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendorPriceInquiries)
    .where(eq(vendorPriceInquiries.companyId, companyId));
  const seq = (result[0]?.count ?? 0) + 1;
  return `PRI-${String(seq).padStart(6, '0')}`;
}

export class PriceInquiryService {
  async createInquiry(
    principal: AuthenticatedPrincipal,
    input: CreatePriceInquiryInput,
    _requestId: string,
  ) {
    const code = await generateInquiryCode(principal.companyId);
    const [inquiry] = await db
      .insert(vendorPriceInquiries)
      .values({
        companyId: principal.companyId,
        inquiryCode: code,
        title: input.title,
        description: input.description,
        items: input.items,
        status: 'active',
        responseDueDate: input.responseDueDate,
        createdByUserId: principal.userId,
      })
      .returning();

    if (!inquiry) throw new AppError('INTERNAL_ERROR', 'Failed to create inquiry.', 500);
    return { inquiry };
  }

  async listInquiries(
    principal: AuthenticatedPrincipal,
    query: PriceInquiryListQuery,
  ) {
    const { page, pageSize, status, search } = query;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(vendorPriceInquiries.companyId, principal.companyId)];
    if (status) conditions.push(eq(vendorPriceInquiries.status, status));
    if (search) {
      conditions.push(
        or(
          ilike(vendorPriceInquiries.title, `%${search}%`),
          ilike(vendorPriceInquiries.inquiryCode, `%${search}%`),
        )!,
      );
    }

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(vendorPriceInquiries)
        .where(and(...conditions))
        .orderBy(desc(vendorPriceInquiries.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vendorPriceInquiries)
        .where(and(...conditions)),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async getInquiry(principal: AuthenticatedPrincipal, inquiryId: string) {
    const [inquiry] = await db
      .select()
      .from(vendorPriceInquiries)
      .where(
        and(
          eq(vendorPriceInquiries.id, inquiryId),
          eq(vendorPriceInquiries.companyId, principal.companyId),
        ),
      );
    if (!inquiry) throw new AppError('NOT_FOUND', 'Price inquiry not found.', 404);

    const invitations = await db
      .select({
        invitation: vendorPriceInquiryInvitations,
        vendor: {
          id: vendors.id,
          code: vendors.code,
          displayName: vendors.displayName,
          tradeName: vendors.tradeName,
        },
      })
      .from(vendorPriceInquiryInvitations)
      .innerJoin(vendors, eq(vendorPriceInquiryInvitations.vendorId, vendors.id))
      .where(eq(vendorPriceInquiryInvitations.inquiryId, inquiryId));

    const responses = await db
      .select()
      .from(vendorPriceInquiryResponses)
      .where(eq(vendorPriceInquiryResponses.inquiryId, inquiryId))
      .orderBy(desc(vendorPriceInquiryResponses.submittedAt));

    const vendorIds = [...new Set(invitations.map((i) => i.vendor.id))];
    const priceListData =
      vendorIds.length > 0
        ? await db
            .select()
            .from(vendorPriceLists)
            .where(
              and(
                eq(vendorPriceLists.companyId, principal.companyId),
                inArray(vendorPriceLists.vendorId, vendorIds),
              ),
            )
        : [];

    return { inquiry, invitations, responses, priceListData };
  }

  async inviteVendor(
    principal: AuthenticatedPrincipal,
    inquiryId: string,
    input: InviteVendorInput,
    _requestId: string,
  ) {
    const [inquiry] = await db
      .select()
      .from(vendorPriceInquiries)
      .where(
        and(
          eq(vendorPriceInquiries.id, inquiryId),
          eq(vendorPriceInquiries.companyId, principal.companyId),
        ),
      );
    if (!inquiry) throw new AppError('NOT_FOUND', 'Price inquiry not found.', 404);

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.companyId, principal.companyId),
        ),
      );
    if (!vendor) throw new AppError('NOT_FOUND', 'Vendor not found.', 404);

    let defaultPhone = input.whatsappNumber?.trim() || null;
    let contactName = vendor.displayName;
    if (!defaultPhone) {
      const [primaryContact] = await db
        .select()
        .from(vendorContacts)
        .where(
          and(
            eq(vendorContacts.companyId, principal.companyId),
            eq(vendorContacts.vendorId, vendor.id),
            eq(vendorContacts.isPrimary, true),
          ),
        );
      if (primaryContact?.phone) {
        defaultPhone = primaryContact.phone;
        contactName = primaryContact.name;
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + input.expiryDays);

    const [invitation] = await db
      .insert(vendorPriceInquiryInvitations)
      .values({
        inquiryId,
        companyId: principal.companyId,
        vendorId: input.vendorId,
        token,
        whatsappNumber: defaultPhone,
        status: 'pending',
        expiresAt,
      })
      .returning();

    if (!invitation) throw new AppError('INTERNAL_ERROR', 'Failed to create invitation.', 500);

    let msg91Result = null;
    const submissionUrl = `${env.APP_ORIGIN}/vendor-price/${token}`;

    if (input.sendMsg91 && defaultPhone) {
      msg91Result = await msg91WhatsAppService.sendVendorPriceInquiry({
        to: defaultPhone,
        contactName,
        inquiryTitle: inquiry.title,
        submissionUrl,
      });

      if (msg91Result.success) {
        await db
          .update(vendorPriceInquiryInvitations)
          .set({
            status: 'sent',
            sentAt: new Date(),
            msg91MessageId: msg91Result.messageId,
          })
          .where(eq(vendorPriceInquiryInvitations.id, invitation.id));
        invitation.status = 'sent';
      }
    }

    return { invitation, submissionUrl, msg91Result };
  }

  async sendMsg91(principal: AuthenticatedPrincipal, inquiryId: string, invitationId: string) {
    const [row] = await db
      .select({
        invitation: vendorPriceInquiryInvitations,
        vendorName: vendors.displayName,
        inquiryTitle: vendorPriceInquiries.title,
      })
      .from(vendorPriceInquiryInvitations)
      .innerJoin(vendors, eq(vendorPriceInquiryInvitations.vendorId, vendors.id))
      .innerJoin(vendorPriceInquiries, eq(vendorPriceInquiryInvitations.inquiryId, vendorPriceInquiries.id))
      .where(
        and(
          eq(vendorPriceInquiryInvitations.id, invitationId),
          eq(vendorPriceInquiryInvitations.inquiryId, inquiryId),
          eq(vendorPriceInquiryInvitations.companyId, principal.companyId),
        ),
      );
    if (!row) throw new AppError('NOT_FOUND', 'Invitation not found.', 404);

    const { invitation, vendorName, inquiryTitle } = row;
    if (!invitation.whatsappNumber) {
      throw new AppError('VALIDATION_ERROR', 'No WhatsApp number on this invitation.', 422);
    }

    const submissionUrl = `${env.APP_ORIGIN}/vendor-price/${invitation.token}`;
    const result = await msg91WhatsAppService.sendVendorPriceInquiry({
      to: invitation.whatsappNumber,
      contactName: vendorName,
      inquiryTitle,
      submissionUrl,
    });

    if (result.success) {
      await db
        .update(vendorPriceInquiryInvitations)
        .set({ status: 'sent', sentAt: new Date(), msg91MessageId: result.messageId })
        .where(eq(vendorPriceInquiryInvitations.id, invitationId));
    }

    return { result };
  }

  // --- Public: get inquiry details by token ---
  async getPublicInquiry(token: string) {
    const [row] = await db
      .select({
        invitation: vendorPriceInquiryInvitations,
        inquiry: vendorPriceInquiries,
        vendor: {
          id: vendors.id,
          code: vendors.code,
          displayName: vendors.displayName,
          tradeName: vendors.tradeName,
        },
      })
      .from(vendorPriceInquiryInvitations)
      .innerJoin(vendorPriceInquiries, eq(vendorPriceInquiryInvitations.inquiryId, vendorPriceInquiries.id))
      .innerJoin(vendors, eq(vendorPriceInquiryInvitations.vendorId, vendors.id))
      .where(eq(vendorPriceInquiryInvitations.token, token));

    if (!row) throw new AppError('NOT_FOUND', 'This invitation link is not valid.', 404);

    if (row.invitation.expiresAt < new Date()) {
      throw new AppError('VALIDATION_ERROR', 'This invitation link has expired.', 410);
    }

    return {
      inquiry: {
        id: row.inquiry.id,
        inquiryCode: row.inquiry.inquiryCode,
        title: row.inquiry.title,
        description: row.inquiry.description,
        items: row.inquiry.items,
        responseDueDate: row.inquiry.responseDueDate,
      },
      vendor: row.vendor,
      invitationStatus: row.invitation.status,
      expiresAt: row.invitation.expiresAt,
    };
  }

  // --- Public: submit vendor prices ---
  async submitPublicResponse(token: string, input: SubmitPriceResponseInput) {
    const [invitation] = await db
      .select()
      .from(vendorPriceInquiryInvitations)
      .where(eq(vendorPriceInquiryInvitations.token, token));

    if (!invitation) throw new AppError('NOT_FOUND', 'Invitation not found.', 404);
    if (invitation.expiresAt < new Date()) {
      throw new AppError('VALIDATION_ERROR', 'This invitation link has expired.', 410);
    }

    const responseRows = input.responses.map((r) => ({
      invitationId: invitation.id,
      inquiryId: invitation.inquiryId,
      vendorId: invitation.vendorId,
      companyId: invitation.companyId,
      itemRef: r.itemRef,
      unitRate: r.unitRate,
      currency: r.currency,
      leadTimeDays: r.leadTimeDays,
      notes: r.notes,
      moq: r.moq,
      validUntil: r.validUntil,
    }));

    const inserted = await db
      .insert(vendorPriceInquiryResponses)
      .values(responseRows)
      .returning();

    await db
      .update(vendorPriceInquiryInvitations)
      .set({ status: 'responded', respondedAt: new Date() })
      .where(eq(vendorPriceInquiryInvitations.id, invitation.id));

    // Save/update to vendorPriceLists for future comparison
    if (input.saveToPriceList !== false) {
      for (const r of input.responses) {
        const todayStr = new Date().toISOString().split('T')[0]!;
        const itemId = r.itemRef.itemId;
        if (itemId) {
          const existing = await db
            .select()
            .from(vendorPriceLists)
            .where(
              and(
                eq(vendorPriceLists.companyId, invitation.companyId),
                eq(vendorPriceLists.vendorId, invitation.vendorId),
                eq(vendorPriceLists.itemId, itemId),
              ),
            );

          if (existing.length > 0) {
            await db
              .update(vendorPriceLists)
              .set({
                unitRate: r.unitRate,
                currency: r.currency,
                leadTimeDays: r.leadTimeDays ?? existing[0]!.leadTimeDays,
                effectiveFrom: todayStr,
                updatedAt: new Date(),
              })
              .where(eq(vendorPriceLists.id, existing[0]!.id));
          } else {
            await db.insert(vendorPriceLists).values({
              companyId: invitation.companyId,
              vendorId: invitation.vendorId,
              itemId,
              vendorProductName: r.itemRef.itemName,
              unitRate: r.unitRate,
              currency: r.currency,
              leadTimeDays: r.leadTimeDays,
              effectiveFrom: todayStr,
            });
          }
        }
      }
    }

    logger.info(
      { inquiryId: invitation.inquiryId, vendorId: invitation.vendorId, count: inserted.length },
      'Vendor submitted price inquiry responses.',
    );

    return { submitted: inserted.length };
  }
}

export const priceInquiryService = new PriceInquiryService();
