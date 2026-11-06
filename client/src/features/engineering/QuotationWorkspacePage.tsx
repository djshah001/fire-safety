import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileText,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Building2,
  UserCheck,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  Clock,
  Sparkles,
  Layers,
  Star,
  FileCheck2,
  BadgeAlert,
} from "lucide-react";

import { QuotationTermsEditor } from "./QuotationTermsEditor";
import { getApiErrorMessage } from "@/api/client";
import {
  createQuotationRevision,
  issueQuotation,
  quotationDocumentUrl,
  quotationExcelUrl,
  quotationPreviewUrl,
  quotationWorkspaceQuery,
  recordQuotationDecision,
  reviewQuotation,
  submitQuotation,
  updateQuotationDocumentDetails,
  updateQuotationHeader,
  updateQuotationLine,
  updateQuotationPaymentPlan,
  type QuotationLine,
  type QuotationRevision,
} from "@/api/quotations";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Modal =
  | "document"
  | "create"
  | "header"
  | "line"
  | "payment"
  | "return"
  | "accepted"
  | "declined";

function optional(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

function money(currency: string, value: string | number) {
  const num = Number(value);
  return `${currency} ${isNaN(num) ? "0.00" : num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ExpandableText({
  text,
  limit = 85,
  className,
}: {
  text?: string | null;
  limit?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!text) return <span className="text-muted-foreground/60">—</span>;

  const isLong = text.length > limit;

  const copyToClipboard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore write failure
    }
  };

  return (
    <div
      className={cn(
        "group/text relative min-w-0 w-full whitespace-normal",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs leading-relaxed text-muted-foreground break-words whitespace-normal",
          !expanded && isLong && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {isLong && (
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="size-3" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            title="Copy text"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground opacity-0 group-hover/text:opacity-100 transition-opacity"
          >
            {copied ? (
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" /> Copied
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <Copy className="size-3" /> Copy
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export function QuotationWorkspacePage() {
  const { jobId } = useParams();
  const queryClient = useQueryClient();
  const workspace = useQuery(quotationWorkspaceQuery(jobId));

  const [modal, setModal] = useState<Modal>();
  const [revision, setRevision] = useState<QuotationRevision>();
  const [line, setLine] = useState<QuotationLine>();
  const [boqRevisionId, setBoqRevisionId] = useState("");
  const [sourceRevisionId, setSourceRevisionId] = useState("none");

  // Customer decision state
  const [evidenceText, setEvidenceText] = useState("");
  const [notesText, setNotesText] = useState("");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["engineering", "design-job", jobId, "quotations"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["engineering", "quotations"],
      }),
    ]);
  };

  const close = () => {
    setModal(undefined);
    setRevision(undefined);
    setLine(undefined);
    setEvidenceText("");
    setNotesText("");
  };

  const editor = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !modal) return;

      if (modal === "create") {
        return createQuotationRevision(jobId, {
          boqRevisionId,
          sourceRevisionId:
            sourceRevisionId === "none" ? undefined : sourceRevisionId,
          title: String(form.get("title")),
          exclusions: String(form.get("exclusions")),
          deliveryTerms: String(form.get("deliveryTerms")),
          paymentTerms: String(form.get("paymentTerms")),
        });
      }

      if (!revision) return;

      if (modal === "document") {
        return updateQuotationDocumentDetails(
          jobId,
          revision.id,
          {
            senderName: optional(form.get("senderName")),
            senderAddress: optional(form.get("senderAddress")),
            senderTagline: optional(form.get("senderTagline")),
            senderContact: optional(form.get("senderContact")),
            senderGstin: optional(form.get("senderGstin")),
            recipientAddress: optional(form.get("recipientAddress")),
            recipientGstin: optional(form.get("recipientGstin")),
            recipientContact: optional(form.get("recipientContact")),
            recipientPhone: optional(form.get("recipientPhone")),
            documentDate: optional(form.get("documentDate")),
            bankDetails: optional(form.get("bankDetails")),
            signatory: optional(form.get("signatory")),
          },
          revision.rowVersion,
        );
      }

      if (modal === "header") {
        return updateQuotationHeader(jobId, revision.id, {
          title: String(form.get("title")),
          validityDays: Number(form.get("validityDays")),
          exclusions: String(form.get("exclusions")),
          deliveryTerms: String(form.get("deliveryTerms")),
          paymentTerms: String(form.get("paymentTerms")),
          additionalDiscount: String(form.get("additionalDiscount")),
          taxLabel: optional(form.get("taxLabel")),
          taxAmount: String(form.get("taxAmount")),
          roundingAdjustment: String(form.get("roundingAdjustment")),
          expectedVersion: revision.rowVersion,
        });
      }

      if (modal === "line" && line) {
        return updateQuotationLine(jobId, revision.id, line.id, {
          offeringId: String(form.get("offeringId")),
          notes: optional(form.get("notes")),
          expectedRevisionVersion: revision.rowVersion,
          expectedLineVersion: line.rowVersion,
        });
      }

      if (modal === "payment") {
        return updateQuotationPaymentPlan(jobId, revision.id, {
          cashPercentage: String(form.get("cashPercentage")),
          nonCashPercentage: String(form.get("nonCashPercentage")),
          expectedVersion: revision.rowVersion,
        });
      }

      if (modal === "return") {
        return reviewQuotation(jobId, revision.id, {
          decision: "returned",
          reason: String(form.get("reason")),
          expectedVersion: revision.rowVersion,
        });
      }

      if (modal !== "accepted" && modal !== "declined") {
        throw new Error("Quotation action is unavailable.");
      }

      return recordQuotationDecision(jobId, revision.id, {
        decision: modal,
        evidenceReference: String(form.get("evidenceReference")).trim(),
        customerOrderReference: optional(form.get("customerOrderReference")),
        notes: optional(form.get("notes")),
        expectedVersion: revision.rowVersion,
      });
    },
    async onSuccess() {
      await invalidate();
      close();
      toast.success("Quotation updated successfully.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const action = useMutation({
    mutationFn: async ({
      revision: current,
      type,
    }: {
      revision: QuotationRevision;
      type: "submit" | "approve" | "issue";
    }) => {
      if (!jobId) return;
      if (type === "submit") {
        return submitQuotation(jobId, current.id, current.rowVersion);
      }
      if (type === "approve") {
        return reviewQuotation(jobId, current.id, {
          decision: "approved",
          expectedVersion: current.rowVersion,
        });
      }
      return issueQuotation(jobId, current.id, current.rowVersion);
    },
    async onSuccess(_, variables) {
      await invalidate();
      toast.success(
        variables.type === "issue"
          ? "Official quotation PDF issued and preserved."
          : "Quotation moved to the next workflow stage.",
      );
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  if (workspace.isPending) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </main>
    );
  }

  if (workspace.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost" className="-ml-2 mb-2">
          <Link to="/engineering/quotations">
            <ArrowLeft className="mr-1.5 size-4" />
            Quotations
          </Link>
        </Button>
        <Alert className="mt-4" variant="destructive">
          <AlertTitle>Quotation workspace unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              workspace.error,
              "This quotation is unavailable or outside your assigned project scope.",
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const { job, context, quotation, eligibleBoqs, revisions, capabilities } =
    workspace.data;
  const latest = revisions[0];

  const canCreate =
    capabilities.canWrite &&
    eligibleBoqs.length > 0 &&
    !revisions.some((item) => item.status === "draft") &&
    (!latest || ["returned", "issued", "declined"].includes(latest.status));

  const openModal = (
    next: Modal,
    current?: QuotationRevision,
    currentLine?: QuotationLine,
  ) => {
    setRevision(current);
    setLine(currentLine);
    setModal(next);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* Back Link */}
        <Button asChild className="-ml-2 mb-2" variant="ghost">
          <Link to="/engineering/quotations">
            <ArrowLeft className="mr-1.5 size-4" />
            Quotations Directory
          </Link>
        </Button>

        {/* Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Commercial Engineering · {context.leadNumber}
              </span>
              {latest && <StatusBadge status={latest.status} />}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {quotation?.quotationNumber ?? "New Quotation Workspace"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Project: <strong className="text-foreground">{job.title}</strong>{" "}
              · Client:{" "}
              <strong className="text-foreground">
                {context.customerName}
              </strong>
            </p>
          </div>

          {canCreate && (
            <Button
              onClick={() => {
                setBoqRevisionId(eligibleBoqs[0]!.id);
                setSourceRevisionId(
                  latest &&
                    ["returned", "issued", "declined"].includes(latest.status)
                    ? latest.id
                    : "none",
                );
                openModal("create");
              }}
              size="sm"
            >
              <Plus className="mr-1.5 size-4" />
              New Quotation Revision
            </Button>
          )}
        </div>

        {/* KPI Overview Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-medium">
                Commercial State
              </CardDescription>
              <div className="pt-1">
                <StatusBadge status={context.opportunityCommercialState} />
              </div>
            </CardHeader>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-medium">
                Approved BOQ Source
              </CardDescription>
              <CardTitle className="text-sm font-semibold pt-1">
                {eligibleBoqs.length} approved revision
                {eligibleBoqs.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-medium">
                Document Mode
              </CardDescription>
              <CardTitle className="text-sm font-semibold pt-1 text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Sparkles className="size-4" />
                Demo / Reference Layout
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {eligibleBoqs.length === 0 && (
          <Alert className="mt-6">
            <AlertCircle className="size-4 text-primary" />
            <AlertTitle className="text-xs font-semibold">
              Approved BOQ Required
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-0.5">
              An internally approved technical BOQ revision is mandatory before
              quotation preparation can proceed. Project execution start remains
              an independent decision.
            </AlertDescription>
          </Alert>
        )}

        {/* Revisions Stack */}
        <section className="mt-8 space-y-6">
          {revisions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2.5 size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  No quotation revisions prepared yet
                </p>
                <p className="text-xs max-w-sm mx-auto mt-0.5">
                  Click "New Quotation Revision" above to inherit items from the
                  approved BOQ.
                </p>
              </CardContent>
            </Card>
          ) : (
            revisions.map((current) => (
              <Card key={current.id} className="shadow-xs overflow-hidden">
                <CardHeader className="border-b bg-card/60 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs font-semibold"
                        >
                          Revision R{current.revisionNumber}
                        </Badge>
                        <StatusBadge status={current.status} />
                        {current.issueDocument?.isDemo && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            Demo PDF
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg font-semibold pt-1">
                        {current.title}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Derived from BOQ Revision{" "}
                        <strong className="font-mono">
                          {eligibleBoqs.find(
                            (item) => item.id === current.boqRevisionId,
                          )?.revisionNumber ?? "historical"}
                        </strong>{" "}
                        · Validity: {current.validityDays} calendar days
                      </CardDescription>
                    </div>

                    {/* Revision Action Bar */}
                    <div className="flex flex-wrap items-center gap-2">
                      {capabilities.canWrite && current.status === "draft" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => openModal("header", current)}
                          >
                            <Pencil className="size-3.5 mr-1" />
                            Terms & Totals
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => openModal("document", current)}
                          >
                            <Pencil className="size-3.5 mr-1" />
                            Document Details
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={
                              action.isPending ||
                              Number(current.grandTotal) <= 0 ||
                              current.lines.some(
                                (item) =>
                                  !item.offeringId ||
                                  !item.offeringOptions.some(
                                    (option) => option.id === item.offeringId,
                                  ),
                              )
                            }
                            onClick={() =>
                              action.mutate({
                                revision: current,
                                type: "submit",
                              })
                            }
                          >
                            <Send className="size-3.5 mr-1" />
                            Submit for Review
                          </Button>
                        </>
                      )}

                      {capabilities.canApprove &&
                        current.status === "submitted" && (
                          <>
                            <Button
                              disabled={
                                current.isContributor &&
                                !capabilities.canOverrideApprovals
                              }
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openModal("return", current)}
                            >
                              Return
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={
                                (current.isContributor &&
                                  !capabilities.canOverrideApprovals) ||
                                action.isPending
                              }
                              onClick={() =>
                                action.mutate({
                                  revision: current,
                                  type: "approve",
                                })
                              }
                            >
                              <ShieldCheck className="size-3.5 mr-1" />
                              Approve
                            </Button>
                          </>
                        )}

                      {capabilities.canIssue &&
                        current.status === "approved" && (
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={action.isPending}
                            onClick={() =>
                              action.mutate({
                                revision: current,
                                type: "issue",
                              })
                            }
                          >
                            <FileText className="size-3.5 mr-1" />
                            Issue Demo PDF
                          </Button>
                        )}

                      {capabilities.canRecordDecision &&
                        current.status === "issued" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openModal("declined", current)}
                            >
                              Declined
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openModal("accepted", current)}
                            >
                              <CheckCircle2 className="size-3.5 mr-1" />
                              Record Acceptance
                            </Button>
                          </>
                        )}

                      {current.issueDocument && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                        >
                          <a
                            href={quotationDocumentUrl(
                              job.id,
                              current.id,
                              current.issueDocument.id,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download className="size-3.5 mr-1" />
                            PDF Snapshot
                          </a>
                        </Button>
                      )}

                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                      >
                        <a
                          href={quotationPreviewUrl(job.id, current.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText className="size-3.5 mr-1" />
                          Preview PDF
                        </a>
                      </Button>

                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                      >
                        <a href={quotationExcelUrl(job.id, current.id)}>
                          <FileSpreadsheet className="size-3.5 mr-1" />
                          Excel
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-7 p-4 sm:p-6">
                  {/* Contributor Self-Approval Warning */}
                  {current.status === "submitted" &&
                    current.isContributor &&
                    capabilities.canApprove &&
                    !capabilities.canOverrideApprovals && (
                      <Alert className="bg-amber-500/10 border-amber-500/20">
                        <BadgeAlert className="size-4 text-amber-600" />
                        <AlertTitle className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                          Independent Approval Required
                        </AlertTitle>
                        <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                          You contributed to this quotation revision. Separation
                          of duties requires a different authorized reviewer to
                          approve or return it.
                        </AlertDescription>
                      </Alert>
                    )}

                  {/* Commercial Metrics Strip */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="Subtotal (Ex-Works)"
                      value={money(current.currency, current.subtotal)}
                    />
                    <MetricCard
                      label="Discounts Deducted"
                      value={money(
                        current.currency,
                        String(
                          Number(current.lineDiscountTotal) +
                            Number(current.additionalDiscount),
                        ),
                      )}
                    />
                    <MetricCard
                      label={current.taxLabel ?? "Tax / GST (unconfigured)"}
                      value={money(current.currency, current.taxAmount)}
                    />
                    <MetricCard
                      label="Quotation Grand Total"
                      value={money(current.currency, current.grandTotal)}
                      strong
                    />
                  </div>

                  {/* 11-Column Commercial Pricing Table */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <Layers className="size-4 text-primary" />
                          Scope and Commercial Pricing Breakdown
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Select one approved brand/model offering per line
                          item. Its immutable BOQ rate and markup percentage
                          form the final unit price.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">
                        {current.lines.length} Line(s)
                      </Badge>
                    </div>

                    <div className="overflow-x-auto rounded-lg border bg-card max-h-[32rem] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-12 text-center text-xs font-semibold">
                              #
                            </TableHead>
                            <TableHead className="min-w-[240px] max-w-[360px] text-xs font-semibold">
                              Item / Specification
                            </TableHead>
                            <TableHead className="min-w-[200px] text-xs font-semibold">
                              Selected Brand & Make
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[80px]">
                              Qty
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[90px]">
                              Supply
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[90px]">
                              Labour
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[90px]">
                              Misc.
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[120px]">
                              Markup
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[100px]">
                              Unit Rate
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[110px]">
                              Amount
                            </TableHead>
                            {capabilities.canWrite &&
                              current.status === "draft" && (
                                <TableHead className="w-14 text-center text-xs font-semibold">
                                  Action
                                </TableHead>
                              )}
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {current.lines.map((item) => {
                            const isConfigured = Boolean(item.offeringId);

                            return (
                              <TableRow
                                key={item.id}
                                className={cn(
                                  "transition-colors align-top",
                                  !isConfigured
                                    ? "bg-destructive/[0.03]"
                                    : "hover:bg-muted/40",
                                )}
                              >
                                <TableCell className="text-center font-mono text-xs text-muted-foreground pt-3">
                                  {item.lineNumber}
                                </TableCell>

                                <TableCell className="pt-3 max-w-[360px]">
                                  <p className="font-semibold text-xs text-foreground">
                                    {item.itemName}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground font-mono">
                                    <span>{item.section}</span>
                                    <span>•</span>
                                    <span>{item.itemCode}</span>
                                  </div>
                                  <div className="mt-1">
                                    <ExpandableText
                                      text={item.specification}
                                      limit={80}
                                    />
                                  </div>
                                </TableCell>

                                <TableCell className="pt-3">
                                  {item.offeringId ? (
                                    <div className="space-y-1">
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-medium"
                                      >
                                        {item.brandName ?? "Unbranded"}
                                      </Badge>
                                      <p className="text-xs font-medium text-foreground">
                                        {item.manufacturerModel}
                                      </p>
                                      {item.manufacturerSku && (
                                        <p className="text-[10px] font-mono text-muted-foreground">
                                          SKU: {item.manufacturerSku}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-destructive border-destructive/30 bg-destructive/5"
                                    >
                                      Offering required
                                    </Badge>
                                  )}
                                </TableCell>

                                <TableCell className="text-right tabular-nums text-xs font-mono pt-3 whitespace-nowrap">
                                  {item.quantity} {item.unitSymbol}
                                </TableCell>

                                <TableCell className="text-right tabular-nums text-xs pt-3">
                                  {money(current.currency, item.supplyRate)}
                                </TableCell>

                                <TableCell className="text-right tabular-nums text-xs pt-3">
                                  {money(current.currency, item.labourRate)}
                                </TableCell>

                                <TableCell className="text-right tabular-nums text-xs pt-3">
                                  {money(
                                    current.currency,
                                    item.miscellaneousRate,
                                  )}
                                </TableCell>

                                <TableCell className="text-right text-xs pt-3">
                                  <span className="font-mono text-[11px] tabular-nums">
                                    {item.markupPercent}%
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground tabular-nums">
                                    {money(current.currency, item.markupAmount)}
                                  </span>
                                </TableCell>

                                <TableCell className="text-right tabular-nums text-xs pt-3">
                                  {money(current.currency, item.quotedUnitRate)}
                                </TableCell>

                                <TableCell className="text-right font-semibold text-xs tabular-nums text-foreground pt-3">
                                  {money(current.currency, item.lineTotal)}
                                </TableCell>

                                {capabilities.canWrite &&
                                  current.status === "draft" && (
                                    <TableCell className="text-center pt-2">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            className="size-8 text-muted-foreground hover:text-foreground"
                                            aria-label={`Configure ${item.itemName} make`}
                                            onClick={() =>
                                              openModal("line", current, item)
                                            }
                                          >
                                            <Pencil className="size-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Select Make & Rates
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                  )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Commercial Terms Strip */}
                  <div className="grid gap-4 lg:grid-cols-3">
                    <TermCard
                      title="Exclusions Scope"
                      value={current.exclusions}
                    />
                    <TermCard
                      title="Delivery & Freight Terms"
                      value={current.deliveryTerms}
                    />
                    <TermCard
                      title="Payment Conditions"
                      value={current.paymentTerms}
                    />
                  </div>

                  {/* Payment Plan Section */}
                  {capabilities.canViewPaymentPlan ? (
                    <Card className="bg-muted/20 border-border/70 shadow-2xs">
                      <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                            <CreditCard className="size-4 text-primary" />
                            Commercial Payment Plan
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Provisional breakdown against full{" "}
                            {money(current.currency, current.grandTotal)} basis
                            (does not imply actual receipt).
                          </CardDescription>
                        </div>
                        {capabilities.canWritePaymentPlan &&
                          current.status === "accepted" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => openModal("payment", current)}
                            >
                              <Pencil className="size-3.5 mr-1" />
                              Configure Plan
                            </Button>
                          )}
                      </CardHeader>
                      <CardContent className="p-4 pt-1">
                        {current.paymentPlan ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <MetricCard
                              label="Cash Allocation Plan"
                              value={`${current.paymentPlan.cashPercentage}%`}
                            />
                            <MetricCard
                              label="Non-Cash (Bank Transfer / Cheque)"
                              value={`${current.paymentPlan.nonCashPercentage}%`}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Payment distribution is configured after quotation
                            acceptance. Cash and non-cash percentages must sum
                            to 100%.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Alert>
                      <AlertTitle className="text-xs font-semibold">
                        Payment Plan Restricted
                      </AlertTitle>
                      <AlertDescription className="text-xs text-muted-foreground">
                        Sensitive commercial payment terms are redacted based on
                        your role assignments.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Review Decision Banner */}
                  {current.review && (
                    <Alert>
                      <ShieldCheck className="size-4 text-primary" />
                      <AlertTitle className="text-xs font-semibold">
                        Sales Review Decision: {current.review.decision}
                      </AlertTitle>
                      <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                        {current.review.reason ||
                          "Approved without return notes."}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Customer Decision Banner */}
                  {current.customerDecision && (
                    <Alert>
                      <FileCheck2 className="size-4 text-primary" />
                      <AlertTitle className="text-xs font-semibold capitalize">
                        Customer Decision: {current.customerDecision.decision}
                      </AlertTitle>
                      <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                        Traceable Evidence:{" "}
                        <strong className="text-foreground">
                          {current.customerDecision.evidenceReference}
                        </strong>
                        {current.customerDecision.customerOrderReference && (
                          <span>
                            {" "}
                            · PO / Order Ref:{" "}
                            {current.customerDecision.customerOrderReference}
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {/* Modal Controller */}
        <QuotationDialog
          modal={modal}
          revision={revision}
          line={line}
          defaults={workspace.data.defaults}
          eligibleBoqs={eligibleBoqs}
          revisions={revisions}
          boqRevisionId={boqRevisionId}
          setBoqRevisionId={setBoqRevisionId}
          sourceRevisionId={sourceRevisionId}
          setSourceRevisionId={setSourceRevisionId}
          evidenceText={evidenceText}
          setEvidenceText={setEvidenceText}
          notesText={notesText}
          setNotesText={setNotesText}
          busy={editor.isPending}
          error={editor.isError ? getApiErrorMessage(editor.error) : undefined}
          onClose={close}
          onSubmit={(form) => editor.mutate(form)}
        />
      </main>
    </TooltipProvider>
  );
}

function MetricCard({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 shadow-2xs transition-all",
        strong ? "bg-primary/5 border-primary/20" : "bg-card",
      )}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 tabular-nums font-mono",
          strong
            ? "text-base font-bold text-foreground"
            : "text-sm font-semibold text-foreground/90",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TermCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3.5 space-y-1.5 shadow-2xs">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto pr-1">
        {value || "No special conditions specified."}
      </p>
    </div>
  );
}

function QuotationDialog({
  defaults,
  modal,
  revision,
  line,
  eligibleBoqs,
  revisions,
  boqRevisionId,
  setBoqRevisionId,
  sourceRevisionId,
  setSourceRevisionId,
  evidenceText,
  setEvidenceText,
  notesText,
  setNotesText,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  defaults: { exclusions: string; deliveryTerms: string; paymentTerms: string };
  modal?: Modal;
  revision?: QuotationRevision;
  line?: QuotationLine;
  eligibleBoqs: Array<{ id: string; revisionNumber: number; title: string }>;
  revisions: QuotationRevision[];
  boqRevisionId: string;
  setBoqRevisionId: (value: string) => void;
  sourceRevisionId: string;
  setSourceRevisionId: (value: string) => void;
  evidenceText: string;
  setEvidenceText: (v: string) => void;
  notesText: string;
  setNotesText: (v: string) => void;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const title =
    modal === "document"
      ? "Edit Quotation Document Details"
      : modal === "create"
        ? "Create Quotation Revision"
        : modal === "header"
          ? "Edit Commercial Terms & Totals"
          : modal === "line"
            ? `Configure Make · ${line?.itemName}`
            : modal === "payment"
              ? "Configure Payment Plan Breakdown"
              : modal === "return"
                ? "Return Quotation for Revision"
                : `Record Customer ${modal === "accepted" ? "Acceptance" : "Rejection"}`;

  return (
    <Dialog
      open={Boolean(modal)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {modal === "create"
              ? "All approved technical lines from the chosen BOQ will be snapshotted into this revision."
              : modal === "payment"
                ? "Cash and non-cash percentages must total exactly 100%. This is an internal forecast, not a receipt."
                : modal === "header"
                  ? "Taxes and adjustments recalculate billable amounts using authoritative intermediate decimals."
                  : modal === "return"
                    ? "The submitted revision remains immutable; corrective work creates a fresh numbered revision."
                    : modal === "line"
                      ? "Pick a purchase-confirmed make snapshot. Its rates and markup will immediately update the line."
                      : modal === "document"
                        ? "Preserve configurable sender and customer letterhead details for generated PDFs."
                        : "Identify traceable proof of the customer's decision (3–1,000 characters required)."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col flex-1 min-h-0"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Modal: Document Details */}
            {modal === "document" && revision && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 border-b pb-1">
                    <Building2 className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Sender Organization / Letterhead
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Company / Sender Name"
                      name="senderName"
                      maxLength={160}
                      defaultValue={revision.documentDetails.senderName ?? ""}
                    />
                    <Field
                      label="Tagline (optional)"
                      name="senderTagline"
                      maxLength={200}
                      defaultValue={
                        revision.documentDetails.senderTagline ?? ""
                      }
                    />
                    <div className="sm:col-span-2">
                      <TextField
                        label="Company Address"
                        name="senderAddress"
                        maxLength={600}
                        defaultValue={
                          revision.documentDetails.senderAddress ?? ""
                        }
                      />
                    </div>
                    <Field
                      label="Contact Phone / Email"
                      name="senderContact"
                      maxLength={200}
                      defaultValue={
                        revision.documentDetails.senderContact ?? ""
                      }
                    />
                    <Field
                      label="Sender GSTIN"
                      name="senderGstin"
                      maxLength={40}
                      defaultValue={revision.documentDetails.senderGstin ?? ""}
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-1.5 border-b pb-1">
                    <UserCheck className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Recipient / Customer Details
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Document Date"
                      name="documentDate"
                      type="date"
                      defaultValue={revision.documentDetails.documentDate ?? ""}
                    />
                    <Field
                      label="Customer GSTIN"
                      name="recipientGstin"
                      maxLength={40}
                      defaultValue={
                        revision.documentDetails.recipientGstin ?? ""
                      }
                    />
                    <div className="sm:col-span-2">
                      <TextField
                        label="Customer Delivery Address"
                        name="recipientAddress"
                        maxLength={600}
                        defaultValue={
                          revision.documentDetails.recipientAddress ?? ""
                        }
                      />
                    </div>
                    <Field
                      label="Contact Person"
                      name="recipientContact"
                      maxLength={160}
                      defaultValue={
                        revision.documentDetails.recipientContact ?? ""
                      }
                    />
                    <Field
                      label="Contact Phone"
                      name="recipientPhone"
                      maxLength={40}
                      defaultValue={
                        revision.documentDetails.recipientPhone ?? ""
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-1.5 border-b pb-1">
                    <CreditCard className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Banking & Authorization
                    </span>
                  </div>

                  <TextField
                    label="Bank Account Details (optional)"
                    name="bankDetails"
                    maxLength={1000}
                    defaultValue={revision.documentDetails.bankDetails ?? ""}
                  />
                  <Field
                    label="Authorized Signatory Title"
                    name="signatory"
                    maxLength={160}
                    defaultValue={revision.documentDetails.signatory ?? ""}
                  />
                </div>
              </>
            )}

            {/* Modal: Create Quotation */}
            {modal === "create" && (
              <>
                <SelectField
                  label="Approved BOQ Source Baseline"
                  value={boqRevisionId}
                  onValueChange={setBoqRevisionId}
                  items={eligibleBoqs.map((item) => ({
                    value: item.id,
                    label: `BOQ Revision R${item.revisionNumber} · ${item.title}`,
                  }))}
                />
                <SelectField
                  label="Inherit Brand Selections & Notes from (optional)"
                  value={sourceRevisionId}
                  onValueChange={setSourceRevisionId}
                  items={[
                    { value: "none", label: "Start fresh without prior makes" },
                    ...revisions
                      .filter((item) =>
                        ["returned", "issued", "declined"].includes(
                          item.status,
                        ),
                      )
                      .map((item) => ({
                        value: item.id,
                        label: `Quotation R${item.revisionNumber} · ${item.status}`,
                      })),
                  ]}
                />
                <Field label="Quotation Title" name="title" required />
                <QuotationTermsEditor
                  name="exclusions"
                  defaultValue={defaults.exclusions}
                />
                <TextField
                  label="Delivery Terms"
                  name="deliveryTerms"
                  required
                  defaultValue={defaults.deliveryTerms}
                />
                <TextField
                  label="Payment Terms"
                  name="paymentTerms"
                  required
                  defaultValue={defaults.paymentTerms}
                />
              </>
            )}

            {/* Modal: Header Terms & Totals */}
            {modal === "header" && revision && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Quotation Title"
                    name="title"
                    required
                    defaultValue={revision.title}
                  />
                  <Field
                    label="Offer Validity (calendar days)"
                    name="validityDays"
                    type="number"
                    min={1}
                    max={365}
                    required
                    defaultValue={revision.validityDays}
                  />
                </div>

                <QuotationTermsEditor
                  name="exclusions"
                  defaultValue={revision.exclusions}
                />
                <TextField
                  label="Delivery Terms"
                  name="deliveryTerms"
                  required
                  defaultValue={revision.deliveryTerms}
                />
                <TextField
                  label="Payment Terms"
                  name="paymentTerms"
                  required
                  defaultValue={revision.paymentTerms}
                />

                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <Field
                    label="Additional Discount (Amount)"
                    name="additionalDiscount"
                    inputMode="decimal"
                    required
                    defaultValue={revision.additionalDiscount}
                  />
                  <Field
                    label="Tax Amount"
                    name="taxAmount"
                    inputMode="decimal"
                    required
                    defaultValue={revision.taxAmount}
                  />
                  <Field
                    label="Tax Description (e.g. GST @ 18%)"
                    name="taxLabel"
                    defaultValue={revision.taxLabel ?? ""}
                  />
                  <Field
                    label="Rounding Adjustment"
                    name="roundingAdjustment"
                    inputMode="decimal"
                    required
                    defaultValue={revision.roundingAdjustment}
                  />
                </div>
              </>
            )}

            {/* Modal: Configure Line Offering */}
            {modal === "line" && line && (
              <>
                <Alert className="bg-primary/5 border-primary/20">
                  <Layers className="size-4 text-primary" />
                  <AlertTitle className="text-xs font-semibold">
                    {line.itemName}
                  </AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                    Quantity: {line.quantity} {line.unitSymbol} ·{" "}
                    {line.specification}
                  </AlertDescription>
                </Alert>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="quote-offeringId"
                    className="text-xs font-semibold"
                  >
                    Approved Brand / Model Costing Offering{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    defaultValue={line.offeringId ?? undefined}
                    name="offeringId"
                    required
                  >
                    <SelectTrigger
                      className="w-full h-9 text-xs"
                      id="quote-offeringId"
                    >
                      <SelectValue placeholder="Choose confirmed make…" />
                    </SelectTrigger>
                    <SelectContent>
                      {line.offeringOptions.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                          className="text-xs"
                        >
                          {option.brandName ?? "Unbranded"} ·{" "}
                          {option.manufacturerModel} —{" "}
                          {money(
                            revision?.currency ?? "INR",
                            option.quotedUnitRate,
                          )}
                          /unit
                          {option.isPreferred ? " [Preferred]" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 pt-2">
                  <MetricCard
                    label="Supply Component"
                    value={money(revision?.currency ?? "INR", line.supplyRate)}
                  />
                  <MetricCard
                    label="Installation / Labour"
                    value={money(revision?.currency ?? "INR", line.labourRate)}
                  />
                  <MetricCard
                    label="Miscellaneous"
                    value={money(
                      revision?.currency ?? "INR",
                      line.miscellaneousRate,
                    )}
                  />
                  <MetricCard
                    label={`Confirmed Markup (${line.markupPercent}%)`}
                    value={money(
                      revision?.currency ?? "INR",
                      line.markupAmount,
                    )}
                  />
                  <MetricCard
                    label="Resulting Unit Rate"
                    value={money(
                      revision?.currency ?? "INR",
                      line.quotedUnitRate,
                    )}
                    strong
                  />
                  <MetricCard
                    label="Line Total Amount"
                    value={money(revision?.currency ?? "INR", line.lineTotal)}
                    strong
                  />
                </div>

                <TextField
                  label="Commercial Note (optional)"
                  name="notes"
                  placeholder="Specific warranty or deviations for this line item…"
                  defaultValue={line.notes ?? ""}
                />
              </>
            )}

            {/* Modal: Payment Plan */}
            {modal === "payment" && revision && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Cash Plan Percentage (%)"
                    name="cashPercentage"
                    inputMode="decimal"
                    placeholder="e.g. 30"
                    required
                    defaultValue={revision.paymentPlan?.cashPercentage ?? ""}
                  />
                  <Field
                    label="Non-Cash Percentage (%)"
                    name="nonCashPercentage"
                    inputMode="decimal"
                    placeholder="e.g. 70"
                    required
                    defaultValue={revision.paymentPlan?.nonCashPercentage ?? ""}
                  />
                </div>
                <Alert className="bg-amber-500/10 border-amber-500/20">
                  <AlertDescription className="text-xs text-muted-foreground">
                    Cash + Non-cash percentages must sum to 100%. The plan
                    applies across the full{" "}
                    {money(revision.currency, revision.grandTotal)} commercial
                    basis and does not record an actual cash receipt.
                  </AlertDescription>
                </Alert>
              </>
            )}

            {/* Modal: Return Quotation */}
            {modal === "return" && (
              <TextField
                label="Return Reason"
                name="reason"
                placeholder="State specific commercial or technical reasons requiring correction…"
                required
              />
            )}

            {/* Modal: Customer Decision (Accepted / Declined) */}
            {(modal === "accepted" || modal === "declined") && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="evidenceReference"
                      className="text-xs font-semibold"
                    >
                      Traceable Evidence Reference{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <span
                      className={cn(
                        "text-[10px] font-mono",
                        evidenceText.length >= 3 && evidenceText.length <= 1000
                          ? "text-muted-foreground"
                          : "text-destructive font-semibold",
                      )}
                    >
                      {evidenceText.length}/1000
                    </span>
                  </div>
                  <Input
                    id="evidenceReference"
                    name="evidenceReference"
                    value={evidenceText}
                    onChange={(e) => setEvidenceText(e.target.value)}
                    placeholder="Email date, signed quotation copy, MOM, or verbal confirmation reference"
                    className="h-9 text-sm"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required: 3–1,000 characters identifying proof of response
                    for this exact revision.
                  </p>
                </div>

                <Field
                  label="Customer PO / Work Order Reference (optional)"
                  name="customerOrderReference"
                  placeholder="PO-2026-X491"
                />

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="decision-notes"
                      className="text-xs font-semibold"
                    >
                      Decision Notes (optional)
                    </Label>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {notesText.length}/1000
                    </span>
                  </div>
                  <Textarea
                    id="decision-notes"
                    name="notes"
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="text-sm"
                    placeholder="Conditional approvals, customer delivery requirements, or remarks…"
                  />
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="p-4 border-t bg-card shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                busy ||
                (modal === "create" && !boqRevisionId) ||
                ((modal === "accepted" || modal === "declined") &&
                  evidenceText.trim().length < 3)
              }
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`quote-${name}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id={`quote-${name}`}
        name={name}
        className="h-9 text-sm"
        {...props}
      />
    </div>
  );
}

function TextField({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Textarea>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`quote-${name}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Textarea
        id={`quote-${name}`}
        name={name}
        rows={3}
        className="text-sm leading-relaxed"
        {...props}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full h-9 text-xs">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
