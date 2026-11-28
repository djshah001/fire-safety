import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/api/client";
import {
  createPurchaseOrderFromRequisition,
  createPurchaseOrdersFromAwards,
} from "@/api/purchaseOrders";
import {
  createProcurementRfq,
  procurementWorkspaceQuery,
  recordVendorOffer,
  selectSplitAwards,
  selectVendorOffer,
  type Equivalence,
  type ProcurementWorkspace,
} from "@/api/procurement";
import { PriceInquirySheet } from "./PriceInquirySheet";
import { PriceComparisonSheet } from "./PriceComparisonSheet";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Modal = "rfq" | "offer" | "select";

function amount(currency: string, value: string) {
  return `${currency} ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RequisitionWorkspacePage() {
  const { requisitionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useQuery(procurementWorkspaceQuery(requisitionId));
  const [modal, setModal] = useState<Modal>();
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [equivalence, setEquivalence] = useState<Record<string, Equivalence>>(
    {},
  );
  const [selectedBrands, setSelectedBrands] = useState<Record<string, string>>({});
  const [customBrands, setCustomBrands] = useState<Record<string, string>>({});
  const [priceInquiryOpen, setPriceInquiryOpen] = useState(false);
  const [comparisonInquiryId, setComparisonInquiryId] = useState<string | null>(
    null,
  );
  const [generatePoOpen, setGeneratePoOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"single" | "split">("single");
  const [splitAwardsMap, setSplitAwardsMap] = useState<
    Record<string, { offerId: string; offerLineId: string; reason: string }>
  >({});

  const createSplitPosMutation = useMutation({
    mutationFn: async (vendorIdToOrder?: string) => {
      if (!requisitionId) throw new Error("Requisition ID missing");
      return createPurchaseOrdersFromAwards({
        requisitionId,
        vendorId: vendorIdToOrder,
      });
    },
    onSuccess: async (pos) => {
      await invalidate();
      if (pos.length === 1) {
        toast.success(`Purchase Order ${pos[0]!.poNumber} created for ${pos[0]!.vendorName}.`);
        navigate(`/procurement/purchase-orders/${pos[0]!.id}`);
      } else {
        toast.success(`Generated ${pos.length} Purchase Orders across awarded vendors.`);
      }
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const createPoMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!requisitionId) throw new Error("Requisition ID missing");
      return createPurchaseOrderFromRequisition({
        requisitionId,
        title: String(form.get("title") || "").trim() || undefined,
        paymentTerms: String(form.get("paymentTerms") || "").trim() || undefined,
        deliveryTerms: String(form.get("deliveryTerms") || "").trim() || undefined,
        deliveryLocation: String(form.get("deliveryLocation") || "").trim() || undefined,
        deliveryDueDate: String(form.get("deliveryDueDate") || "").trim() || undefined,
        billingAddress: String(form.get("billingAddress") || "").trim() || undefined,
        shippingAddress: String(form.get("shippingAddress") || "").trim() || undefined,
        notes: String(form.get("notes") || "").trim() || undefined,
      });
    },
    onSuccess: (po) => {
      toast.success(`Purchase Order ${po.poNumber} created.`);
      navigate(`/procurement/purchase-orders/${po.id}`);
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["procurement", "requisitions", requisitionId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["procurement", "requisitions"],
      }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };
  const close = () => {
    setModal(undefined);
    setVendorIds([]);
    setVendorId("");
    setOfferId("");
    setEquivalence({});
    setSelectedBrands({});
    setCustomBrands({});
  };

  const action = useMutation({
    mutationFn: async (form: FormData) => {
      if (!requisitionId || !workspace.data || !modal)
        throw new Error("Procurement action unavailable.");
      const data = workspace.data;
      if (modal === "rfq")
        return createProcurementRfq(requisitionId, {
          vendorIds,
          responseDueDate: String(form.get("responseDueDate")),
          commercialTerms: String(form.get("commercialTerms")),
          expectedVersion: data.requisition.rowVersion,
        });
      if (modal === "offer")
        return recordVendorOffer(requisitionId, {
          vendorId,
          vendorReference: String(form.get("vendorReference")),
          currency: String(form.get("currency")),
          taxBasis: String(form.get("taxBasis")),
          freightAmount: String(form.get("freightAmount")),
          leadTimeDays: form.get("leadTimeDays")
            ? Number(form.get("leadTimeDays"))
            : undefined,
          paymentTerms: String(form.get("paymentTerms")),
          warranty: String(form.get("warranty")),
          validUntil: String(form.get("validUntil") ?? "") || undefined,
          lines: data.rfqLines.map((line) => {
            const rawBrand = form.get(`brand:${line.id}`);
            const brandOffered =
              selectedBrands[line.id] === "__other__"
                ? String(customBrands[line.id] || form.get(`customBrand:${line.id}`) || "").trim()
                : String(rawBrand || selectedBrands[line.id] || (line.eligibleBrands?.[0]?.name ?? "")).trim();
            return {
              rfqLineId: line.id,
              unitRate: String(form.get(`rate:${line.id}`)),
              brandOffered,
              specificationOffered: String(form.get(`specification:${line.id}`)),
              equivalence: equivalence[line.id] ?? "unknown",
              deviationNotes:
                String(form.get(`deviation:${line.id}`) ?? "").trim() ||
                undefined,
            };
          }),
        });
      if (!data.comparison) throw new Error("Comparison unavailable.");
      if (selectionMode === "split") {
        const awards = data.rfqLines.map((rfqLine) => {
          const picked = splitAwardsMap[rfqLine.id];
          if (!picked?.offerId || !picked?.offerLineId) {
            throw new Error(`Choose a winning vendor for line #${rfqLine.lineNumber}.`);
          }
          return {
            rfqLineId: rfqLine.id,
            winningOfferId: picked.offerId,
            winningOfferLineId: picked.offerLineId,
            selectionReason: picked.reason?.trim() || undefined,
          };
        });
        return selectSplitAwards(requisitionId, {
          awards,
          selectionReason: String(form.get("selectionReason") ?? "").trim() || undefined,
          singleSourceExceptionReason:
            String(form.get("singleSourceExceptionReason") ?? "").trim() ||
            undefined,
          expectedVersion: data.comparison.rowVersion,
        });
      }
      return selectVendorOffer(requisitionId, {
        offerId,
        selectionReason: String(form.get("selectionReason")),
        singleSourceExceptionReason:
          String(form.get("singleSourceExceptionReason") ?? "").trim() ||
          undefined,
        expectedVersion: data.comparison.rowVersion,
      });
    },
    async onSuccess() {
      const message =
        modal === "rfq"
          ? "Internal RFQ workspace created."
          : modal === "offer"
            ? "Vendor offer recorded."
            : "Supplier selected with an audit trail.";
      await invalidate();
      close();
      toast.success(message);
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  if (workspace.isPending)
    return (
      <main className="mx-auto max-w-7xl space-y-5 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-36" />
        <Skeleton className="h-96" />
      </main>
    );
  if (workspace.isError)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost">
          <Link to="/procurement/requisitions">
            <ArrowLeft />
            Requisitions
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Requisition unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              workspace.error,
              "This requisition is unavailable or outside your assignment.",
            )}
          </AlertDescription>
        </Alert>
      </main>
    );

  const data = workspace.data;
  const {
    requisition,
    lines,
    rfq,
    offers,
    comparison,
    selection,
    lineAwards,
    capabilities,
  } = data;
  const selectedOffer = offers.find(
    (offer) => offer.id === selection?.selectedOfferId,
  );
  const canSelect =
    capabilities.canSelect &&
    comparison?.status === "open" &&
    offers.length > 0;
  const openOffer = () => {
    setVendorId(
      data.invitedVendors.find(
        (vendor) => !offers.some((offer) => offer.vendorId === vendor.id),
      )?.id ?? "",
    );
    setEquivalence(
      Object.fromEntries(data.rfqLines.map((line) => [line.id, "equivalent"])),
    );
    setModal("offer");
  };

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Button asChild className="-ml-2" variant="ghost">
        <Link to="/procurement/requisitions">
          <ArrowLeft />
          Requisitions
        </Link>
      </Button>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            {requisition.projectNumber} · approved BOQ demand
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {requisition.requisitionNumber}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {requisition.title} · {requisition.projectTitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPriceInquiryOpen(true)}>
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Inquire Vendor Prices
          </Button>
          {capabilities.canManageRfq && !rfq && (
            <Button onClick={() => setModal("rfq")}>
              <Send />
              Create RFQ
            </Button>
          )}
          {capabilities.canRecordOffer &&
            rfq?.status === "open" &&
            data.invitedVendors.some(
              (vendor) => !offers.some((offer) => offer.vendorId === vendor.id),
            ) && (
              <Button onClick={openOffer}>
                <Plus />
                Record offer
              </Button>
            )}
          {canSelect && (
            <Button
              onClick={() => {
                setSelectionMode("single");
                setOfferId(offers[0]!.id);
                const defaults: Record<
                  string,
                  { offerId: string; offerLineId: string; reason: string }
                > = {};
                data.rfqLines.forEach((rl) => {
                  const candidateOffer = offers.find((o) =>
                    o.lines.some((l) => l.rfqLineId === rl.id),
                  );
                  const candidateLine = candidateOffer?.lines.find(
                    (l) => l.rfqLineId === rl.id,
                  );
                  if (candidateOffer && candidateLine) {
                    defaults[rl.id] = {
                      offerId: candidateOffer.id,
                      offerLineId: candidateLine.id,
                      reason: "",
                    };
                  }
                });
                setSplitAwardsMap(defaults);
                setModal("select");
              }}
            >
              <CheckCircle2 />
              Select supplier
            </Button>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="State"
          value={<StatusBadge status={requisition.status} />}
        />
        <Metric
          label="Required by"
          value={new Date(
            `${requisition.requiredBy}T00:00:00`,
          ).toLocaleDateString()}
        />
        <Metric label="Assigned buyer" value={requisition.buyerName} />
        <Metric
          label="Purchase manager"
          value={requisition.purchaseManagerName}
        />
      </div>
      <Alert className="mt-6">
        <CircleAlert />
        <AlertTitle>Controlled sourcing workspace</AlertTitle>
        <AlertDescription>
          Record internal RFQs, import WhatsApp price inquiry responses, and award whole offers or line-level splits. Technical substitution reviews on alternative makes are advisory and do not block supplier selection.
        </AlertDescription>
      </Alert>
      {data.priceInquiries && data.priceInquiries.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-4 py-2.5 text-xs">
          <span className="font-semibold text-foreground">Linked Price Inquiries:</span>
          {data.priceInquiries.map((inq) => (
            <Button
              key={inq.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setComparisonInquiryId(inq.id)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="font-mono">{inq.inquiryCode}</span>
              <span>— {inq.title}</span>
            </Button>
          ))}
        </div>
      )}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Approved demand</CardTitle>
                <CardDescription>
                  Exact project BOQ line snapshots and bounded requested
                  quantities.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPriceInquiryOpen(true)}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Inquire Vendor Prices
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Item / specification</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.lineNumber}</TableCell>
                        <TableCell className="min-w-72">
                          <p className="font-medium">{line.itemNameSnapshot}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.itemCodeSnapshot} ·{" "}
                            {line.specificationSnapshot}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.quantity} {line.unitSymbolSnapshot}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {rfq ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{rfq.rfqNumber}</CardTitle>
                      <StatusBadge status={rfq.status} />
                    </div>
                    <CardDescription className="mt-1">
                      Responses due{" "}
                      {new Date(
                        `${rfq.responseDueDate}T00:00:00`,
                      ).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {data.invitedVendors.length} invited
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Invited vendors
                  </p>
                  <p className="mt-1 text-sm">
                    {data.invitedVendors
                      .map((vendor) => `${vendor.name} (${vendor.code})`)
                      .join(", ")}
                  </p>
                </div>
                <TextBlock
                  label="Internal commercial terms"
                  value={rfq.commercialTerms}
                />
                <p className="text-xs text-muted-foreground">
                  External delivery: not configured or claimed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-14 text-center text-muted-foreground">
                <Send className="mx-auto mb-3" />
                The assigned buyer has not created the internal RFQ.
              </CardContent>
            </Card>
          )}
          {rfq && (
            <Card>
              <CardHeader>
                <CardTitle>Commercial comparison</CardTitle>
                <CardDescription>
                  {offers.length} submitted offer
                  {offers.length === 1 ? "" : "s"}. Two distinct offers are the
                  default; a purchase-manager exception is required below two.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {offers.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    No vendor offers recorded.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {offers.map((offer) => {
                      const technicalLines = offer.lines.filter(
                        (line) => line.equivalence !== "equivalent",
                      );
                      return (
                        <div
                          className={`rounded-xl border p-4 ${selection?.selectedOfferId === offer.id ? "border-primary bg-primary/5" : ""}`}
                          key={offer.id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold">
                                  {offer.vendorName}
                                </h3>
                                <Badge variant="outline">
                                  {offer.vendorReference}
                                </Badge>
                                {selection?.selectedOfferId === offer.id && (
                                  <Badge>Selected</Badge>
                                )}
                                {technicalLines.length > 0 && (
                                  <Badge variant="outline">
                                    Alternative offered
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {offer.vendorCode} · recorded{" "}
                                {new Date(offer.submittedAt).toLocaleString()}
                              </p>
                            </div>
                            <p className="text-xl font-semibold tabular-nums">
                              {amount(offer.currency, offer.total)}
                            </p>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <SmallMetric
                              label="Subtotal"
                              value={amount(offer.currency, offer.subtotal)}
                            />
                            <SmallMetric
                              label="Freight"
                              value={amount(
                                offer.currency,
                                offer.freightAmount,
                              )}
                            />
                            <SmallMetric
                              label="Lead time"
                              value={
                                offer.leadTimeDays === null
                                  ? "Not stated"
                                  : `${offer.leadTimeDays} days`
                              }
                            />
                            <SmallMetric
                              label="Validity"
                              value={
                                offer.validUntil
                                  ? new Date(
                                      `${offer.validUntil}T00:00:00`,
                                    ).toLocaleDateString()
                                  : "Not stated"
                              }
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <TextBlock
                              label="Tax basis"
                              value={offer.taxBasis}
                            />
                            <TextBlock
                              label="Payment"
                              value={offer.paymentTerms}
                            />
                            <TextBlock
                              label="Warranty"
                              value={offer.warranty}
                            />
                          </div>
                          <div className="mt-4 overflow-x-auto rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>#</TableHead>
                                  <TableHead>Make / specification</TableHead>
                                  <TableHead>Technical basis</TableHead>
                                  <TableHead className="text-right">
                                    Rate
                                  </TableHead>
                                  <TableHead className="text-right">
                                    Line total
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {offer.lines.map((line) => (
                                  <TableRow key={line.id}>
                                    <TableCell>{line.lineNumber}</TableCell>
                                    <TableCell className="min-w-64">
                                      <p className="font-medium">
                                        {line.brandOffered}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {line.specificationOffered}
                                      </p>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-1">
                                        <StatusBadge
                                          status={line.equivalence}
                                        />
                                        {line.substitutionReview && (
                                          <StatusBadge
                                            status={
                                              line.substitutionReview.decision
                                            }
                                          />
                                        )}
                                      </div>
                                      {line.deviationNotes && (
                                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                          {line.deviationNotes}
                                        </p>
                                      )}
                                      {line.substitutionReview && (
                                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                          {
                                            line.substitutionReview
                                              .reviewedByName
                                          }
                                          : {line.substitutionReview.reason}
                                        </p>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {amount(offer.currency, line.unitRate)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {amount(offer.currency, line.lineTotal)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{requisition.deliveryLocation}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {requisition.notes || "No internal notes."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selection decision</CardTitle>
            </CardHeader>
            <CardContent>
              {lineAwards && lineAwards.length > 0 ? (
                (() => {
                  const vendorGroups = Array.from(
                    lineAwards
                      .reduce((acc, award) => {
                        const existing = acc.get(award.winningVendorId);
                        if (existing) {
                          existing.awards.push(award);
                        } else {
                          acc.set(award.winningVendorId, {
                            vendorId: award.winningVendorId,
                            vendorName: award.vendorName,
                            vendorCode: award.vendorCode,
                            generatedPoId: award.generatedPoId,
                            poNumber: award.poNumber,
                            awards: [award],
                          });
                        }
                        return acc;
                      }, new Map<
                        string,
                        {
                          vendorId: string;
                          vendorName: string;
                          vendorCode: string;
                          generatedPoId: string | null;
                          poNumber: string | null;
                          awards: typeof lineAwards;
                        }
                      >())
                      .values(),
                  );
                  const pendingVendors = vendorGroups.filter(
                    (g) => !g.generatedPoId,
                  );

                  return (
                    <div className="space-y-3">
                      <Badge>
                        {vendorGroups.length > 1
                          ? `Split Award (${vendorGroups.length} Vendors)`
                          : "Line Award Selected"}
                      </Badge>
                      {selection?.selectionReason && (
                        <TextBlock
                          label="Reason"
                          value={selection.selectionReason}
                        />
                      )}
                      {selection?.singleSourceExceptionReason && (
                        <TextBlock
                          label="Single-source exception"
                          value={selection.singleSourceExceptionReason}
                        />
                      )}
                      <div className="space-y-2 pt-1">
                        {vendorGroups.map((group) => (
                          <div
                            key={group.vendorId}
                            className="rounded-lg border p-2.5 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm">
                                {group.vendorName}
                              </span>
                              <Badge variant="outline">
                                {group.awards.length} line
                                {group.awards.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                            {group.generatedPoId && group.poNumber ? (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="w-full"
                              >
                                <Link
                                  to={`/procurement/purchase-orders/${group.generatedPoId}`}
                                >
                                  <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                                  Open PO {group.poNumber}
                                </Link>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                className="w-full"
                                disabled={createSplitPosMutation.isPending}
                                onClick={() =>
                                  createSplitPosMutation.mutate(group.vendorId)
                                }
                              >
                                <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                                Generate PO for {group.vendorName}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      {pendingVendors.length > 1 && (
                        <Button
                          type="button"
                          className="w-full"
                          disabled={createSplitPosMutation.isPending}
                          onClick={() => createSplitPosMutation.mutate(undefined)}
                        >
                          <FileCheck2 className="h-4 w-4 mr-1.5" />
                          {createSplitPosMutation.isPending
                            ? "Generating POs..."
                            : `Generate All ${pendingVendors.length} POs`}
                        </Button>
                      )}
                    </div>
                  );
                })()
              ) : selection && selectedOffer ? (
                <div className="space-y-3">
                  <Badge>Selected</Badge>
                  <p className="font-semibold">{selectedOffer.vendorName}</p>
                  <TextBlock label="Reason" value={selection.selectionReason} />
                  {selection.singleSourceExceptionReason && (
                    <TextBlock
                      label="Single-source exception"
                      value={selection.singleSourceExceptionReason}
                    />
                  )}
                  {data.generatedPurchaseOrders &&
                  data.generatedPurchaseOrders.length > 0 ? (
                    <div className="space-y-2 pt-2">
                      {data.generatedPurchaseOrders.map((po) => (
                        <Button
                          key={po.id}
                          asChild
                          variant="outline"
                          className="w-full"
                        >
                          <Link to={`/procurement/purchase-orders/${po.id}`}>
                            <FileCheck2 className="h-4 w-4 mr-1.5" />
                            Open PO {po.poNumber}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="pt-2">
                      <Button
                        className="w-full"
                        onClick={() => setGeneratePoOpen(true)}
                      >
                        <FileCheck2 className="h-4 w-4 mr-1.5" />
                        Generate Purchase Order
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No supplier has been selected. Lowest price is not
                  automatically preferred; the manager must record the basis.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
      <ActionDialog
        modal={modal}
        data={data}
        vendorIds={vendorIds}
        setVendorIds={setVendorIds}
        vendorId={vendorId}
        setVendorId={setVendorId}
        offerId={offerId}
        setOfferId={setOfferId}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        splitAwardsMap={splitAwardsMap}
        setSplitAwardsMap={setSplitAwardsMap}
        equivalence={equivalence}
        setEquivalence={setEquivalence}
        selectedBrands={selectedBrands}
        setSelectedBrands={setSelectedBrands}
        customBrands={customBrands}
        setCustomBrands={setCustomBrands}
        busy={action.isPending}
        error={action.isError ? getApiErrorMessage(action.error) : undefined}
        onClose={close}
        onSubmit={(form) => action.mutate(form)}
      />
      <PriceInquirySheet
        open={priceInquiryOpen}
        onOpenChange={setPriceInquiryOpen}
        requisitionId={requisitionId}
        initialItems={lines.map((l) => {
          const matchingRfqLine = data.rfqLines?.find(
            (rl) => rl.requisitionLineId === l.id || rl.itemId === l.itemId,
          );
          return {
            itemId: l.itemId,
            itemName: l.itemNameSnapshot,
            itemCode: l.itemCodeSnapshot || undefined,
            quantity: l.quantity,
            unit: l.unitSymbolSnapshot,
            specification: l.specificationSnapshot || undefined,
            eligibleBrands: matchingRfqLine?.eligibleBrands,
          };
        })}
        defaultTitle={`Price inquiry for ${requisition.requisitionNumber} - ${requisition.title}`}
        onInquiryCreated={(inquiry) => {
          setPriceInquiryOpen(false);
          setComparisonInquiryId(inquiry.id);
        }}
      />
      <PriceComparisonSheet
        inquiryId={comparisonInquiryId}
        open={Boolean(comparisonInquiryId)}
        onOpenChange={(open) => {
          if (!open) setComparisonInquiryId(null);
        }}
        requisitionId={requisitionId}
        rfqStatus={rfq?.status}
        onConverted={invalidate}
      />
      <Dialog open={generatePoOpen} onOpenChange={setGeneratePoOpen}>
        <DialogContent className="max-w-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createPoMutation.mutate(new FormData(e.currentTarget));
            }}
          >
            <DialogHeader>
              <DialogTitle>Generate Purchase Order</DialogTitle>
              <DialogDescription>
                Create an authoritative PO draft from the selected vendor offer (
                {selectedOffer?.vendorName}).
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="po-title">PO Title</Label>
                <Input
                  id="po-title"
                  name="title"
                  defaultValue={`PO for ${requisition.title} - ${selectedOffer?.vendorName}`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="po-payment">Payment Terms</Label>
                  <Input
                    id="po-payment"
                    name="paymentTerms"
                    defaultValue={selectedOffer?.paymentTerms ?? "30 days net"}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="po-delivery-terms">Delivery Terms</Label>
                  <Input
                    id="po-delivery-terms"
                    name="deliveryTerms"
                    defaultValue="Ex-works / Site Delivery"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="po-location">Delivery Location</Label>
                  <Input
                    id="po-location"
                    name="deliveryLocation"
                    defaultValue={requisition.deliveryLocation}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="po-due-date">Delivery Due Date</Label>
                  <Input
                    id="po-due-date"
                    name="deliveryDueDate"
                    type="date"
                    defaultValue={requisition.requiredBy}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="po-shipping">Shipping Address</Label>
                <Textarea
                  id="po-shipping"
                  name="shippingAddress"
                  defaultValue={requisition.deliveryLocation}
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="po-notes">Notes / Special Instructions</Label>
                <Textarea
                  id="po-notes"
                  name="notes"
                  placeholder="Add any specific instructions for vendor or receiving team"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGeneratePoOpen(false)}
                disabled={createPoMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createPoMutation.isPending}>
                {createPoMutation.isPending
                  ? "Generating..."
                  : "Generate Purchase Order"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ActionDialog({
  modal,
  data,
  vendorIds,
  setVendorIds,
  vendorId,
  setVendorId,
  offerId,
  setOfferId,
  selectionMode,
  setSelectionMode,
  splitAwardsMap,
  setSplitAwardsMap,
  equivalence,
  setEquivalence,
  selectedBrands,
  setSelectedBrands,
  customBrands,
  setCustomBrands,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  modal?: Modal;
  data: ProcurementWorkspace;
  vendorIds: string[];
  setVendorIds: (ids: string[]) => void;
  vendorId: string;
  setVendorId: (id: string) => void;
  offerId: string;
  setOfferId: (id: string) => void;
  selectionMode: "single" | "split";
  setSelectionMode: (mode: "single" | "split") => void;
  splitAwardsMap: Record<
    string,
    { offerId: string; offerLineId: string; reason: string }
  >;
  setSplitAwardsMap: React.Dispatch<
    React.SetStateAction<
      Record<string, { offerId: string; offerLineId: string; reason: string }>
    >
  >;
  equivalence: Record<string, Equivalence>;
  setEquivalence: React.Dispatch<
    React.SetStateAction<Record<string, Equivalence>>
  >;
  selectedBrands: Record<string, string>;
  setSelectedBrands: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  customBrands: Record<string, string>;
  setCustomBrands: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const availableVendors = data.invitedVendors.filter(
    (vendor) => !data.offers.some((offer) => offer.vendorId === vendor.id),
  );
  return (
    <Dialog
      open={Boolean(modal)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {modal === "rfq"
                ? "Create internal RFQ"
                : modal === "offer"
                  ? "Record submitted vendor offer"
                  : "Select supplier"}
            </DialogTitle>
            <DialogDescription>
              {modal === "rfq"
                ? "Choose active vendors and capture internal terms. This action does not send an external message."
                : modal === "offer"
                  ? "Normalize the complete offer across currency, freight, tax basis, lead time, make, specification, payment, and warranty."
                  : "Selection needs an explicit reason. Lowest price is not mandatory."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 space-y-5">
            {modal === "rfq" && (
              <>
                <div className="space-y-2">
                  <Label>Invite active vendors</Label>
                  <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                    {data.activeVendors.map((vendor) => (
                      <label
                        className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"
                        key={vendor.id}
                      >
                        <Checkbox
                          checked={vendorIds.includes(vendor.id)}
                          onCheckedChange={(checked) =>
                            setVendorIds(
                              checked === true
                                ? [...vendorIds, vendor.id]
                                : vendorIds.filter((id) => id !== vendor.id),
                            )
                          }
                        />
                        <span className="text-sm">
                          {vendor.name}{" "}
                          <span className="text-muted-foreground">
                            ({vendor.code})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <Field
                  label="Response due"
                  name="responseDueDate"
                  type="date"
                  required
                />
                <TextField
                  label="Internal commercial terms"
                  name="commercialTerms"
                  required
                />
              </>
            )}
            {modal === "offer" && (
              <>
                <SelectField
                  label="Invited vendor"
                  value={vendorId}
                  onChange={setVendorId}
                  items={availableVendors.map((vendor) => ({
                    value: vendor.id,
                    label: `${vendor.name} (${vendor.code})`,
                  }))}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Vendor reference"
                    name="vendorReference"
                    required
                  />
                  <Field
                    label="Currency"
                    name="currency"
                    required
                    defaultValue="INR"
                    maxLength={3}
                  />
                  <Field
                    label="Freight amount"
                    name="freightAmount"
                    required
                    inputMode="decimal"
                    defaultValue="0.00"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Lead time (days)"
                    name="leadTimeDays"
                    type="number"
                    min={0}
                  />
                  <Field
                    label="Valid until (optional)"
                    name="validUntil"
                    type="date"
                  />
                </div>
                <TextField label="Tax basis" name="taxBasis" required />
                <TextField label="Payment terms" name="paymentTerms" required />
                <TextField label="Warranty" name="warranty" required />
                <div>
                  <Label>Offer lines</Label>
                  <div className="mt-2 space-y-4">
                    {data.rfqLines.map((line) => (
                      <Card key={line.id}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            {line.lineNumber}. {line.itemNameSnapshot}
                          </CardTitle>
                          <CardDescription>
                            {line.quantity} {line.unitSymbolSnapshot} ·{" "}
                            {line.specificationSnapshot}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                          <Field
                            label="Unit rate"
                            name={`rate:${line.id}`}
                            inputMode="decimal"
                            required
                          />
                          {line.eligibleBrands && line.eligibleBrands.length > 0 ? (
                            <div className="space-y-2">
                              <SelectField
                                label="Brand / make (from catalogue)"
                                value={
                                  selectedBrands[line.id] ??
                                  line.eligibleBrands.find((b) => b.isPreferred)?.name ??
                                  line.eligibleBrands[0]?.name ??
                                  ""
                                }
                                onChange={(val) => {
                                  setSelectedBrands((prev) => ({ ...prev, [line.id]: val }));
                                  if (val === "__other__") {
                                    setEquivalence((prev) => ({ ...prev, [line.id]: "deviation" }));
                                  } else {
                                    setEquivalence((prev) => ({ ...prev, [line.id]: "equivalent" }));
                                  }
                                }}
                                items={[
                                  ...line.eligibleBrands.map((b) => ({
                                    value: b.name,
                                    label: `${b.name}${b.model ? ` · ${b.model}` : ""}${b.isPreferred ? " ★ (Preferred)" : ""}`,
                                  })),
                                  { value: "__other__", label: "Other / Alternative brand..." },
                                ]}
                              />
                              {selectedBrands[line.id] === "__other__" && (
                                <Field
                                  label="Custom brand / make"
                                  name={`customBrand:${line.id}`}
                                  value={customBrands[line.id] ?? ""}
                                  onChange={(e) =>
                                    setCustomBrands((prev) => ({
                                      ...prev,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. Alternative Manufacturer"
                                  required
                                />
                              )}
                              <input
                                type="hidden"
                                name={`brand:${line.id}`}
                                value={
                                  selectedBrands[line.id] === "__other__"
                                    ? (customBrands[line.id] ?? "")
                                    : (selectedBrands[line.id] ??
                                       line.eligibleBrands.find((b) => b.isPreferred)?.name ??
                                       line.eligibleBrands[0]?.name ??
                                       "")
                                }
                              />
                            </div>
                          ) : (
                            <Field
                              label="Brand / make"
                              name={`brand:${line.id}`}
                              required
                            />
                          )}
                          <div className="sm:col-span-2">
                            <TextField
                              label="Offered specification"
                              name={`specification:${line.id}`}
                              required
                              defaultValue={line.specificationSnapshot}
                            />
                          </div>
                          <SelectField
                            label="Technical equivalence"
                            value={equivalence[line.id] ?? "unknown"}
                            onChange={(value) =>
                              setEquivalence((current) => ({
                                ...current,
                                [line.id]: value as Equivalence,
                              }))
                            }
                            items={[
                              { value: "equivalent", label: "Equivalent" },
                              { value: "deviation", label: "Deviation" },
                              { value: "unknown", label: "Unknown" },
                            ]}
                          />
                          <Field
                            label="Deviation notes"
                            name={`deviation:${line.id}`}
                            required={equivalence[line.id] === "deviation"}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}
            {modal === "select" && (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={selectionMode === "single" ? "default" : "outline"}
                    onClick={() => setSelectionMode("single")}
                  >
                    Award Whole Offer (1 Vendor)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={selectionMode === "split" ? "default" : "outline"}
                    onClick={() => setSelectionMode("split")}
                  >
                    Split Award by Line Item
                  </Button>
                </div>
                {selectionMode === "single" ? (
                  <SelectField
                    label="Submitted offer"
                    value={offerId}
                    onChange={setOfferId}
                    items={data.offers.map((offer) => ({
                      value: offer.id,
                      label: `${offer.vendorName} · ${amount(offer.currency, offer.total)}`,
                    }))}
                  />
                ) : (
                  <div className="space-y-3">
                    <SelectField
                      label="Quick fill: award all lines to offer"
                      value=""
                      onChange={(chosenOfferId) => {
                        const pickedOffer = data.offers.find(
                          (o) => o.id === chosenOfferId,
                        );
                        if (!pickedOffer) return;
                        setSplitAwardsMap((prev) => {
                          const next = { ...prev };
                          data.rfqLines.forEach((rl) => {
                            const match = pickedOffer.lines.find(
                              (l) => l.rfqLineId === rl.id,
                            );
                            if (match) {
                              next[rl.id] = {
                                offerId: pickedOffer.id,
                                offerLineId: match.id,
                                reason: prev[rl.id]?.reason ?? "",
                              };
                            }
                          });
                          return next;
                        });
                      }}
                      items={data.offers.map((offer) => ({
                        value: offer.id,
                        label: `Fill with ${offer.vendorName} (${offer.lines.length} lines)`,
                      }))}
                    />
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {data.rfqLines.map((rl) => {
                        const options = data.offers
                          .map((o) => {
                            const ol = o.lines.find((l) => l.rfqLineId === rl.id);
                            return ol ? { offer: o, offerLine: ol } : null;
                          })
                          .filter(
                            (
                              x,
                            ): x is {
                              offer: ProcurementWorkspace["offers"][number];
                              offerLine: ProcurementWorkspace["offers"][number]["lines"][number];
                            } => Boolean(x),
                          );
                        const selected = splitAwardsMap[rl.id];
                        return (
                          <div
                            key={rl.id}
                            className="rounded-lg border p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-semibold">
                                #{rl.lineNumber} · {rl.itemNameSnapshot}
                              </span>
                              <span className="text-muted-foreground font-mono">
                                {rl.quantity} {rl.unitSymbolSnapshot}
                              </span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <SelectField
                                label="Winning Vendor Quote"
                                value={selected?.offerLineId ?? ""}
                                onChange={(offerLineId) => {
                                  const match = options.find(
                                    (opt) => opt.offerLine.id === offerLineId,
                                  );
                                  if (!match) return;
                                  setSplitAwardsMap((prev) => ({
                                    ...prev,
                                    [rl.id]: {
                                      offerId: match.offer.id,
                                      offerLineId: match.offerLine.id,
                                      reason: prev[rl.id]?.reason ?? "",
                                    },
                                  }));
                                }}
                                items={options.map(({ offer, offerLine }) => ({
                                  value: offerLine.id,
                                  label: `${offer.vendorName} · ${amount(offer.currency, offerLine.unitRate)} (${offerLine.brandOffered})`,
                                }))}
                              />
                              <div className="space-y-1.5">
                                <Label className="text-xs">
                                  Line Reason (Optional)
                                </Label>
                                <Input
                                  placeholder="Overrides overall selection reason"
                                  value={selected?.reason ?? ""}
                                  onChange={(e) =>
                                    setSplitAwardsMap((prev) => ({
                                      ...prev,
                                      [rl.id]: {
                                        offerId: prev[rl.id]?.offerId ?? "",
                                        offerLineId:
                                          prev[rl.id]?.offerLineId ?? "",
                                        reason: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <TextField
                  label="Selection reason"
                  name="selectionReason"
                  required
                />
                {(data.offers.length < 2 ||
                  (selectionMode === "split" &&
                    data.rfqLines.some(
                      (rl) =>
                        data.offers.filter((o) =>
                          o.lines.some((l) => l.rfqLineId === rl.id),
                        ).length < 2,
                    ))) && (
                  <>
                    <Alert variant="destructive">
                      <AlertTitle>Single-source exception required</AlertTitle>
                      <AlertDescription>
                        The default is at least two submitted vendor offers per
                        awarded scope. Explain why selection may proceed with
                        fewer.
                      </AlertDescription>
                    </Alert>
                    <TextField
                      label="Purchase-manager exception reason"
                      name="singleSourceExceptionReason"
                      required
                    />
                  </>
                )}
              </>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                (modal === "rfq" && vendorIds.length === 0) ||
                (modal === "offer" && !vendorId) ||
                (modal === "select" &&
                  selectionMode === "single" &&
                  !offerId) ||
                (modal === "select" &&
                  selectionMode === "split" &&
                  data.rfqLines.some((rl) => !splitAwardsMap[rl.id]?.offerLineId))
              }
            >
              {modal === "select" ? "Select supplier" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-base">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}
function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`source-${name}`}>{label}</Label>
      <Input id={`source-${name}`} name={name} {...props} />
    </div>
  );
}
function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Textarea>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`source-${name}`}>{label}</Label>
      <Textarea id={`source-${name}`} name={name} {...props} />
    </div>
  );
}
function SelectField({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
