import { isAdministrator } from "../../core/security/administrator.js";
import { Decimal } from "decimal.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/appError.js";
import {
  db,
  type Database,
  type DatabaseExecutor,
} from "../../infrastructure/database/db.js";
import { createAuthRepository } from "../auth/auth.repository.js";
import { hasPermission } from "../auth/auth.middleware.js";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { createCrmRepository } from "../crm/crm.repository.js";
import { createNotificationRepository } from "../notifications/notification.repository.js";
import { createProcurementRepository } from "./procurement.repository.js";
import {
  fromFulfillmentPlanSchema,
  fromSrrSchema,
} from "./procurement.schemas.js";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  customers,
  quotations,
  quotationRevisions,
  quotationLines,
  boqLines,
  stockLocations,
  stockBalances,
  warehouseItemThresholds,
  materialIssueRequests,
  materialIssueRequestLines,
  deliveryChallanLines,
  purchaseOrders,
  purchaseOrderLines,
  procurementRequisitions,
  procurementRequisitionLines,
  projectCommercialBaselines,
  projects,
  warehouses,
  items,
  units,
  itemBrandOfferings,
  brands,
  storeReplenishmentRequests,
  vendorPriceInquiries,
  vendorPriceInquiryResponses,
} from "../../infrastructure/database/schema/index.js";

type ListInput = {
  search?: string;
  status?: string;
  page: number;
  pageSize: number;
  sort: "requisitionNumber" | "title" | "status" | "requiredBy" | "updatedAt";
  direction: "asc" | "desc";
};
type RequisitionInput = {
  projectId: string;
  boqRevisionId: string;
  title: string;
  purchaseManagerUserId: string;
  requiredBy: string;
  deliveryLocation: string;
  notes?: string;
  lines: Array<{ boqLineId: string; quantity: string }>;
};
type OfferInput = {
  vendorId: string;
  vendorReference: string;
  currency: string;
  taxBasis: string;
  freightAmount: string;
  leadTimeDays?: number;
  paymentTerms: string;
  warranty: string;
  validUntil?: string;
  lines: Array<{
    rfqLineId: string;
    unitRate: string;
    brandOffered: string;
    specificationOffered: string;
    equivalence: "equivalent" | "deviation" | "unknown";
    deviationNotes?: string;
  }>;
};

function validation(message: string) {
  return new AppError("VALIDATION_ERROR", message, 422);
}

export class ProcurementService {
  constructor(private readonly database: Database = db) {}

  private assert(
    principal: AuthenticatedPrincipal,
    permission:
      | "procurement.sourcing.read"
      | "procurement.requisition.create"
      | "procurement.rfq.manage"
      | "procurement.offer.manage"
      | "procurement.comparison.select"
      | "procurement.substitution.review",
  ) {
    if (principal.mustChangePassword)
      throw new ForbiddenError(
        "Change the temporary password before using this feature.",
      );
    if (!hasPermission(principal, permission)) throw new ForbiddenError();
  }

  async list(principal: AuthenticatedPrincipal, input: ListInput) {
    this.assert(principal, "procurement.sourcing.read");
    const result = await createProcurementRepository(this.database).list(
      principal.companyId,
      principal.userId,
      {
        ...input,
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      },
    );
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async createOptions(principal: AuthenticatedPrincipal) {
    this.assert(principal, "procurement.requisition.create");
    const repository = createProcurementRepository(this.database);
    const [rows, managers] = await Promise.all([
      repository.listProjectBoqOptions(principal.companyId, principal.userId),
      createCrmRepository(this.database).listEligibleUsers(
        principal.companyId,
        "procurement.comparison.select",
      ),
    ]);
    const projects = new Map<
      string,
      {
        id: string;
        projectNumber: string;
        title: string;
        boqs: Array<{
          id: string;
          revisionNumber: number;
          title: string;
          lines: Awaited<ReturnType<typeof repository.listBoqLines>>;
        }>;
        managers: Array<{ id: string; name: string; email: string }>;
      }
    >();
    for (const row of rows) {
      if (!projects.has(row.projectId))
        projects.set(row.projectId, {
          id: row.projectId,
          projectNumber: row.projectNumber,
          title: row.projectTitle,
          boqs: [],
          managers: [],
        });
      const project = projects.get(row.projectId)!;
      if (!project.boqs.some((boq) => boq.id === row.boqRevisionId)) {
        project.boqs.push({
          id: row.boqRevisionId,
          revisionNumber: row.boqRevisionNumber,
          title: row.boqTitle,
          lines: await repository.listBoqLines(
            principal.companyId,
            row.boqRevisionId,
          ),
        });
      }
    }
    await Promise.all(
      [...projects.values()].map(async (project) => {
        const memberIds = new Set(
          (
            await repository.listProjectMemberIds(
              principal.companyId,
              project.id,
            )
          ).map((member) => member.userId),
        );
        project.managers = managers.filter(
          (manager) =>
            memberIds.has(manager.id) &&
            (manager.id !== principal.userId || isAdministrator(principal)),
        );
      }),
    );
    return { projects: [...projects.values()] };
  }

  async create(
    principal: AuthenticatedPrincipal,
    input: RequisitionInput,
    requestId: string,
  ) {
    this.assert(principal, "procurement.requisition.create");
    if (
      !isAdministrator(principal) &&
      input.purchaseManagerUserId === principal.userId
    ) {
      throw validation(
        "The buyer and purchase manager must be different employees.",
      );
    }
    const manager = await createCrmRepository(this.database).findEligibleUser(
      principal.companyId,
      input.purchaseManagerUserId,
      "procurement.comparison.select",
    );
    if (!manager)
      throw validation(
        "Choose an active employee eligible for purchase comparison selection.",
      );

    return this.database.transaction(async (transaction) => {
      const repository = createProcurementRepository(transaction);
      const context = await repository.findProjectBoq(
        principal.companyId,
        principal.userId,
        input.projectId,
        input.boqRevisionId,
      );
      if (!context)
        throw new NotFoundError(
          "The started project or approved BOQ is outside your assigned scope.",
        );
      const memberIds = new Set(
        (
          await repository.listProjectMemberIds(
            principal.companyId,
            input.projectId,
          )
        ).map((member) => member.userId),
      );
      if (!memberIds.has(input.purchaseManagerUserId))
        throw validation(
          "The purchase manager must be an explicit member of this project.",
        );
      const boqLines = await repository.listBoqLines(
        principal.companyId,
        input.boqRevisionId,
      );
      const requested = new Map(
        input.lines.map((line) => [line.boqLineId, line.quantity]),
      );
      const selected = boqLines.filter((line) => requested.has(line.id));
      if (selected.length !== input.lines.length)
        throw validation(
          "Every requisition line must belong to the selected approved BOQ.",
        );
      for (const line of selected) {
        const quantity = new Decimal(requested.get(line.id)!);
        if (quantity.gt(line.quantity))
          throw validation(
            `Requested quantity for ${line.itemCode} cannot exceed the approved BOQ quantity.`,
          );
      }
      const now = new Date();
      const requisition = await repository.createRequisition({
        companyId: principal.companyId,
        projectId: input.projectId,
        boqRevisionId: input.boqRevisionId,
        requisitionNumber: await repository.allocateNumber(
          principal.companyId,
          "REQUISITION",
          "REQ",
          now,
        ),
        title: input.title,
        buyerUserId: principal.userId,
        purchaseManagerUserId: input.purchaseManagerUserId,
        requiredBy: input.requiredBy,
        deliveryLocation: input.deliveryLocation,
        notes: input.notes,
      });
      await repository.createRequisitionLines(
        selected.map((line, index) => {
          const qtyStr = new Decimal(requested.get(line.id)!).toFixed(4);
          return {
            companyId: principal.companyId,
            requisitionId: requisition.id,
            boqLineId: line.id,
            lineNumber: index + 1,
            itemId: line.itemId,
            itemCodeSnapshot: line.itemCode,
            itemNameSnapshot: line.itemName,
            specificationSnapshot: line.specification,
            unitId: line.unitId,
            unitSymbolSnapshot: line.unitSymbol,
            quantity: qtyStr,
            projectAllocationQty: qtyStr,
            storeReplenishmentQty: "0.0000",
            destinationType: "warehouse" as const,
          };
        }),
      );
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: input.purchaseManagerUserId,
        type: "procurement.requisition_created",
        severity: "info",
        title: "Procurement requisition assigned",
        message: `${requisition.requisitionNumber} was assigned for supplier selection.`,
        link: `/procurement/requisitions/${requisition.id}`,
        targetType: "procurement_requisition",
        targetId: requisition.id,
        dedupKey: `procurement-requisition:${requisition.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.requisition_created",
        targetType: "procurement_requisition",
        targetId: requisition.id,
        requestId,
        metadata: {
          projectId: input.projectId,
          boqRevisionId: input.boqRevisionId,
          lineCount: selected.length,
          purchaseManagerUserId: input.purchaseManagerUserId,
        },
      });
      return requisition;
    });
  }

  private async requisition(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
  ) {
    this.assert(principal, "procurement.sourcing.read");
    const requisition = await createProcurementRepository(this.database).find(
      principal.companyId,
      principal.userId,
      requisitionId,
    );
    if (!requisition)
      throw new NotFoundError("Procurement requisition not found.");
    return requisition;
  }

  async get(principal: AuthenticatedPrincipal, requisitionId: string) {
    const requisition = await this.requisition(principal, requisitionId);
    const repository = createProcurementRepository(this.database);
    const [lines, linkedInquiries, linkedPos] = await Promise.all([
      repository.listRequisitionLines(principal.companyId, requisitionId),
      this.database
        .select({
          id: vendorPriceInquiries.id,
          inquiryCode: vendorPriceInquiries.inquiryCode,
          title: vendorPriceInquiries.title,
          status: vendorPriceInquiries.status,
          createdAt: vendorPriceInquiries.createdAt,
        })
        .from(vendorPriceInquiries)
        .where(
          and(
            eq(vendorPriceInquiries.companyId, principal.companyId),
            eq(vendorPriceInquiries.requisitionId, requisitionId),
          ),
        )
        .orderBy(desc(vendorPriceInquiries.createdAt)),
      this.database
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          vendorId: purchaseOrders.vendorId,
          status: purchaseOrders.status,
        })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.companyId, principal.companyId),
            eq(purchaseOrders.requisitionId, requisitionId),
            ne(purchaseOrders.status, "cancelled"),
          ),
        )
        .orderBy(desc(purchaseOrders.createdAt)),
    ]);
    const activeVendors =
      requisition.buyerUserId === principal.userId || isAdministrator(principal)
        ? await repository.listActiveVendors(principal.companyId)
        : [];
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq)
      return {
        requisition,
        lines,
        activeVendors,
        priceInquiries: linkedInquiries,
        generatedPurchaseOrders: linkedPos,
        rfq: null,
        rfqLines: [],
        invitedVendors: [],
        offers: [],
        comparison: null,
        selection: null,
        lineAwards: [],
        capabilities: this.capabilities(principal, requisition),
      };
    const [rfqLines, invitedVendors, offers, comparison] = await Promise.all([
      repository.listRfqLines(principal.companyId, rfq.id),
      repository.listRfqVendors(principal.companyId, rfq.id),
      repository.listOffers(principal.companyId, rfq.id),
      repository.findComparison(principal.companyId, rfq.id),
    ]);
    const itemIds = Array.from(
      new Set(rfqLines.map((line) => line.itemId).filter(Boolean)),
    );
    const itemBrandsList = await repository.listBrandsForItems(
      principal.companyId,
      itemIds,
    );
    const rfqLinesWithBrands = rfqLines.map((line) => ({
      ...line,
      eligibleBrands: itemBrandsList.filter((b) => b.itemId === line.itemId),
    }));
    const offerLines = await repository.listOfferLines(
      principal.companyId,
      offers.map((offer) => offer.id),
    );
    const substitutionReviews = await repository.listSubstitutionReviews(
      principal.companyId,
      offerLines.map((line) => line.id),
    );
    const offersWithLines = offers.map((offer) => ({
      ...offer,
      lines: offerLines
        .filter((line) => line.vendorOfferId === offer.id)
        .map((line) => ({
          ...line,
          substitutionReview:
            substitutionReviews.find(
              (review) => review.vendorOfferLineId === line.id,
            ) ?? null,
        })),
    }));
    const selection = comparison
      ? await repository.findSelection(principal.companyId, comparison.id)
      : null;
    const lineAwards = selection
      ? await repository.listSelectionLineAwards(
          principal.companyId,
          selection.id,
        )
      : [];
    return {
      requisition,
      lines,
      activeVendors,
      priceInquiries: linkedInquiries,
      generatedPurchaseOrders: linkedPos,
      rfq,
      rfqLines: rfqLinesWithBrands,
      invitedVendors,
      offers: offersWithLines,
      comparison,
      selection,
      lineAwards,
      capabilities: this.capabilities(principal, requisition),
    };
  }

  private capabilities(
    principal: AuthenticatedPrincipal,
    requisition: { buyerUserId: string; purchaseManagerUserId: string },
  ) {
    return {
      canManageRfq:
        (requisition.buyerUserId === principal.userId ||
          isAdministrator(principal)) &&
        hasPermission(principal, "procurement.rfq.manage"),
      canRecordOffer:
        (requisition.buyerUserId === principal.userId ||
          isAdministrator(principal)) &&
        hasPermission(principal, "procurement.offer.manage"),
      canSelect:
        (requisition.purchaseManagerUserId === principal.userId ||
          isAdministrator(principal)) &&
        (requisition.buyerUserId !== principal.userId ||
          isAdministrator(principal)) &&
        hasPermission(principal, "procurement.comparison.select"),
    };
  }

  async createRfq(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
    input: {
      vendorIds: string[];
      responseDueDate: string;
      commercialTerms: string;
      expectedVersion: number;
    },
    requestId: string,
  ) {
    this.assert(principal, "procurement.rfq.manage");
    const requisition = await this.requisition(principal, requisitionId);
    if (
      !isAdministrator(principal) &&
      requisition.buyerUserId !== principal.userId
    )
      throw new ForbiddenError("Only the assigned buyer can create this RFQ.");
    if (requisition.status !== "open")
      throw new ConflictError("This requisition is already in sourcing.");
    const repository = createProcurementRepository(this.database);
    const vendors = await repository.findActiveVendors(
      principal.companyId,
      input.vendorIds,
    );
    if (vendors.length !== input.vendorIds.length)
      throw validation(
        "Every invited vendor must be active and belong to this company.",
      );
    const requisitionLines = await repository.listRequisitionLines(
      principal.companyId,
      requisitionId,
    );
    if (requisitionLines.length === 0)
      throw validation(
        "The requisition must contain at least one demand line.",
      );

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const now = new Date();
      const rfq = await tx.createRfq({
        companyId: principal.companyId,
        requisitionId,
        rfqNumber: await tx.allocateNumber(
          principal.companyId,
          "RFQ",
          "RFQ",
          now,
        ),
        responseDueDate: input.responseDueDate,
        commercialTerms: input.commercialTerms,
        createdByUserId: principal.userId,
      });
      if (!rfq)
        throw new ConflictError("An RFQ already exists for this requisition.");
      await tx.createRfqVendors(
        input.vendorIds.map((vendorId) => ({
          companyId: principal.companyId,
          rfqId: rfq.id,
          vendorId,
        })),
      );
      await tx.createRfqLines(
        requisitionLines.map((line) => ({
          companyId: principal.companyId,
          rfqId: rfq.id,
          requisitionLineId: line.id,
          lineNumber: line.lineNumber,
          itemId: line.itemId,
          itemCodeSnapshot: line.itemCodeSnapshot,
          itemNameSnapshot: line.itemNameSnapshot,
          specificationSnapshot: line.specificationSnapshot,
          unitId: line.unitId,
          unitSymbolSnapshot: line.unitSymbolSnapshot,
          quantity: line.quantity,
        })),
      );
      await tx.createComparison({
        companyId: principal.companyId,
        rfqId: rfq.id,
      });
      if (
        !(await tx.transitionRequisition(
          principal.companyId,
          requisitionId,
          input.expectedVersion,
          "open",
          "sourcing",
        ))
      ) {
        throw new ConflictError(
          "The requisition changed. Refresh and try again.",
        );
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.rfq_created",
        targetType: "procurement_rfq",
        targetId: rfq.id,
        requestId,
        metadata: {
          requisitionId,
          vendorIds: input.vendorIds,
          lineCount: requisitionLines.length,
          responseDueDate: input.responseDueDate,
          externalDelivery: false,
        },
      });
      return rfq;
    });
  }

  async recordOffer(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
    input: OfferInput,
    requestId: string,
  ) {
    this.assert(principal, "procurement.offer.manage");
    const requisition = await this.requisition(principal, requisitionId);
    if (
      !isAdministrator(principal) &&
      requisition.buyerUserId !== principal.userId
    )
      throw new ForbiddenError(
        "Only the assigned buyer can record vendor offers.",
      );
    const repository = createProcurementRepository(this.database);
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq || rfq.status !== "open" || requisition.status !== "sourcing")
      throw new ConflictError("This RFQ is not open for offers.");
    if (
      !(await repository.isInvitedVendor(
        principal.companyId,
        rfq.id,
        input.vendorId,
      ))
    )
      throw validation("Choose a vendor invited to this RFQ.");
    const rfqLines = await repository.listRfqLines(principal.companyId, rfq.id);
    const submittedLines = new Map(
      input.lines.map((line) => [line.rfqLineId, line]),
    );
    if (
      rfqLines.length !== input.lines.length ||
      rfqLines.some((line) => !submittedLines.has(line.id))
    ) {
      throw validation("Record one offer line for every RFQ line.");
    }
    const computed = rfqLines.map((line) => {
      const inputLine = submittedLines.get(line.id)!;
      return {
        line,
        input: inputLine,
        total: new Decimal(line.quantity)
          .mul(inputLine.unitRate)
          .toDecimalPlaces(2),
      };
    });
    const subtotal = computed.reduce(
      (sum, line) => sum.plus(line.total),
      new Decimal(0),
    );
    const freight = new Decimal(input.freightAmount);

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const offer = await tx.createOffer({
        companyId: principal.companyId,
        rfqId: rfq.id,
        vendorId: input.vendorId,
        vendorReference: input.vendorReference,
        currency: input.currency,
        taxBasis: input.taxBasis,
        freightAmount: freight.toFixed(2),
        leadTimeDays: input.leadTimeDays,
        paymentTerms: input.paymentTerms,
        warranty: input.warranty,
        validUntil: input.validUntil,
        subtotal: subtotal.toFixed(2),
        total: subtotal.plus(freight).toFixed(2),
        recordedByUserId: principal.userId,
      });
      if (!offer)
        throw new ConflictError(
          "An offer for this vendor is already recorded against the RFQ.",
        );
      await tx.createOfferLines(
        computed.map(({ line, input: offerLine, total }) => ({
          companyId: principal.companyId,
          vendorOfferId: offer.id,
          rfqLineId: line.id,
          lineNumber: line.lineNumber,
          unitRate: new Decimal(offerLine.unitRate).toFixed(2),
          lineTotal: total.toFixed(2),
          brandOffered: offerLine.brandOffered,
          specificationOffered: offerLine.specificationOffered,
          equivalence: offerLine.equivalence,
          deviationNotes: offerLine.deviationNotes,
        })),
      );
      const needsEngineeringReview = computed.some(
        ({ input: line }) => line.equivalence !== "equivalent",
      );
      const engineeringReviewer = needsEngineeringReview
        ? await tx.findEngineeringReviewer(principal.companyId, requisitionId)
        : undefined;
      if (
        engineeringReviewer?.userId &&
        engineeringReviewer.userId !== principal.userId
      ) {
        await createNotificationRepository(transaction).create({
          companyId: principal.companyId,
          recipientUserId: engineeringReviewer.userId,
          type: "procurement.substitution_review_requested",
          severity: "warning",
          title: "Technical offer review requested",
          message: `${requisition.requisitionNumber} contains a vendor deviation or unknown equivalence requiring your decision.`,
          link: `/procurement/substitution-reviews/${requisitionId}`,
          targetType: "vendor_offer",
          targetId: offer.id,
          dedupKey: `procurement-substitution-review:${offer.id}`,
        });
      }
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: requisition.purchaseManagerUserId,
        type: "procurement.offer_recorded",
        severity: "info",
        title: "Vendor offer recorded",
        message: `${requisition.requisitionNumber} has another submitted vendor offer.`,
        link: `/procurement/requisitions/${requisitionId}`,
        targetType: "vendor_offer",
        targetId: offer.id,
        dedupKey: `vendor-offer:${offer.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.vendor_offer_recorded",
        targetType: "vendor_offer",
        targetId: offer.id,
        requestId,
        metadata: {
          requisitionId,
          rfqId: rfq.id,
          vendorId: input.vendorId,
          currency: input.currency,
          total: offer.total,
          lineCount: computed.length,
        },
      });
      return offer;
    });
  }

  async selectOffer(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
    input: {
      offerId: string;
      selectionReason: string;
      singleSourceExceptionReason?: string;
      expectedVersion: number;
    },
    requestId: string,
  ) {
    this.assert(principal, "procurement.comparison.select");
    const requisition = await this.requisition(principal, requisitionId);
    if (
      !isAdministrator(principal) &&
      requisition.purchaseManagerUserId !== principal.userId
    )
      throw new ForbiddenError(
        "Only the assigned purchase manager can select the supplier.",
      );
    if (
      !isAdministrator(principal) &&
      requisition.buyerUserId === principal.userId
    )
      throw new ForbiddenError(
        "The buyer cannot approve their own sourcing work.",
      );
    const repository = createProcurementRepository(this.database);
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq || rfq.status !== "open" || requisition.status !== "sourcing")
      throw new ConflictError("This comparison is not open for selection.");
    const [offers, comparison] = await Promise.all([
      repository.listOffers(principal.companyId, rfq.id),
      repository.findComparison(principal.companyId, rfq.id),
    ]);
    if (!comparison) throw new NotFoundError("Purchase comparison not found.");
    const selected = offers.find((offer) => offer.id === input.offerId);
    if (!selected) throw validation("Choose a submitted offer from this RFQ.");
    if (offers.length < 2 && !input.singleSourceExceptionReason)
      throw validation(
        "A purchase-manager single-source exception reason is required when fewer than two vendor offers are available.",
      );
    // Technical reviews not required per business update: purchase manager can select offer directly
    const sameCurrency = offers.filter(
      (offer) => offer.currency === selected.currency,
    );
    const lowestComparable = sameCurrency.reduce(
      (lowest, offer) =>
        new Decimal(offer.total).lt(lowest) ? new Decimal(offer.total) : lowest,
      new Decimal(selected.total),
    );
    const nonLowest = new Decimal(selected.total).gt(lowestComparable);

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const locked = await tx.lockComparison(
        principal.companyId,
        comparison.id,
      );
      if (
        !locked ||
        locked.status !== "open" ||
        locked.rowVersion !== input.expectedVersion
      )
        throw new ConflictError(
          "The comparison changed or was already selected.",
        );
      if (
        !(await tx.transitionComparison(
          principal.companyId,
          comparison.id,
          input.expectedVersion,
        ))
      )
        throw new ConflictError(
          "The comparison changed or was already selected.",
        );
      if (
        !(await tx.transitionRfq(principal.companyId, rfq.id, rfq.rowVersion))
      )
        throw new ConflictError("The RFQ changed or was already closed.");
      if (
        !(await tx.transitionRequisition(
          principal.companyId,
          requisitionId,
          requisition.rowVersion,
          "sourcing",
          "selected",
        ))
      )
        throw new ConflictError(
          "The requisition changed. Refresh and try again.",
        );
      const decision = await tx.createSelection({
        companyId: principal.companyId,
        comparisonId: comparison.id,
        selectedOfferId: selected.id,
        selectionReason: input.selectionReason,
        singleSourceExceptionReason:
          offers.length < 2 ? input.singleSourceExceptionReason : undefined,
        selectedByUserId: principal.userId,
      });
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: requisition.buyerUserId,
        type: "procurement.supplier_selected",
        severity: "success",
        title: "Supplier selected",
        message: `${selected.vendorName} was selected for ${requisition.requisitionNumber}.`,
        link: `/procurement/requisitions/${requisitionId}`,
        targetType: "procurement_selection",
        targetId: decision.id,
        dedupKey: `supplier-selected:${comparison.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.supplier_selected",
        targetType: "procurement_selection",
        targetId: decision.id,
        requestId,
        metadata: {
          administratorOverride: isAdministrator(principal),
          requisitionId,
          rfqId: rfq.id,
          selectedOfferId: selected.id,
          vendorId: selected.vendorId,
          offerCount: offers.length,
          singleSourceException: offers.length < 2,
          nonLowestComparable: nonLowest,
          currency: selected.currency,
          total: selected.total,
        },
      });
      return decision;
    });
  }

  async convertInquiryResponsesToOffers(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
    input: { inquiryId: string; vendorIds?: string[] },
    requestId: string,
  ) {
    this.assert(principal, "procurement.offer.manage");
    const requisition = await this.requisition(principal, requisitionId);
    if (
      !isAdministrator(principal) &&
      requisition.buyerUserId !== principal.userId
    )
      throw new ForbiddenError(
        "Only the assigned buyer can import price-inquiry responses.",
      );
    const repository = createProcurementRepository(this.database);
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq || rfq.status !== "open" || requisition.status !== "sourcing")
      throw new ConflictError("This RFQ is not open for offers.");

    const [inquiry] = await this.database
      .select()
      .from(vendorPriceInquiries)
      .where(
        and(
          eq(vendorPriceInquiries.companyId, principal.companyId),
          eq(vendorPriceInquiries.id, input.inquiryId),
        ),
      );
    if (!inquiry) throw new NotFoundError("Price inquiry not found.");
    if (inquiry.requisitionId && inquiry.requisitionId !== requisitionId)
      throw validation(
        "This price inquiry belongs to a different requisition.",
      );

    const responseFilters = [
      eq(vendorPriceInquiryResponses.companyId, principal.companyId),
      eq(vendorPriceInquiryResponses.inquiryId, inquiry.id),
    ];
    if (input.vendorIds?.length)
      responseFilters.push(
        inArray(vendorPriceInquiryResponses.vendorId, input.vendorIds),
      );
    const responses = await this.database
      .select()
      .from(vendorPriceInquiryResponses)
      .where(and(...responseFilters))
      .orderBy(desc(vendorPriceInquiryResponses.submittedAt));

    const rfqLines = await repository.listRfqLines(principal.companyId, rfq.id);
    if (rfqLines.length === 0)
      throw validation("This RFQ has no lines to award.");
    const existingOffers = await repository.listOffers(
      principal.companyId,
      rfq.id,
    );
    const existingVendorIds = new Set(
      existingOffers.map((offer) => offer.vendorId),
    );
    const existingResponseIds = new Set(
      existingOffers
        .map((offer) => offer.sourcePriceInquiryResponseId)
        .filter((id): id is string => Boolean(id)),
    );

    type VendorResponse = {
      vendorId: string;
      responseId: string;
      line: (typeof rfqLines)[number];
      response: (typeof responses)[number];
    };
    const responsesByVendor = new Map<string, VendorResponse[]>();
    for (const response of responses) {
      const itemRef = (response.itemRef ?? {}) as {
        itemId?: string;
        itemCode?: string;
        itemName?: string;
        brandOffered?: string;
        specification?: string;
      };
      const rfqLine =
        rfqLines.find(
          (line) => itemRef.itemId && line.itemId === itemRef.itemId,
        ) ??
        rfqLines.find(
          (line) =>
            itemRef.itemCode &&
            line.itemCodeSnapshot.toLowerCase() ===
              itemRef.itemCode.toLowerCase(),
        ) ??
        rfqLines.find(
          (line) =>
            itemRef.itemName &&
            line.itemNameSnapshot.toLowerCase() ===
              itemRef.itemName.toLowerCase(),
        );
      if (!rfqLine) continue;
      const bucket = responsesByVendor.get(response.vendorId) ?? [];
      if (bucket.some((entry) => entry.line.id === rfqLine.id)) continue;
      bucket.push({
        vendorId: response.vendorId,
        responseId: response.id,
        line: rfqLine,
        response,
      });
      responsesByVendor.set(response.vendorId, bucket);
    }

    const imported: Array<{ vendorId: string; offerId: string; total: string }> =
      [];
    const skipped: Array<{ vendorId: string; reason: string }> = [];

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      if (!inquiry.requisitionId) {
        await transaction
          .update(vendorPriceInquiries)
          .set({ requisitionId, updatedAt: new Date() })
          .where(
            and(
              eq(vendorPriceInquiries.companyId, principal.companyId),
              eq(vendorPriceInquiries.id, inquiry.id),
            ),
          );
      }
      for (const [vendorId, entries] of responsesByVendor) {
        if (entries.some((entry) => existingResponseIds.has(entry.responseId))) {
          skipped.push({ vendorId, reason: "already_imported" });
          continue;
        }
        if (existingVendorIds.has(vendorId)) {
          skipped.push({ vendorId, reason: "offer_already_recorded" });
          continue;
        }
        if (entries.length !== rfqLines.length) {
          skipped.push({ vendorId, reason: "incomplete_line_coverage" });
          continue;
        }
        const currencies = new Set(
          entries.map((entry) => entry.response.currency),
        );
        if (currencies.size > 1) {
          skipped.push({ vendorId, reason: "mixed_currencies" });
          continue;
        }
        const ordered = [...entries].sort(
          (a, b) => a.line.lineNumber - b.line.lineNumber,
        );
        let subtotal = new Decimal(0);
        const computed = ordered.map((entry) => {
          const rate = new Decimal(entry.response.unitRate);
          const lineTotal = new Decimal(entry.line.quantity)
            .mul(rate)
            .toDecimalPlaces(2);
          subtotal = subtotal.plus(lineTotal);
          return { entry, rate, lineTotal };
        });
        const leadTimes = entries
          .map((entry) => entry.response.leadTimeDays)
          .filter((value): value is number => typeof value === "number");
        const validUntil = entries
          .map((entry) => entry.response.validUntil)
          .filter((value): value is string => Boolean(value))
          .sort()[0];
        const offer = await tx.createOffer({
          companyId: principal.companyId,
          rfqId: rfq.id,
          vendorId,
          vendorReference: `Price inquiry ${inquiry.inquiryCode}`,
          currency: ordered[0]!.response.currency,
          taxBasis: "As quoted in price inquiry",
          freightAmount: "0.00",
          leadTimeDays: leadTimes.length ? Math.max(...leadTimes) : null,
          paymentTerms: "As per price inquiry response",
          warranty: "As per vendor confirmation",
          validUntil: validUntil ?? null,
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
          recordedByUserId: principal.userId,
          sourcePriceInquiryResponseId: ordered[0]!.responseId,
        });
        if (!offer) {
          skipped.push({ vendorId, reason: "offer_already_recorded" });
          continue;
        }
        await tx.createOfferLines(
          computed.map(({ entry, rate, lineTotal }) => {
            const itemRef = (entry.response.itemRef ?? {}) as {
              brandOffered?: string;
              specification?: string;
            };
            return {
              companyId: principal.companyId,
              vendorOfferId: offer.id,
              rfqLineId: entry.line.id,
              lineNumber: entry.line.lineNumber,
              unitRate: rate.toFixed(2),
              lineTotal: lineTotal.toFixed(2),
              brandOffered:
                itemRef.brandOffered?.trim() || "As per price inquiry response",
              specificationOffered:
                itemRef.specification?.trim() ||
                entry.line.specificationSnapshot,
              equivalence: "equivalent" as const,
              deviationNotes: null,
            };
          }),
        );
        imported.push({
          vendorId,
          offerId: offer.id,
          total: offer.total,
        });
      }

      if (imported.length > 0) {
        await createNotificationRepository(transaction).create({
          companyId: principal.companyId,
          recipientUserId: requisition.purchaseManagerUserId,
          type: "procurement.offer_recorded",
          severity: "info",
          title: "Price inquiry offers imported",
          message: `${imported.length} vendor offer(s) were imported into ${requisition.requisitionNumber} from inquiry ${inquiry.inquiryCode}.`,
          link: `/procurement/requisitions/${requisitionId}`,
          targetType: "procurement_requisition",
          targetId: requisitionId,
          dedupKey: `price-inquiry-import:${inquiry.id}`,
        });
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.inquiry_offers_imported",
        targetType: "procurement_requisition",
        targetId: requisitionId,
        requestId,
        metadata: {
          requisitionId,
          rfqId: rfq.id,
          inquiryId: inquiry.id,
          importedVendorIds: imported.map((entry) => entry.vendorId),
          skipped,
        },
      });
      return { imported, skipped };
    });
  }

  async selectSplit(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
    input: {
      awards: Array<{
        rfqLineId: string;
        winningOfferId: string;
        winningOfferLineId: string;
        selectionReason?: string;
      }>;
      selectionReason?: string;
      singleSourceExceptionReason?: string;
      expectedVersion: number;
    },
    requestId: string,
  ) {
    this.assert(principal, "procurement.comparison.select");
    const requisition = await this.requisition(principal, requisitionId);
    if (
      !isAdministrator(principal) &&
      requisition.purchaseManagerUserId !== principal.userId
    )
      throw new ForbiddenError(
        "Only the assigned purchase manager can select the supplier.",
      );
    if (
      !isAdministrator(principal) &&
      requisition.buyerUserId === principal.userId
    )
      throw new ForbiddenError(
        "The buyer cannot approve their own sourcing work.",
      );
    const repository = createProcurementRepository(this.database);
    const rfq = await repository.findRfq(principal.companyId, requisitionId);
    if (!rfq || rfq.status !== "open" || requisition.status !== "sourcing")
      throw new ConflictError("This comparison is not open for selection.");
    const [rfqLines, offers, comparison] = await Promise.all([
      repository.listRfqLines(principal.companyId, rfq.id),
      repository.listOffers(principal.companyId, rfq.id),
      repository.findComparison(principal.companyId, rfq.id),
    ]);
    if (!comparison) throw new NotFoundError("Purchase comparison not found.");
    const offerLines = await repository.listOfferLines(
      principal.companyId,
      offers.map((offer) => offer.id),
    );
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));
    const offerLineById = new Map(offerLines.map((line) => [line.id, line]));
    const rfqLineById = new Map(rfqLines.map((line) => [line.id, line]));

    const resolved = input.awards.map((award) => {
      const rfqLine = rfqLineById.get(award.rfqLineId);
      if (!rfqLine)
        throw validation("Every award must reference a line from this RFQ.");
      const offer = offerById.get(award.winningOfferId);
      if (!offer)
        throw validation("Every award must reference a submitted vendor offer.");
      const offerLine = offerLineById.get(award.winningOfferLineId);
      if (
        !offerLine ||
        offerLine.vendorOfferId !== offer.id ||
        offerLine.rfqLineId !== rfqLine.id
      )
        throw validation(
          "Each winning offer line must belong to the selected vendor offer and RFQ line.",
        );
      return { award, rfqLine, offer, offerLine };
    });

    for (const { rfqLine } of resolved) {
      const competingVendors = new Set(
        offerLines
          .filter((line) => line.rfqLineId === rfqLine.id)
          .map((line) => offerById.get(line.vendorOfferId)?.vendorId)
          .filter((vendorId): vendorId is string => Boolean(vendorId)),
      );
      if (competingVendors.size < 2 && !input.singleSourceExceptionReason)
        throw validation(
          `Line #${rfqLine.lineNumber} has fewer than two comparable vendor offers. Record a purchase-manager single-source exception reason to proceed.`,
        );
    }

    const awardedValueByOffer = new Map<string, Decimal>();
    for (const { offer, offerLine } of resolved) {
      const current = awardedValueByOffer.get(offer.id) ?? new Decimal(0);
      awardedValueByOffer.set(
        offer.id,
        current.plus(new Decimal(offerLine.lineTotal)),
      );
    }
    let primaryOfferId = resolved[0]!.offer.id;
    let primaryValue = new Decimal(-1);
    for (const [offerId, value] of awardedValueByOffer) {
      if (value.gt(primaryValue)) {
        primaryValue = value;
        primaryOfferId = offerId;
      }
    }
    const primaryOffer = offerById.get(primaryOfferId)!;
    const defaultReason =
      input.selectionReason?.trim() ||
      `Split award across ${awardedValueByOffer.size} vendor(s) based on line-level comparison.`;
    const awardReason =
      input.selectionReason?.trim() || "Line-level split award.";

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const locked = await tx.lockComparison(
        principal.companyId,
        comparison.id,
      );
      if (
        !locked ||
        locked.status !== "open" ||
        locked.rowVersion !== input.expectedVersion
      )
        throw new ConflictError(
          "The comparison changed or was already selected.",
        );
      if (
        !(await tx.transitionComparison(
          principal.companyId,
          comparison.id,
          input.expectedVersion,
        ))
      )
        throw new ConflictError(
          "The comparison changed or was already selected.",
        );
      if (
        !(await tx.transitionRfq(principal.companyId, rfq.id, rfq.rowVersion))
      )
        throw new ConflictError("The RFQ changed or was already closed.");
      if (
        !(await tx.transitionRequisition(
          principal.companyId,
          requisitionId,
          requisition.rowVersion,
          "sourcing",
          "selected",
        ))
      )
        throw new ConflictError(
          "The requisition changed. Refresh and try again.",
        );
      const decision = await tx.createSelection({
        companyId: principal.companyId,
        comparisonId: comparison.id,
        selectedOfferId: primaryOffer.id,
        selectionReason: defaultReason,
        singleSourceExceptionReason: input.singleSourceExceptionReason,
        selectedByUserId: principal.userId,
      });
      const lineAwards = await tx.createSelectionLineAwards(
        resolved.map(({ award, rfqLine, offer, offerLine }) => ({
          companyId: principal.companyId,
          selectionDecisionId: decision.id,
          rfqLineId: rfqLine.id,
          winningVendorId: offer.vendorId,
          winningOfferId: offer.id,
          winningOfferLineId: offerLine.id,
          awardedQuantity: rfqLine.quantity,
          selectionReason: award.selectionReason?.trim() || awardReason,
        })),
      );
      const vendorIds = Array.from(
        new Set(resolved.map(({ offer }) => offer.vendorId)),
      );
      await createNotificationRepository(transaction).create({
        companyId: principal.companyId,
        recipientUserId: requisition.buyerUserId,
        type: "procurement.supplier_selected",
        severity: "success",
        title: "Line-level supplier selection recorded",
        message: `${requisition.requisitionNumber} was awarded across ${vendorIds.length} vendor(s) by line.`,
        link: `/procurement/requisitions/${requisitionId}`,
        targetType: "procurement_selection",
        targetId: decision.id,
        dedupKey: `supplier-selected:${comparison.id}`,
      });
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.split_award_selected",
        targetType: "procurement_selection",
        targetId: decision.id,
        requestId,
        metadata: {
          administratorOverride: isAdministrator(principal),
          requisitionId,
          rfqId: rfq.id,
          primaryOfferId: primaryOffer.id,
          offerCount: offers.length,
          vendorCount: vendorIds.length,
          singleSourceException: Boolean(input.singleSourceExceptionReason),
          lineAwards: lineAwards.map((award) => ({
            awardId: award.id,
            rfqLineId: award.rfqLineId,
            vendorId: award.winningVendorId,
            offerId: award.winningOfferId,
            offerLineId: award.winningOfferLineId,
            quantity: award.awardedQuantity,
          })),
        },
      });
      return { decision, lineAwards };
    });
  }

  async listSubstitutionReviews(
    principal: AuthenticatedPrincipal,
    input: {
      search?: string;
      status?: "pending" | "approved" | "rejected";
      page: number;
      pageSize: number;
      sort:
        | "requisitionNumber"
        | "vendorName"
        | "itemName"
        | "status"
        | "updatedAt";
      direction: "asc" | "desc";
    },
  ) {
    this.assert(principal, "procurement.substitution.review");
    const result = await createProcurementRepository(
      this.database,
    ).listSubstitutionReviewQueue(principal.companyId, principal.userId, {
      ...input,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  async getSubstitutionReview(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
  ) {
    this.assert(principal, "procurement.substitution.review");
    const repository = createProcurementRepository(this.database);
    const context = await repository.findTechnicalReviewContext(
      principal.companyId,
      principal.userId,
      requisitionId,
    );
    if (!context)
      throw new NotFoundError(
        "Technical substitution review not found or outside your project assignment.",
      );
    const items = await repository.listTechnicalReviewItems(
      principal.companyId,
      requisitionId,
    );
    return {
      context,
      items,
      capabilities: { canReview: context.requisitionStatus === "sourcing" },
    };
  }

  async reviewSubstitution(
    principal: AuthenticatedPrincipal,
    requisitionId: string,
    offerLineId: string,
    input: { decision: "approved" | "rejected"; reason: string },
    requestId: string,
  ) {
    this.assert(principal, "procurement.substitution.review");
    const repository = createProcurementRepository(this.database);
    const context = await repository.findTechnicalReviewContext(
      principal.companyId,
      principal.userId,
      requisitionId,
    );
    if (!context)
      throw new NotFoundError(
        "Technical substitution review not found or outside your project assignment.",
      );
    if (context.requisitionStatus !== "sourcing")
      throw new ConflictError(
        "This sourcing comparison is no longer open for technical review.",
      );
    const line = await repository.findOfferLineForReview(
      principal.companyId,
      requisitionId,
      offerLineId,
    );
    if (!line || line.equivalence === "equivalent")
      throw new NotFoundError("Technical deviation line not found.");
    if (
      !isAdministrator(principal) &&
      line.recordedByUserId === principal.userId
    )
      throw new ForbiddenError(
        "You cannot authorize a vendor offer that you recorded.",
      );

    return this.database.transaction(async (transaction) => {
      const tx = createProcurementRepository(transaction);
      const review = await tx.createSubstitutionReview({
        companyId: principal.companyId,
        vendorOfferLineId: offerLineId,
        decision: input.decision,
        reason: input.reason,
        reviewedByUserId: principal.userId,
      });
      if (!review)
        throw new ConflictError(
          "This technical line already has an immutable engineering decision.",
        );
      for (const recipientUserId of new Set([
        context.buyerUserId,
        context.purchaseManagerUserId,
      ])) {
        if (recipientUserId === principal.userId) continue;
        await createNotificationRepository(transaction).create({
          companyId: principal.companyId,
          recipientUserId,
          type: "procurement.substitution_reviewed",
          severity: input.decision === "approved" ? "success" : "warning",
          title: `Technical substitution ${input.decision}`,
          message: `${line.vendorName} · ${line.itemName} was ${input.decision} for ${context.requisitionNumber}.`,
          link: `/procurement/requisitions/${requisitionId}`,
          targetType: "procurement_substitution_review",
          targetId: review.id,
          dedupKey: `procurement-substitution-reviewed:${review.id}:${recipientUserId}`,
        });
      }
      await createAuthRepository(transaction).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: `procurement.substitution_${input.decision}`,
        targetType: "vendor_offer_line",
        targetId: offerLineId,
        requestId,
        metadata: {
          administratorOverride: isAdministrator(principal),
          requisitionId,
          decision: input.decision,
          reason: input.reason,
          vendorName: line.vendorName,
          itemName: line.itemName,
        },
      });
      return review;
    });
  }

  async listAcceptedQuotations(principal: AuthenticatedPrincipal) {
    if (
      !hasPermission(principal, "procurement.sourcing.read") &&
      !hasPermission(principal, "procurement.requisition.create") &&
      !hasPermission(principal, "inventory.request.create") &&
      !isAdministrator(principal)
    ) {
      throw new ForbiddenError();
    }
    return this.database
      .select({
        quotationRevisionId: quotationRevisions.id,
        quotationId: quotations.id,
        quotationNumber: quotations.quotationNumber,
        revisionNumber: quotationRevisions.revisionNumber,
        title: quotationRevisions.title,
        customerName: customers.displayName,
        grandTotal: quotationRevisions.grandTotal,
        currency: quotationRevisions.currency,
        acceptedAt: projectCommercialBaselines.acceptedAt,
        projectId: projects.id,
        projectNumber: projects.projectNumber,
        projectTitle: projects.title,
      })
      .from(projectCommercialBaselines)
      .innerJoin(
        projects,
        eq(projects.id, projectCommercialBaselines.projectId),
      )
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(
        quotationRevisions,
        eq(
          quotationRevisions.id,
          projectCommercialBaselines.quotationRevisionId,
        ),
      )
      .innerJoin(quotations, eq(quotations.id, quotationRevisions.quotationId))
      .where(
        and(
          eq(projectCommercialBaselines.companyId, principal.companyId),
          eq(quotationRevisions.status, "accepted"),
        ),
      )
      .orderBy(desc(projectCommercialBaselines.acceptedAt));
  }

  async getFulfillmentPlan(
    principal: AuthenticatedPrincipal,
    quotationRevisionId: string,
    warehouseId: string,
  ) {
    if (
      !hasPermission(principal, "procurement.sourcing.read") &&
      !hasPermission(principal, "procurement.requisition.create") &&
      !hasPermission(principal, "inventory.request.create") &&
      !isAdministrator(principal)
    ) {
      throw new ForbiddenError();
    }
    return this.database.transaction(async (tx) => {
      const [revision] = await tx
        .select({ revision: quotationRevisions, quotation: quotations })
        .from(quotationRevisions)
        .innerJoin(
          quotations,
          eq(quotations.id, quotationRevisions.quotationId),
        )
        .where(
          and(
            eq(quotationRevisions.companyId, principal.companyId),
            eq(quotationRevisions.id, quotationRevisionId),
            eq(quotationRevisions.status, "accepted"),
          ),
        )
        .limit(1);
      if (!revision)
        throw new NotFoundError("Accepted quotation revision not found.");

      const projectCommercial = await tx
        .select({
          projectId: projectCommercialBaselines.projectId,
          projectTitle: projects.title,
          projectNumber: projects.projectNumber,
        })
        .from(projectCommercialBaselines)
        .innerJoin(
          projects,
          eq(projects.id, projectCommercialBaselines.projectId),
        )
        .where(
          and(
            eq(projectCommercialBaselines.companyId, principal.companyId),
            eq(
              projectCommercialBaselines.quotationRevisionId,
              quotationRevisionId,
            ),
          ),
        )
        .limit(1);
      if (!projectCommercial[0])
        throw new ConflictError(
          "This accepted quotation has no project commercial baseline.",
        );

      const [whRow] = await tx
        .select({
          id: warehouses.id,
          name: warehouses.name,
          code: warehouses.code,
        })
        .from(warehouses)
        .where(
          and(
            eq(warehouses.companyId, principal.companyId),
            eq(warehouses.id, warehouseId),
          ),
        )
        .limit(1);
      if (!whRow) throw new NotFoundError("Warehouse not found.");

      const [mainLocation] = await tx
        .select({ id: stockLocations.id })
        .from(stockLocations)
        .where(
          and(
            eq(stockLocations.companyId, principal.companyId),
            eq(stockLocations.warehouseId, warehouseId),
            eq(stockLocations.locationType, "main"),
          ),
        )
        .limit(1);
      if (!mainLocation)
        throw new NotFoundError("Main warehouse location not found.");

      const lines = await tx
        .select({
          quotationLine: quotationLines,
          boqLine: boqLines,
          brandName: brands.name,
        })
        .from(quotationLines)
        .innerJoin(boqLines, eq(boqLines.id, quotationLines.boqLineId))
        .leftJoin(
          itemBrandOfferings,
          eq(itemBrandOfferings.id, quotationLines.offeringId),
        )
        .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
        .where(
          and(
            eq(quotationLines.companyId, principal.companyId),
            eq(quotationLines.quotationRevisionId, quotationRevisionId),
          ),
        )
        .orderBy(quotationLines.sortOrder, quotationLines.id);

      const planLines = [];
      for (const row of lines) {
        const line = row.quotationLine;
        const boqLine = row.boqLine;
        const quoted = new Decimal(line.quantity);

        const mirRows = await tx
          .select({
            requestedQty: materialIssueRequestLines.requestedQty,
            dispatchedQty: materialIssueRequestLines.dispatchedQty,
          })
          .from(materialIssueRequestLines)
          .innerJoin(
            materialIssueRequests,
            eq(materialIssueRequests.id, materialIssueRequestLines.mirId),
          )
          .where(
            and(
              eq(materialIssueRequestLines.companyId, principal.companyId),
              eq(materialIssueRequestLines.quotationLineId, line.id),
              ne(materialIssueRequests.status, "cancelled"),
            ),
          );
        const alreadyRequested = mirRows.reduce(
          (sum, r) => sum.plus(r.requestedQty),
          new Decimal(0),
        );
        const alreadyDispatched = mirRows.reduce(
          (sum, r) => sum.plus(r.dispatchedQty),
          new Decimal(0),
        );

        const dcRows = await tx
          .select({ qty: deliveryChallanLines.verifiedReceivedQty })
          .from(deliveryChallanLines)
          .innerJoin(
            materialIssueRequestLines,
            eq(materialIssueRequestLines.id, deliveryChallanLines.mirLineId),
          )
          .where(
            and(
              eq(deliveryChallanLines.companyId, principal.companyId),
              eq(deliveryChallanLines.mirLineId, materialIssueRequestLines.id),
              eq(materialIssueRequestLines.quotationLineId, line.id),
            ),
          );
        const verifiedFromDc = dcRows.reduce(
          (sum, r) => sum.plus(r.qty),
          new Decimal(0),
        );

        const poRows = await tx
          .select({
            qty: purchaseOrderLines.projectAllocationQty,
            allocatedReceived: purchaseOrderLines.allocatedReceivedQty,
            shortClosed: purchaseOrderLines.shortClosedQuantity,
            destinationType: purchaseOrderLines.destinationType,
            poStatus: purchaseOrders.status,
          })
          .from(purchaseOrderLines)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
          )
          .where(
            and(
              eq(purchaseOrderLines.companyId, principal.companyId),
              eq(purchaseOrderLines.quotationLineId, line.id),
              inArray(purchaseOrders.status, [
                "approved",
                "issued",
                "partially_delivered",
                "delivered",
                "short_closed",
              ]),
            ),
          );
        const alreadyOrdered = poRows.reduce((sum, r) => {
          const effectiveQty =
            r.poStatus === "short_closed"
              ? Decimal.max(new Decimal(0), new Decimal(r.qty).minus(r.shortClosed ?? "0"))
              : new Decimal(r.qty);
          return sum.plus(effectiveQty);
        }, new Decimal(0));
        const directToSiteVerified = poRows
          .filter((r) => r.destinationType === "direct_to_site")
          .reduce((sum, r) => sum.plus(r.allocatedReceived), new Decimal(0));
        const alreadyVerified = verifiedFromDc.plus(directToSiteVerified);

        const remaining = Decimal.max(
          new Decimal(0),
          quoted.minus(alreadyRequested).minus(alreadyOrdered),
        );

        const balanceRows = await tx
          .select({
            onHand: stockBalances.quantityOnHand,
            reserved: stockBalances.quantityReserved,
          })
          .from(stockBalances)
          .where(
            and(
              eq(stockBalances.companyId, principal.companyId),
              eq(stockBalances.warehouseId, warehouseId),
              eq(stockBalances.locationId, mainLocation.id),
              eq(stockBalances.itemId, boqLine.itemId),
              line.offeringId
                ? eq(stockBalances.brandOfferingId, line.offeringId)
                : isNull(stockBalances.brandOfferingId),
            ),
          )
          .limit(1);
        const onHand = new Decimal(balanceRows[0]?.onHand ?? "0");
        const reserved = new Decimal(balanceRows[0]?.reserved ?? "0");
        const free = Decimal.max(new Decimal(0), onHand.minus(reserved));

        const incomingRows = await tx
          .select({
            qty: purchaseOrderLines.storeReplenishmentQty,
            received: purchaseOrderLines.storeReceivedQty,
          })
          .from(purchaseOrderLines)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
          )
          .where(
            and(
              eq(purchaseOrderLines.companyId, principal.companyId),
              eq(purchaseOrderLines.itemId, boqLine.itemId),
              line.offeringId
                ? eq(purchaseOrderLines.brandOfferingId, line.offeringId)
                : isNull(purchaseOrderLines.brandOfferingId),
              inArray(purchaseOrders.status, [
                "approved",
                "issued",
                "partially_delivered",
              ]),
            ),
          );
        const incoming = incomingRows.reduce(
          (sum, r) =>
            sum.plus(
              Decimal.max(new Decimal(0), new Decimal(r.qty).minus(r.received)),
            ),
          new Decimal(0),
        );

        const threshold = await tx
          .select()
          .from(warehouseItemThresholds)
          .where(
            and(
              eq(warehouseItemThresholds.companyId, principal.companyId),
              eq(warehouseItemThresholds.warehouseId, warehouseId),
              eq(warehouseItemThresholds.itemId, boqLine.itemId),
              line.offeringId
                ? eq(warehouseItemThresholds.brandOfferingId, line.offeringId)
                : isNull(warehouseItemThresholds.brandOfferingId),
            ),
          )
          .limit(1);
        const minStock = new Decimal(threshold[0]?.minStock ?? "0");
        const maxStock = new Decimal(threshold[0]?.maxStock ?? "0");

        const suggestedIssue = Decimal.min(remaining, free);
        const shortage = Decimal.max(
          new Decimal(0),
          remaining.minus(suggestedIssue),
        );
        const projectedStore = free.minus(suggestedIssue).plus(incoming);
        const replenishment =
          maxStock.gt(0) && projectedStore.lt(maxStock)
            ? Decimal.max(new Decimal(0), maxStock.minus(projectedStore))
            : new Decimal(0);

        planLines.push({
          quotationLineId: line.id,
          itemId: boqLine.itemId,
          itemCode: line.itemCodeSnapshot,
          itemName: line.itemNameSnapshot,
          brandOfferingId: line.offeringId,
          brandName: row.brandName ?? null,
          unitId: boqLine.unitId,
          unitSymbol: line.unitSymbolSnapshot,
          quotedQty: quoted.toFixed(4),
          alreadyRequestedFromStoreQty: alreadyRequested.toFixed(4),
          alreadyDispatchedQty: alreadyDispatched.toFixed(4),
          alreadyVerifiedAtSiteQty: alreadyVerified.toFixed(4),
          alreadyOrderedForProjectQty: alreadyOrdered.toFixed(4),
          remainingProjectNeed: remaining.toFixed(4),
          warehouseOnHand: onHand.toFixed(4),
          warehouseReserved: reserved.toFixed(4),
          freeAvailable: free.toFixed(4),
          incomingStoreOpenPoQty: incoming.toFixed(4),
          minStock: minStock.toFixed(4),
          maxStock: maxStock.toFixed(4),
          suggestedStoreIssueQty: suggestedIssue.toFixed(4),
          projectShortageQty: shortage.toFixed(4),
          projectedStoreAfterIssue: projectedStore.toFixed(4),
          suggestedStoreReplenishmentQty: replenishment.toFixed(4),
          suggestedTotalPoQty: shortage.plus(replenishment).toFixed(4),
        });
      }

      return {
        quotationRevisionId,
        quotationNumber: revision.quotation.quotationNumber,
        projectId: projectCommercial[0]!.projectId,
        projectNumber: projectCommercial[0]!.projectNumber,
        projectTitle: projectCommercial[0]!.projectTitle,
        warehouseId,
        warehouseName: whRow.name,
        lines: planLines,
      };
    });
  }

  private async resolveDistinctPurchaseManager(
    tx: DatabaseExecutor,
    companyId: string,
    buyerUserId: string,
    requestedManagerId?: string,
    projectId?: string,
  ): Promise<string> {
    if (requestedManagerId) {
      if (requestedManagerId === buyerUserId) {
        throw validation(
          "The purchase manager must be different from the buyer creating this requisition.",
        );
      }
      const eligible = await createCrmRepository(tx).findEligibleUser(
        companyId,
        requestedManagerId,
        "procurement.comparison.select",
      );
      if (!eligible)
        throw validation(
          "Choose an active employee eligible for purchase comparison selection.",
        );
      return eligible.id;
    }

    const candidates = await createCrmRepository(tx).listEligibleUsers(
      companyId,
      "procurement.comparison.select",
    );
    const distinctCandidates = candidates.filter((c) => c.id !== buyerUserId);
    if (projectId) {
      const memberIds = new Set(
        (
          await createProcurementRepository(tx).listProjectMemberIds(
            companyId,
            projectId,
          )
        ).map((m) => m.userId),
      );
      const projectCandidate = distinctCandidates.find((c) =>
        memberIds.has(c.id),
      );
      if (projectCandidate) return projectCandidate.id;
    }
    if (distinctCandidates[0]) return distinctCandidates[0].id;
    throw validation(
      "An independent Purchase Manager account (different from the buyer) is required to assign a requisition.",
    );
  }

  async createRequisitionFromFulfillmentPlan(
    principal: AuthenticatedPrincipal,
    input: unknown,
    requestId: string,
  ) {
    this.assert(principal, "procurement.requisition.create");
    const parsed = fromFulfillmentPlanSchema.parse(input);
    return this.database.transaction(async (tx) => {
      const [accepted] = await tx
        .select()
        .from(quotationRevisions)
        .where(
          and(
            eq(quotationRevisions.companyId, principal.companyId),
            eq(quotationRevisions.id, parsed.quotationRevisionId),
            eq(quotationRevisions.status, "accepted"),
          ),
        )
        .limit(1);
      if (!accepted)
        throw new ConflictError(
          "Only an Accepted quotation revision can generate a fulfillment requisition.",
        );

      const projectCommercial = await tx
        .select({ projectId: projectCommercialBaselines.projectId })
        .from(projectCommercialBaselines)
        .where(
          and(
            eq(projectCommercialBaselines.companyId, principal.companyId),
            eq(
              projectCommercialBaselines.quotationRevisionId,
              parsed.quotationRevisionId,
            ),
            eq(projectCommercialBaselines.projectId, parsed.projectId),
          ),
        )
        .limit(1);
      if (!projectCommercial[0])
        throw new NotFoundError(
          "Accepted quotation is not linked to this project.",
        );

      const purchaseManagerUserId = await this.resolveDistinctPurchaseManager(
        tx,
        principal.companyId,
        principal.userId,
        parsed.purchaseManagerUserId,
        parsed.projectId,
      );

      const requisitionNumber = await createProcurementRepository(
        tx,
      ).allocateNumber(principal.companyId, "REQUISITION", "REQ", new Date());
      const [requisition] = await tx
        .insert(procurementRequisitions)
        .values({
          companyId: principal.companyId,
          requisitionNumber,
          projectId: parsed.projectId,
          quotationRevisionId: parsed.quotationRevisionId,
          title: parsed.title ?? `Fulfillment requisition ${requisitionNumber}`,
          buyerUserId: principal.userId,
          purchaseManagerUserId,
          requiredBy:
            parsed.requiredBy ??
            new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
          deliveryLocation:
            parsed.deliveryLocation ?? "Warehouse / Project fulfillment",
          notes: parsed.notes,
        })
        .returning();
      if (!requisition)
        throw new ConflictError("Failed to create fulfillment requisition.");

      for (let index = 0; index < parsed.lines.length; index++) {
        const inputLine = parsed.lines[index]!;
        const projectAllocation = new Decimal(inputLine.projectAllocationQty);
        const storeReplenishment = new Decimal(inputLine.storeReplenishmentQty);
        const total = projectAllocation.plus(storeReplenishment);
        if (total.lte(0))
          throw new AppError(
            "VALIDATION_ERROR",
            "Fulfillment line quantity must be greater than zero.",
            422,
          );

        const [match] = await tx
          .select({ line: quotationLines, boqLine: boqLines })
          .from(quotationLines)
          .innerJoin(boqLines, eq(boqLines.id, quotationLines.boqLineId))
          .where(
            and(
              eq(quotationLines.companyId, principal.companyId),
              eq(
                quotationLines.quotationRevisionId,
                parsed.quotationRevisionId,
              ),
              eq(quotationLines.id, inputLine.quotationLineId),
            ),
          )
          .limit(1);
        if (!match)
          throw new AppError(
            "VALIDATION_ERROR",
            "Quotation line not found in fulfillment requisition.",
            422,
          );

        await tx.insert(procurementRequisitionLines).values({
          companyId: principal.companyId,
          requisitionId: requisition.id,
          boqLineId: match.boqLine.id,
          lineNumber: index + 1,
          itemId: match.boqLine.itemId,
          brandOfferingId: match.line.offeringId,
          quotationLineId: match.line.id,
          itemCodeSnapshot: match.line.itemCodeSnapshot,
          itemNameSnapshot: match.line.itemNameSnapshot,
          specificationSnapshot: match.line.specificationSnapshot,
          unitId: match.boqLine.unitId,
          unitSymbolSnapshot: match.line.unitSymbolSnapshot,
          quantity: total.toFixed(4),
          projectAllocationQty: projectAllocation.toFixed(4),
          storeReplenishmentQty: storeReplenishment.toFixed(4),
          destinationType: inputLine.destinationType,
        });
      }

      await createNotificationRepository(tx).create({
        companyId: principal.companyId,
        recipientUserId: purchaseManagerUserId,
        type: "procurement.requisition_created",
        severity: "info",
        title: "Fulfillment requisition assigned",
        message: `${requisition.requisitionNumber} was generated from an accepted quotation fulfillment plan.`,
        link: `/procurement/requisitions/${requisition.id}`,
        targetType: "procurement_requisition",
        targetId: requisition.id,
        dedupKey: `procurement-requisition:${requisition.id}`,
      });

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.fulfillment_requisition_created",
        targetType: "procurement_requisition",
        targetId: requisition.id,
        requestId,
        metadata: {
          quotationRevisionId: parsed.quotationRevisionId,
          projectId: parsed.projectId,
        },
      });
      return {
        requisitionId: requisition.id,
        requisitionNumber: requisition.requisitionNumber,
      };
    });
  }

  async createRequisitionFromSrr(
    principal: AuthenticatedPrincipal,
    input: unknown,
    requestId: string,
  ) {
    this.assert(principal, "procurement.requisition.create");
    const parsed = fromSrrSchema.parse(input);
    return this.database.transaction(async (tx) => {
      const srrRows = await tx
        .select({
          srr: storeReplenishmentRequests,
          itemCode: items.code,
          itemName: items.name,
          unitId: items.unitId,
          unitSymbol: units.symbol,
          warehouseName: warehouses.name,
          brandName: brands.name,
        })
        .from(storeReplenishmentRequests)
        .innerJoin(items, eq(items.id, storeReplenishmentRequests.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .innerJoin(
          warehouses,
          eq(warehouses.id, storeReplenishmentRequests.warehouseId),
        )
        .leftJoin(
          itemBrandOfferings,
          eq(itemBrandOfferings.id, storeReplenishmentRequests.brandOfferingId),
        )
        .leftJoin(brands, eq(brands.id, itemBrandOfferings.brandId))
        .where(
          and(
            eq(storeReplenishmentRequests.companyId, principal.companyId),
            inArray(storeReplenishmentRequests.id, parsed.srrIds),
          ),
        );

      if (srrRows.length !== parsed.srrIds.length) {
        throw new NotFoundError(
          "One or more replenishment requests were not found.",
        );
      }
      if (srrRows.some((r) => r.srr.status !== "open")) {
        throw new ConflictError(
          "Only open replenishment requests can be converted to a requisition.",
        );
      }

      const purchaseManagerUserId = await this.resolveDistinctPurchaseManager(
        tx,
        principal.companyId,
        principal.userId,
        parsed.purchaseManagerUserId,
      );

      const requisitionNumber = await createProcurementRepository(
        tx,
      ).allocateNumber(principal.companyId, "REQUISITION", "REQ", new Date());
      const [requisition] = await tx
        .insert(procurementRequisitions)
        .values({
          companyId: principal.companyId,
          requisitionNumber,
          projectId: null,
          boqRevisionId: null,
          quotationRevisionId: null,
          title: parsed.title ?? `Store Replenishment ${requisitionNumber}`,
          buyerUserId: principal.userId,
          purchaseManagerUserId,
          requiredBy:
            parsed.requiredBy ??
            new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
          deliveryLocation:
            parsed.deliveryLocation ?? srrRows[0]!.warehouseName,
          notes: parsed.notes,
        })
        .returning();
      if (!requisition)
        throw new ConflictError("Failed to create replenishment requisition.");

      await tx.insert(procurementRequisitionLines).values(
        srrRows.map((row, idx) => ({
          companyId: principal.companyId,
          requisitionId: requisition.id,
          boqLineId: null,
          lineNumber: idx + 1,
          itemId: row.srr.itemId,
          brandOfferingId: row.srr.brandOfferingId,
          quotationLineId: null,
          srrId: row.srr.id,
          itemCodeSnapshot: row.itemCode,
          itemNameSnapshot: row.itemName,
          specificationSnapshot: row.brandName
            ? `Approved Make: ${row.brandName}`
            : "Standard Store Replenishment",
          unitId: row.unitId,
          unitSymbolSnapshot: row.unitSymbol,
          quantity: row.srr.requestedQty,
          projectAllocationQty: "0.0000",
          storeReplenishmentQty: row.srr.requestedQty,
          destinationType: "warehouse" as const,
        })),
      );

      await createAuthRepository(tx).appendAuditEvent({
        companyId: principal.companyId,
        actorUserId: principal.userId,
        action: "procurement.srr_requisition_created",
        targetType: "procurement_requisition",
        targetId: requisition.id,
        requestId,
        metadata: { srrIds: parsed.srrIds },
      });

      return {
        requisitionId: requisition.id,
        requisitionNumber: requisition.requisitionNumber,
      };
    });
  }
}

export const procurementService = new ProcurementService();
