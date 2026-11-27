import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
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
  ChevronsUpDown,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Layers,
  FileCheck2,
  BadgeAlert,
  Search,
  X,
  RotateCcw,
  Save,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";

import { QuotationTermsEditor } from "./QuotationTermsEditor";
import { getApiErrorMessage } from "@/api/client";
import {
  calculateQuotationLinePreview,
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
  updateQuotationLinesPricing,
  updateQuotationPaymentPlan,
  type QuotationDeclineOutcome,
  type QuotationLine,
  type QuotationLinePricingUpdate,
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
import { COLLAPSIBLE_PANEL, FLOATING_BAR } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Modal =
  | "document"
  | "create"
  | "header"
  | "payment"
  | "return"
  | "accepted"
  | "declined";

type LineDraftPatch = {
  offeringId: string | null;
  supplyRate: string;
  labourRate: string;
  miscellaneousRate: string;
  markupPercent: string;
  notes: string;
};

type StageStep = {
  key: string;
  label: string;
  state: "done" | "active" | "upcoming" | "attention" | "danger";
};

function optional(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

function money(currency: string, value: string | number) {
  const num = Number(value);
  return `${currency} ${isNaN(num) ? "0.00" : num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function trimDecimalInput(raw: string) {
  if (!raw) return "0";
  if (!raw.includes(".")) return raw;
  const trimmed = raw.replace(/\.?0+$/, "");
  return trimmed || "0";
}

function sameDecimal(a: string, b: string) {
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return (
      Math.abs(numA - numB) < 0.00005 && a.trim() !== "" && b.trim() !== ""
    );
  }
  return a.trim() === b.trim();
}

function isValidRateString(raw: string, maxValue?: number) {
  const trimmed = raw.trim();
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(trimmed)) return false;
  if (maxValue !== undefined && Number(trimmed) > maxValue) return false;
  return true;
}

function buildLineBaseline(item: QuotationLine): LineDraftPatch {
  return {
    offeringId: item.offeringId,
    supplyRate: trimDecimalInput(item.supplyRate),
    labourRate: trimDecimalInput(item.labourRate),
    miscellaneousRate: trimDecimalInput(item.miscellaneousRate),
    markupPercent: trimDecimalInput(item.markupPercent),
    notes: item.notes ?? "",
  };
}

function isLinePatchDirty(item: QuotationLine, patch?: LineDraftPatch) {
  if (!patch) return false;
  return (
    patch.offeringId !== item.offeringId ||
    !sameDecimal(patch.supplyRate, item.supplyRate) ||
    !sameDecimal(patch.labourRate, item.labourRate) ||
    !sameDecimal(patch.miscellaneousRate, item.miscellaneousRate) ||
    !sameDecimal(patch.markupPercent, item.markupPercent) ||
    patch.notes.trim() !== (item.notes ?? "").trim()
  );
}

function getStageSteps(status: QuotationRevision["status"]): StageStep[] {
  const steps: StageStep[] = [
    { key: "draft", label: "Draft Pricing", state: "upcoming" },
    { key: "review", label: "Sales Review", state: "upcoming" },
    { key: "approved", label: "Approved", state: "upcoming" },
    { key: "issued", label: "Issued", state: "upcoming" },
    { key: "decision", label: "Customer Decision", state: "upcoming" },
  ];

  if (status === "draft") {
    steps[0]!.state = "active";
  } else if (status === "submitted") {
    steps[0]!.state = "done";
    steps[1]!.state = "active";
  } else if (status === "returned") {
    steps[0]!.state = "done";
    steps[1]!.state = "attention";
    steps[1]!.label = "Returned";
  } else if (status === "approved") {
    steps[0]!.state = "done";
    steps[1]!.state = "done";
    steps[2]!.state = "active";
  } else if (status === "issued") {
    steps[0]!.state = "done";
    steps[1]!.state = "done";
    steps[2]!.state = "done";
    steps[3]!.state = "active";
  } else if (status === "accepted") {
    steps.forEach((step) => {
      step.state = "done";
    });
    steps[4]!.label = "Accepted";
  } else if (status === "declined") {
    steps[0]!.state = "done";
    steps[1]!.state = "done";
    steps[2]!.state = "done";
    steps[3]!.state = "done";
    steps[4]!.state = "danger";
    steps[4]!.label = "Declined";
  }

  return steps;
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
  const [boqRevisionId, setBoqRevisionId] = useState("");
  const [sourceRevisionId, setSourceRevisionId] = useState("none");

  // Track which older revisions are manually expanded; latest is expanded by default
  const [expandedRevisions, setExpandedRevisions] = useState<
    Record<string, boolean>
  >({});

  // Inline in-place draft line edits keyed by [revisionId][lineId]
  const [lineDrafts, setLineDrafts] = useState<
    Record<string, Record<string, LineDraftPatch>>
  >({});
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);

  // Customer decision state
  const [evidenceText, setEvidenceText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [leadOutcome, setLeadOutcome] =
    useState<QuotationDeclineOutcome>("keep_negotiating");

  // In-workspace search & filter state
  const [lineSearch, setLineSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [selectionFilter, setSelectionFilter] = useState<
    "all" | "selected" | "unselected"
  >("all");

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
    setEvidenceText("");
    setNotesText("");
    setLeadOutcome("keep_negotiating");
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
        leadOutcome: modal === "declined" ? leadOutcome : undefined,
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

  const saveLinesPricing = useMutation({
    mutationFn: async ({
      revisionId,
      expectedVersion,
      updates,
    }: {
      revisionId: string;
      expectedVersion: number;
      updates: QuotationLinePricingUpdate[];
    }) => {
      if (!jobId) throw new Error("Missing design job ID.");
      return updateQuotationLinesPricing(jobId, revisionId, {
        expectedVersion,
        updates,
      });
    },
    async onSuccess(_data, variables) {
      setPricingSaveError(null);
      setLineDrafts((prev) => {
        const current = { ...prev[variables.revisionId] };
        for (const item of variables.updates) {
          delete current[item.lineId];
        }
        return { ...prev, [variables.revisionId]: current };
      });
      await invalidate();
      toast.success(
        variables.updates.length === 1
          ? "Quotation line pricing saved."
          : `Saved pricing updates for ${variables.updates.length} quotation lines.`,
      );
    },
    onError(error) {
      const message = getApiErrorMessage(error);
      setPricingSaveError(message);
      toast.error(message);
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

  const activeDraftRevision = useMemo(
    () => workspace.data?.revisions.find((r) => r.status === "draft"),
    [workspace.data?.revisions],
  );

  const activeDirtyState = useMemo(() => {
    if (!activeDraftRevision) {
      return {
        updates: [] as QuotationLinePricingUpdate[],
        invalidCount: 0,
        projectedGrandTotal: "0.00",
      };
    }
    const revDrafts = lineDrafts[activeDraftRevision.id] ?? {};
    const updates: QuotationLinePricingUpdate[] = [];
    let invalidCount = 0;
    let projectedSubtotal = 0;

    for (const item of activeDraftRevision.lines) {
      const patch = revDrafts[item.id];
      const effective = patch ?? buildLineBaseline(item);
      const valid =
        isValidRateString(effective.supplyRate) &&
        isValidRateString(effective.labourRate) &&
        isValidRateString(effective.miscellaneousRate) &&
        isValidRateString(effective.markupPercent, 1000);

      if (patch && isLinePatchDirty(item, patch)) {
        if (!valid) {
          invalidCount += 1;
        }
        const preview = calculateQuotationLinePreview({
          quantity: item.quantity,
          supplyRate: effective.supplyRate,
          labourRate: effective.labourRate,
          miscellaneousRate: effective.miscellaneousRate,
          markupPercent: effective.markupPercent,
        });
        projectedSubtotal += Number(
          preview.valid ? preview.lineTotal : item.lineTotal,
        );
        updates.push({
          lineId: item.id,
          expectedLineVersion: item.rowVersion,
          ...(effective.offeringId ? { offeringId: effective.offeringId } : {}),
          supplyRate: effective.supplyRate.trim(),
          labourRate: effective.labourRate.trim(),
          miscellaneousRate: effective.miscellaneousRate.trim(),
          markupPercent: effective.markupPercent.trim(),
          notes: effective.notes.trim() || null,
        });
      } else {
        projectedSubtotal += Number(item.lineTotal);
      }
    }

    const projectedGrandTotal = Math.max(
      0,
      projectedSubtotal -
        Number(activeDraftRevision.lineDiscountTotal) -
        Number(activeDraftRevision.additionalDiscount) +
        Number(activeDraftRevision.taxAmount) +
        Number(activeDraftRevision.roundingAdjustment),
    ).toFixed(2);

    return { updates, invalidCount, projectedGrandTotal };
  }, [activeDraftRevision, lineDrafts]);

  if (workspace.isPending) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
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

  const openModal = (next: Modal, current?: QuotationRevision) => {
    setRevision(current);
    setModal(next);
  };

  const patchLineDraft = (
    revisionId: string,
    item: QuotationLine,
    updater: (prev: LineDraftPatch) => LineDraftPatch,
  ) => {
    setPricingSaveError(null);
    setLineDrafts((prev) => {
      const revMap = prev[revisionId] ?? {};
      const current = revMap[item.id] ?? buildLineBaseline(item);
      const next = updater(current);
      const nextRevMap = { ...revMap };
      if (!isLinePatchDirty(item, next)) {
        delete nextRevMap[item.id];
      } else {
        nextRevMap[item.id] = next;
      }
      return { ...prev, [revisionId]: nextRevMap };
    });
  };

  const revertLineDraft = (revisionId: string, lineId: string) => {
    setPricingSaveError(null);
    setLineDrafts((prev) => {
      const revMap = { ...prev[revisionId] };
      delete revMap[lineId];
      return { ...prev, [revisionId]: revMap };
    });
  };

  const saveSingleLine = (current: QuotationRevision, item: QuotationLine) => {
    const patch = lineDrafts[current.id]?.[item.id];
    if (!patch || !isLinePatchDirty(item, patch)) return;
    if (
      !isValidRateString(patch.supplyRate) ||
      !isValidRateString(patch.labourRate) ||
      !isValidRateString(patch.miscellaneousRate) ||
      !isValidRateString(patch.markupPercent, 1000)
    ) {
      toast.error(
        "Enter valid non-negative decimals for Supply, Labour, Misc, and Markup (0–1000%).",
      );
      return;
    }
    saveLinesPricing.mutate({
      revisionId: current.id,
      expectedVersion: current.rowVersion,
      updates: [
        {
          lineId: item.id,
          expectedLineVersion: item.rowVersion,
          ...(patch.offeringId ? { offeringId: patch.offeringId } : {}),
          supplyRate: patch.supplyRate.trim(),
          labourRate: patch.labourRate.trim(),
          miscellaneousRate: patch.miscellaneousRate.trim(),
          markupPercent: patch.markupPercent.trim(),
          notes: patch.notes.trim() || null,
        },
      ],
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-7xl space-y-6 p-4 pb-24 sm:p-6">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="-ml-2 h-8 text-xs" variant="ghost">
              <Link to="/engineering/quotations">
                <ArrowLeft className="mr-1.5 size-3.5" />
                Quotations
              </Link>
            </Button>
            <Separator orientation="vertical" className="hidden h-5 sm:block" />
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {context.leadNumber}
                </span>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {quotation?.quotationNumber ?? "New Quotation Workspace"}
                </h1>
                {latest && <StatusBadge status={latest.status} />}
              </div>
              <p className="text-xs text-muted-foreground">
                Project:{" "}
                <strong className="text-foreground">{job.title}</strong> ·
                Client:{" "}
                <strong className="text-foreground">
                  {context.customerName}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link to={`/engineering/design-jobs/${job.id}/boq`}>
                BOQ Workspace
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link to={`/engineering/design-jobs/${job.id}`}>Design Job</Link>
            </Button>
            {canCreate && (
              <>
                <Separator
                  orientation="vertical"
                  className="hidden h-5 sm:block"
                />
                <Button
                  onClick={() => {
                    setBoqRevisionId(eligibleBoqs[0]!.id);
                    setSourceRevisionId(
                      latest &&
                        ["returned", "issued", "declined"].includes(
                          latest.status,
                        )
                        ? latest.id
                        : "none",
                    );
                    openModal("create");
                  }}
                  size="sm"
                  className="h-8 text-xs"
                >
                  <Plus className="mr-1.5 size-3.5" />
                  New Quotation Revision
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPI Overview Strip */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-2xs">
            <CardHeader className="p-3.5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide">
                Commercial State
              </CardDescription>
              <div className="pt-1">
                <StatusBadge status={context.opportunityCommercialState} />
              </div>
            </CardHeader>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-3.5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide">
                Approved BOQ Baseline
              </CardDescription>
              <CardTitle className="pt-1 text-sm font-semibold tabular-nums">
                {eligibleBoqs.length} approved revision
                {eligibleBoqs.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-3.5">
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide">
                Customer PDF Layout
              </CardDescription>
              <CardTitle className="flex items-center gap-1.5 pt-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <Sparkles className="size-4" />
                Demo / 7-Column Redacted PDF
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {eligibleBoqs.length === 0 && (
          <Alert>
            <AlertCircle className="size-4 text-primary" />
            <AlertTitle className="text-xs font-semibold">
              Approved BOQ Required
            </AlertTitle>
            <AlertDescription className="mt-0.5 text-xs text-muted-foreground">
              An internally approved technical BOQ revision is mandatory before
              quotation preparation can proceed.
            </AlertDescription>
          </Alert>
        )}

        {/* Revisions Stack */}
        <section className="space-y-4">
          {revisions.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2.5 size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                No quotation revisions prepared yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs">
                Click "New Quotation Revision" to inherit technical items and
                approved costing options from the BOQ.
              </p>
            </div>
          ) : (
            revisions.map((current, index) => {
              const isLatest = index === 0;
              const isExpanded = expandedRevisions[current.id] ?? isLatest;
              const revDraftMap = lineDrafts[current.id] ?? {};
              const hasPendingEdits = current.lines.some((item) =>
                isLinePatchDirty(item, revDraftMap[item.id]),
              );
              const isEditableDraft =
                capabilities.canWrite && current.status === "draft";

              const projectedTotals = (() => {
                if (!hasPendingEdits) {
                  return {
                    subtotal: current.subtotal,
                    grandTotal: current.grandTotal,
                    isPreview: false,
                  };
                }
                let subtotalNum = 0;
                for (const item of current.lines) {
                  const patch = revDraftMap[item.id];
                  if (patch && isLinePatchDirty(item, patch)) {
                    const preview = calculateQuotationLinePreview({
                      quantity: item.quantity,
                      supplyRate: patch.supplyRate,
                      labourRate: patch.labourRate,
                      miscellaneousRate: patch.miscellaneousRate,
                      markupPercent: patch.markupPercent,
                    });
                    subtotalNum += Number(
                      preview.valid ? preview.lineTotal : item.lineTotal,
                    );
                  } else {
                    subtotalNum += Number(item.lineTotal);
                  }
                }
                const grandNum = Math.max(
                  0,
                  subtotalNum -
                    Number(current.lineDiscountTotal) -
                    Number(current.additionalDiscount) +
                    Number(current.taxAmount) +
                    Number(current.roundingAdjustment),
                );
                return {
                  subtotal: subtotalNum.toFixed(2),
                  grandTotal: grandNum.toFixed(2),
                  isPreview: true,
                };
              })();

              const sections = [
                ...new Set(current.lines.map((l) => l.section)),
              ].sort();
              const brands = [
                ...new Set(
                  current.lines
                    .map((l) =>
                      revDraftMap[l.id]?.offeringId
                        ? (l.offeringOptions.find(
                            (o) => o.id === revDraftMap[l.id]!.offeringId,
                          )?.brandName ?? l.brandName)
                        : l.brandName,
                    )
                    .filter((b): b is string => Boolean(b)),
                ),
              ].sort();
              const needle = lineSearch.trim().toLowerCase();
              const filteredLines = current.lines.filter((item) => {
                const effOfferingId =
                  revDraftMap[item.id]?.offeringId !== undefined
                    ? revDraftMap[item.id]!.offeringId
                    : item.offeringId;
                const effBrand =
                  (effOfferingId
                    ? item.offeringOptions.find((o) => o.id === effOfferingId)
                        ?.brandName
                    : null) ?? item.brandName;
                if (sectionFilter !== "all" && item.section !== sectionFilter)
                  return false;
                if (brandFilter === "__unselected" && effOfferingId)
                  return false;
                if (
                  brandFilter !== "all" &&
                  brandFilter !== "__unselected" &&
                  effBrand !== brandFilter
                )
                  return false;
                if (selectionFilter === "selected" && !effOfferingId)
                  return false;
                if (selectionFilter === "unselected" && effOfferingId)
                  return false;
                if (needle) {
                  const hay =
                    `${item.itemCode} ${item.itemName} ${item.specification} ${item.section} ${effBrand ?? ""} ${item.manufacturerModel ?? ""} ${item.manufacturerSku ?? ""}`.toLowerCase();
                  if (!hay.includes(needle)) return false;
                }
                return true;
              });
              const hasFilters =
                Boolean(needle) ||
                sectionFilter !== "all" ||
                brandFilter !== "all" ||
                selectionFilter !== "all";

              return (
                <Card key={current.id} className="overflow-hidden shadow-xs">
                  <CardHeader className="border-b bg-card/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRevisions((prev) => ({
                                ...prev,
                                [current.id]: !isExpanded,
                              }))
                            }
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1.5 rounded-md text-left hover:text-primary"
                          >
                            <ChevronDown
                              className={cn(
                                "size-4 text-muted-foreground transition-transform duration-200",
                                !isExpanded && "-rotate-90",
                              )}
                            />
                            <Badge
                              variant="secondary"
                              className="font-mono text-xs font-semibold"
                            >
                              R{current.revisionNumber}
                            </Badge>
                          </button>
                          <StatusBadge status={current.status} />
                          {current.issueDocument?.isDemo && (
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px]"
                            >
                              Demo PDF
                            </Badge>
                          )}
                          {!isExpanded && (
                            <span className="text-xs font-medium text-foreground truncate max-w-[260px]">
                              {current.title}
                            </span>
                          )}
                          {!isExpanded && (
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {current.lines.length} line(s) ·{" "}
                              {money(
                                current.currency,
                                projectedTotals.grandTotal,
                              )}
                            </span>
                          )}
                        </div>

                        {isExpanded && (
                          <>
                            <CardTitle className="text-base font-semibold sm:text-lg">
                              {current.title}
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <CardDescription className="text-xs">
                                BOQ R
                                <strong className="font-mono">
                                  {eligibleBoqs.find(
                                    (item) => item.id === current.boqRevisionId,
                                  )?.revisionNumber ?? "historical"}
                                </strong>{" "}
                                · Validity: {current.validityDays}d
                              </CardDescription>
                              <QuotationStageStepper
                                steps={getStageSteps(current.status)}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Revision Action Bar */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isEditableDraft && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openModal("header", current)}
                            >
                              <Pencil className="mr-1 size-3.5" />
                              Terms & Totals
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openModal("document", current)}
                            >
                              <Pencil className="mr-1 size-3.5" />
                              Document Details
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={
                                hasPendingEdits ||
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
                              <Send className="mr-1 size-3.5" />
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
                                <ShieldCheck className="mr-1 size-3.5" />
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
                              <FileText className="mr-1 size-3.5" />
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
                                <CheckCircle2 className="mr-1 size-3.5" />
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
                              <Download className="mr-1 size-3.5" />
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
                            <FileText className="mr-1 size-3.5" />
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
                            <FileSpreadsheet className="mr-1 size-3.5" />
                            Excel
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="body"
                        {...COLLAPSIBLE_PANEL}
                        className="overflow-hidden"
                      >
                        <CardContent className="space-y-6 p-4 sm:p-5">
                          {/* Contributor Self-Approval Warning */}
                          {current.status === "submitted" &&
                            current.isContributor &&
                            capabilities.canApprove &&
                            !capabilities.canOverrideApprovals && (
                              <Alert className="border-amber-500/20 bg-amber-500/10">
                                <BadgeAlert className="size-4 text-amber-600" />
                                <AlertTitle className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                                  Independent Approval Required
                                </AlertTitle>
                                <AlertDescription className="mt-0.5 text-xs text-muted-foreground">
                                  You contributed to this quotation revision.
                                  Separation of duties requires a different
                                  authorized reviewer to approve or return it.
                                </AlertDescription>
                              </Alert>
                            )}

                          {isEditableDraft && pricingSaveError && (
                            <Alert variant="destructive">
                              <AlertCircle className="size-4" />
                              <AlertTitle className="text-xs font-semibold">
                                Unable to save pricing changes
                              </AlertTitle>
                              <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span>{pricingSaveError}</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setPricingSaveError(null);
                                    void invalidate();
                                  }}
                                >
                                  <RefreshCw className="mr-1 size-3" />
                                  Reload Server Data
                                </Button>
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Commercial Metrics Strip */}
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <MetricCard
                              label="Subtotal (Ex-Works)"
                              value={money(
                                current.currency,
                                projectedTotals.subtotal,
                              )}
                              badge={
                                projectedTotals.isPreview
                                  ? "Live preview"
                                  : undefined
                              }
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
                              label={
                                current.taxLabel ?? "Tax / GST (unconfigured)"
                              }
                              value={money(current.currency, current.taxAmount)}
                            />
                            <MetricCard
                              label="Quotation Grand Total"
                              value={money(
                                current.currency,
                                projectedTotals.grandTotal,
                              )}
                              strong
                              badge={
                                projectedTotals.isPreview
                                  ? "Live preview"
                                  : undefined
                              }
                            />
                          </div>

                          {/* 11-Column In-Place Commercial Pricing Table */}
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                  <Layers className="size-4 text-primary" />
                                  Scope &amp; Commercial Pricing Breakdown
                                </h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {isEditableDraft
                                    ? "Edit Brand/Make, Supply Rate, Labour, Misc, and Markup % directly in-place — Unit Rate, Amount, and Grand Total recalculate immediately."
                                    : "Internal Supply, Labour, Markup, and Misc breakdown shown here; customer PDFs show all-inclusive Unit Rate only."}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {isEditableDraft && hasPendingEdits && (
                                  <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px]">
                                    Unsaved edits
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className="font-mono text-xs tabular-nums"
                                >
                                  Showing {filteredLines.length} of{" "}
                                  {current.lines.length} Line(s)
                                </Badge>
                              </div>
                            </div>

                            {/* Search & Filter Toolbar */}
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
                              <div className="relative min-w-[210px] flex-1">
                                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                                <Input
                                  value={lineSearch}
                                  onChange={(e) =>
                                    setLineSearch(e.target.value)
                                  }
                                  placeholder="Search item code, description, brand, model, SKU…"
                                  className="h-8 bg-background pl-8 pr-7 text-xs"
                                />
                                {lineSearch && (
                                  <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => setLineSearch("")}
                                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </div>
                              <Select
                                value={sectionFilter}
                                onValueChange={setSectionFilter}
                              >
                                <SelectTrigger className="h-8 w-[155px] bg-background text-xs">
                                  <SelectValue placeholder="Section" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">
                                    All sections
                                  </SelectItem>
                                  {sections.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={brandFilter}
                                onValueChange={setBrandFilter}
                              >
                                <SelectTrigger className="h-8 w-[155px] bg-background text-xs">
                                  <SelectValue placeholder="Make / Brand" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">
                                    All brands
                                  </SelectItem>
                                  <SelectItem value="__unselected">
                                    Unselected make
                                  </SelectItem>
                                  {brands.map((b) => (
                                    <SelectItem key={b} value={b}>
                                      {b}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={selectionFilter}
                                onValueChange={(v) =>
                                  setSelectionFilter(
                                    v as "all" | "selected" | "unselected",
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-[155px] bg-background text-xs">
                                  <SelectValue placeholder="Selection status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All lines</SelectItem>
                                  <SelectItem value="unselected">
                                    Offering required
                                  </SelectItem>
                                  <SelectItem value="selected">
                                    Make selected
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              {hasFilters && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => {
                                    setLineSearch("");
                                    setSectionFilter("all");
                                    setBrandFilter("all");
                                    setSelectionFilter("all");
                                  }}
                                >
                                  Clear filters
                                </Button>
                              )}
                            </div>

                            <div className="max-h-[34rem] overflow-auto rounded-lg border bg-card">
                              <Table>
                                <TableHeader className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-xs">
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-10 px-2.5 py-2 text-center text-xs font-semibold">
                                      #
                                    </TableHead>
                                    <TableHead className="min-w-[210px] max-w-[300px] px-3 py-2 text-xs font-semibold">
                                      Item / Specification
                                    </TableHead>
                                    <TableHead className="min-w-[190px] px-3 py-2 text-xs font-semibold">
                                      Selected Brand &amp; Make
                                    </TableHead>
                                    <TableHead className="min-w-[75px] px-2.5 py-2 text-right text-xs font-semibold">
                                      Qty
                                    </TableHead>
                                    <TableHead className="min-w-[104px] px-2 py-2 text-right text-xs font-semibold">
                                      Supply Rate
                                    </TableHead>
                                    <TableHead className="min-w-[104px] px-2 py-2 text-right text-xs font-semibold">
                                      Labour
                                    </TableHead>
                                    <TableHead className="min-w-[96px] px-2 py-2 text-right text-xs font-semibold">
                                      Misc.
                                    </TableHead>
                                    <TableHead className="min-w-[116px] px-2 py-2 text-right text-xs font-semibold">
                                      Markup %
                                    </TableHead>
                                    <TableHead className="min-w-[102px] px-3 py-2 text-right text-xs font-semibold">
                                      Unit Rate
                                    </TableHead>
                                    <TableHead className="min-w-[112px] px-3 py-2 text-right text-xs font-semibold">
                                      Amount
                                    </TableHead>
                                    {isEditableDraft && (
                                      <TableHead className="w-24 px-2 py-2 text-center text-xs font-semibold">
                                        Actions
                                      </TableHead>
                                    )}
                                  </TableRow>
                                </TableHeader>

                                <TableBody>
                                  {filteredLines.length === 0 ? (
                                    <TableRow>
                                      <TableCell
                                        colSpan={isEditableDraft ? 11 : 10}
                                        className="h-24 text-center text-xs text-muted-foreground"
                                      >
                                        No quotation lines match the current
                                        filters.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    filteredLines.map((item) => {
                                      const patch = revDraftMap[item.id];
                                      const baseline = buildLineBaseline(item);
                                      const effective = patch ?? baseline;
                                      const dirty = isLinePatchDirty(
                                        item,
                                        patch,
                                      );
                                      const isConfigured = Boolean(
                                        effective.offeringId,
                                      );
                                      const selectedOption =
                                        effective.offeringId
                                          ? item.offeringOptions.find(
                                              (o) =>
                                                o.id === effective.offeringId,
                                            )
                                          : undefined;

                                      const supplyValid = isValidRateString(
                                        effective.supplyRate,
                                      );
                                      const labourValid = isValidRateString(
                                        effective.labourRate,
                                      );
                                      const miscValid = isValidRateString(
                                        effective.miscellaneousRate,
                                      );
                                      const markupValid = isValidRateString(
                                        effective.markupPercent,
                                        1000,
                                      );
                                      const rowValid =
                                        supplyValid &&
                                        labourValid &&
                                        miscValid &&
                                        markupValid;

                                      const preview = dirty
                                        ? calculateQuotationLinePreview({
                                            quantity: item.quantity,
                                            supplyRate: effective.supplyRate,
                                            labourRate: effective.labourRate,
                                            miscellaneousRate:
                                              effective.miscellaneousRate,
                                            markupPercent:
                                              effective.markupPercent,
                                          })
                                        : {
                                            valid: true,
                                            markupAmount: item.markupAmount,
                                            quotedUnitRate: item.quotedUnitRate,
                                            lineTotal: item.lineTotal,
                                          };

                                      const onKeyDownCell = (
                                        e: React.KeyboardEvent<HTMLInputElement>,
                                      ) => {
                                        if (e.key === "Escape") {
                                          e.preventDefault();
                                          revertLineDraft(current.id, item.id);
                                        } else if (
                                          e.key === "Enter" &&
                                          dirty &&
                                          rowValid
                                        ) {
                                          e.preventDefault();
                                          saveSingleLine(current, item);
                                        }
                                      };

                                      return (
                                        <TableRow
                                          key={item.id}
                                          className={cn(
                                            "align-top transition-colors duration-150",
                                            dirty
                                              ? "bg-amber-500/[0.06]"
                                              : !isConfigured
                                                ? "bg-destructive/[0.03]"
                                                : "hover:bg-muted/40",
                                          )}
                                        >
                                          <TableCell className="px-2.5 py-2.5 text-center font-mono text-xs text-muted-foreground">
                                            {item.lineNumber}
                                          </TableCell>

                                          <TableCell className="max-w-[300px] px-3 py-2.5">
                                            <p className="text-xs font-semibold text-foreground">
                                              {item.itemName}
                                            </p>
                                            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
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
                                            {!isEditableDraft && item.notes && (
                                              <p className="mt-1 rounded bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                Note: {item.notes}
                                              </p>
                                            )}
                                          </TableCell>

                                          <TableCell className="px-3 py-2">
                                            {isEditableDraft ? (
                                              <InlineOfferingSelector
                                                currency={current.currency}
                                                selectedOfferingId={
                                                  effective.offeringId
                                                }
                                                options={item.offeringOptions}
                                                onSelect={(option) => {
                                                  patchLineDraft(
                                                    current.id,
                                                    item,
                                                    (prev) => ({
                                                      ...prev,
                                                      offeringId: option.id,
                                                      supplyRate:
                                                        trimDecimalInput(
                                                          option.supplyRate,
                                                        ),
                                                      labourRate:
                                                        trimDecimalInput(
                                                          option.labourRate,
                                                        ),
                                                      miscellaneousRate:
                                                        trimDecimalInput(
                                                          option.miscellaneousRate,
                                                        ),
                                                      markupPercent:
                                                        trimDecimalInput(
                                                          option.markupPercent,
                                                        ),
                                                    }),
                                                  );
                                                }}
                                              />
                                            ) : effective.offeringId ? (
                                              <div className="space-y-1">
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] font-medium"
                                                >
                                                  {selectedOption?.brandName ??
                                                    item.brandName ??
                                                    "Unbranded"}
                                                </Badge>
                                                <p className="text-xs font-medium text-foreground">
                                                  {selectedOption?.manufacturerModel ??
                                                    item.manufacturerModel}
                                                </p>
                                                {(selectedOption?.manufacturerSku ??
                                                  item.manufacturerSku) && (
                                                  <p className="font-mono text-[10px] text-muted-foreground">
                                                    SKU:{" "}
                                                    {selectedOption?.manufacturerSku ??
                                                      item.manufacturerSku}
                                                  </p>
                                                )}
                                              </div>
                                            ) : (
                                              <Badge
                                                variant="outline"
                                                className="border-destructive/30 bg-destructive/5 text-[10px] text-destructive"
                                              >
                                                Offering required
                                              </Badge>
                                            )}
                                          </TableCell>

                                          <TableCell className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-xs tabular-nums">
                                            {item.quantity} {item.unitSymbol}
                                          </TableCell>

                                          {/* Supply Rate */}
                                          <TableCell className="px-2 py-2 text-right tabular-nums">
                                            {isEditableDraft ? (
                                              <Input
                                                aria-label={`Supply rate line ${item.lineNumber}`}
                                                inputMode="decimal"
                                                value={effective.supplyRate}
                                                onKeyDown={onKeyDownCell}
                                                onChange={(e) => {
                                                  const value = e.target.value;
                                                  patchLineDraft(
                                                    current.id,
                                                    item,
                                                    (prev) => ({
                                                      ...prev,
                                                      supplyRate: value,
                                                    }),
                                                  );
                                                }}
                                                className={cn(
                                                  "ml-auto h-8 w-24 text-right font-mono text-xs tabular-nums",
                                                  !supplyValid &&
                                                    "border-destructive focus-visible:ring-destructive",
                                                  supplyValid &&
                                                    !sameDecimal(
                                                      effective.supplyRate,
                                                      item.supplyRate,
                                                    ) &&
                                                    "border-amber-500/60 bg-amber-500/5",
                                                )}
                                              />
                                            ) : (
                                              <span className="text-xs tabular-nums font-mono">
                                                {money(
                                                  current.currency,
                                                  item.supplyRate,
                                                )}
                                              </span>
                                            )}
                                          </TableCell>

                                          {/* Labour Rate */}
                                          <TableCell className="px-2 py-2 text-right tabular-nums">
                                            {isEditableDraft ? (
                                              <Input
                                                aria-label={`Labour rate line ${item.lineNumber}`}
                                                inputMode="decimal"
                                                value={effective.labourRate}
                                                onKeyDown={onKeyDownCell}
                                                onChange={(e) => {
                                                  const value = e.target.value;
                                                  patchLineDraft(
                                                    current.id,
                                                    item,
                                                    (prev) => ({
                                                      ...prev,
                                                      labourRate: value,
                                                    }),
                                                  );
                                                }}
                                                className={cn(
                                                  "ml-auto h-8 w-24 text-right font-mono text-xs tabular-nums",
                                                  !labourValid &&
                                                    "border-destructive focus-visible:ring-destructive",
                                                  labourValid &&
                                                    !sameDecimal(
                                                      effective.labourRate,
                                                      item.labourRate,
                                                    ) &&
                                                    "border-amber-500/60 bg-amber-500/5",
                                                )}
                                              />
                                            ) : (
                                              <span className="text-xs tabular-nums font-mono">
                                                {money(
                                                  current.currency,
                                                  item.labourRate,
                                                )}
                                              </span>
                                            )}
                                          </TableCell>

                                          {/* Miscellaneous Rate */}
                                          <TableCell className="px-2 py-2 text-right tabular-nums">
                                            {isEditableDraft ? (
                                              <Input
                                                aria-label={`Miscellaneous rate line ${item.lineNumber}`}
                                                inputMode="decimal"
                                                value={
                                                  effective.miscellaneousRate
                                                }
                                                onKeyDown={onKeyDownCell}
                                                onChange={(e) => {
                                                  const value = e.target.value;
                                                  patchLineDraft(
                                                    current.id,
                                                    item,
                                                    (prev) => ({
                                                      ...prev,
                                                      miscellaneousRate: value,
                                                    }),
                                                  );
                                                }}
                                                className={cn(
                                                  "ml-auto h-8 w-22 text-right font-mono text-xs tabular-nums",
                                                  !miscValid &&
                                                    "border-destructive focus-visible:ring-destructive",
                                                  miscValid &&
                                                    !sameDecimal(
                                                      effective.miscellaneousRate,
                                                      item.miscellaneousRate,
                                                    ) &&
                                                    "border-amber-500/60 bg-amber-500/5",
                                                )}
                                              />
                                            ) : (
                                              <span className="text-xs tabular-nums font-mono">
                                                {money(
                                                  current.currency,
                                                  item.miscellaneousRate,
                                                )}
                                              </span>
                                            )}
                                          </TableCell>

                                          {/* Markup % & Computed Markup Amount */}
                                          <TableCell className="px-2 py-2 text-right tabular-nums">
                                            {isEditableDraft ? (
                                              <div className="ml-auto flex flex-col items-end gap-0.5">
                                                <div className="relative flex items-center">
                                                  <Input
                                                    aria-label={`Markup percent line ${item.lineNumber}`}
                                                    inputMode="decimal"
                                                    value={
                                                      effective.markupPercent
                                                    }
                                                    onKeyDown={onKeyDownCell}
                                                    onChange={(e) => {
                                                      const value =
                                                        e.target.value;
                                                      patchLineDraft(
                                                        current.id,
                                                        item,
                                                        (prev) => ({
                                                          ...prev,
                                                          markupPercent: value,
                                                        }),
                                                      );
                                                    }}
                                                    className={cn(
                                                      "h-8 w-24 pr-5 text-right font-mono text-xs tabular-nums",
                                                      !markupValid &&
                                                        "border-destructive focus-visible:ring-destructive",
                                                      markupValid &&
                                                        !sameDecimal(
                                                          effective.markupPercent,
                                                          item.markupPercent,
                                                        ) &&
                                                        "border-amber-500/60 bg-amber-500/5",
                                                    )}
                                                  />
                                                  <span className="pointer-events-none absolute right-2 text-[11px] text-muted-foreground">
                                                    %
                                                  </span>
                                                </div>
                                                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                                                  {preview.valid
                                                    ? money(
                                                        current.currency,
                                                        preview.markupAmount,
                                                      )
                                                    : "Invalid"}
                                                </span>
                                              </div>
                                            ) : (
                                              <>
                                                <span className="font-mono text-[11px] tabular-nums">
                                                  {item.markupPercent}%
                                                </span>
                                                <span className="block font-mono text-[10px] text-muted-foreground tabular-nums">
                                                  {money(
                                                    current.currency,
                                                    item.markupAmount,
                                                  )}
                                                </span>
                                              </>
                                            )}
                                          </TableCell>

                                          {/* Calculated Quoted Unit Rate */}
                                          <TableCell className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                                            {preview.valid
                                              ? money(
                                                  current.currency,
                                                  preview.quotedUnitRate,
                                                )
                                              : "—"}
                                          </TableCell>

                                          {/* Calculated Line Amount */}
                                          <TableCell className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-foreground tabular-nums">
                                            {preview.valid
                                              ? money(
                                                  current.currency,
                                                  preview.lineTotal,
                                                )
                                              : "—"}
                                          </TableCell>

                                          {/* Inline Actions (Notes Popover, Save Row, Revert Row) */}
                                          {isEditableDraft && (
                                            <TableCell className="px-2 py-2 text-center">
                                              <div className="flex items-center justify-center gap-0.5">
                                                <InlineLineNotesPopover
                                                  notes={effective.notes}
                                                  hasNotes={Boolean(
                                                    effective.notes.trim(),
                                                  )}
                                                  onChange={(nextNotes) =>
                                                    patchLineDraft(
                                                      current.id,
                                                      item,
                                                      (prev) => ({
                                                        ...prev,
                                                        notes: nextNotes,
                                                      }),
                                                    )
                                                  }
                                                />
                                                {dirty && (
                                                  <>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Button
                                                          size="icon-sm"
                                                          variant="ghost"
                                                          disabled={
                                                            !rowValid ||
                                                            saveLinesPricing.isPending
                                                          }
                                                          className="size-7 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                                          aria-label={`Save pricing for line ${item.lineNumber}`}
                                                          onClick={() =>
                                                            saveSingleLine(
                                                              current,
                                                              item,
                                                            )
                                                          }
                                                        >
                                                          <Check className="size-3.5" />
                                                        </Button>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        Save row (Enter)
                                                      </TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Button
                                                          size="icon-sm"
                                                          variant="ghost"
                                                          className="size-7 text-muted-foreground hover:text-foreground"
                                                          aria-label={`Revert line ${item.lineNumber}`}
                                                          onClick={() =>
                                                            revertLineDraft(
                                                              current.id,
                                                              item.id,
                                                            )
                                                          }
                                                        >
                                                          <RotateCcw className="size-3.5" />
                                                        </Button>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        Revert row (Esc)
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </>
                                                )}
                                              </div>
                                            </TableCell>
                                          )}
                                        </TableRow>
                                      );
                                    })
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>

                          {/* Commercial Terms Strip */}
                          <div className="grid gap-3 lg:grid-cols-3">
                            <TermCard
                              title="Exclusions Scope"
                              value={current.exclusions}
                            />
                            <TermCard
                              title="Delivery &amp; Freight Terms"
                              value={current.deliveryTerms}
                            />
                            <TermCard
                              title="Payment Conditions"
                              value={current.paymentTerms}
                            />
                          </div>

                          {/* Payment Plan Section */}
                          {capabilities.canViewPaymentPlan ? (
                            <Card className="border-border/70 bg-muted/20 shadow-2xs">
                              <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
                                <div className="space-y-0.5">
                                  <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                                    <CreditCard className="size-4 text-primary" />
                                    Commercial Payment Plan
                                  </CardTitle>
                                  <CardDescription className="text-xs">
                                    Provisional breakdown against full{" "}
                                    {money(
                                      current.currency,
                                      current.grandTotal,
                                    )}{" "}
                                    basis (does not imply actual receipt).
                                  </CardDescription>
                                </div>
                                {capabilities.canWritePaymentPlan &&
                                  current.status === "accepted" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() =>
                                        openModal("payment", current)
                                      }
                                    >
                                      <Pencil className="mr-1 size-3.5" />
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
                                    Payment distribution is configured after
                                    quotation acceptance. Cash and non-cash
                                    percentages must sum to 100%.
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
                                Sensitive commercial payment terms are redacted
                                based on your role assignments.
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
                              <AlertDescription className="mt-0.5 text-xs text-muted-foreground">
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
                                Customer Decision:{" "}
                                {current.customerDecision.decision}
                              </AlertTitle>
                              <AlertDescription className="mt-0.5 text-xs text-muted-foreground">
                                Traceable Evidence:{" "}
                                <strong className="text-foreground">
                                  {current.customerDecision.evidenceReference}
                                </strong>
                                {current.customerDecision
                                  .customerOrderReference && (
                                  <span>
                                    {" "}
                                    · PO / Order Ref:{" "}
                                    {
                                      current.customerDecision
                                        .customerOrderReference
                                    }
                                  </span>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })
          )}
        </section>

        {/* Animated Floating Unsaved Pricing Bar */}
        <AnimatePresence>
          {activeDraftRevision && activeDirtyState.updates.length > 0 && (
            <motion.div
              {...FLOATING_BAR}
              className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-border/80 bg-background/95 px-4 py-2.5 shadow-2xl backdrop-blur-md"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-foreground tabular-nums">
                  {activeDirtyState.updates.length} edited line(s)
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  Projected Total:{" "}
                  <strong className="text-foreground">
                    {money(
                      activeDraftRevision.currency,
                      activeDirtyState.projectedGrandTotal,
                    )}
                  </strong>
                </span>
                {activeDirtyState.invalidCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-600 dark:text-rose-400"
                  >
                    {activeDirtyState.invalidCount} invalid value(s)
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={saveLinesPricing.isPending}
                  onClick={() => {
                    setPricingSaveError(null);
                    setLineDrafts((prev) => ({
                      ...prev,
                      [activeDraftRevision.id]: {},
                    }));
                  }}
                >
                  <RotateCcw className="mr-1 size-3.5" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={
                    saveLinesPricing.isPending ||
                    activeDirtyState.invalidCount > 0
                  }
                  onClick={() => {
                    saveLinesPricing.mutate({
                      revisionId: activeDraftRevision.id,
                      expectedVersion: activeDraftRevision.rowVersion,
                      updates: activeDirtyState.updates,
                    });
                  }}
                >
                  {saveLinesPricing.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="mr-1.5 size-3.5" />
                      Save Pricing Changes
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Controller */}
        <QuotationDialog
          modal={modal}
          revision={revision}
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
          leadOutcome={leadOutcome}
          setLeadOutcome={setLeadOutcome}
          busy={editor.isPending}
          error={editor.isError ? getApiErrorMessage(editor.error) : undefined}
          onClose={close}
          onSubmit={(form) => editor.mutate(form)}
        />
      </main>
    </TooltipProvider>
  );
}

function QuotationStageStepper({ steps }: { steps: StageStep[] }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      aria-label="Quotation stage progress"
    >
      {steps.map((step, idx) => (
        <div key={step.key} className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200",
              step.state === "done" &&
                "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              step.state === "active" &&
                "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold",
              step.state === "attention" &&
                "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold",
              step.state === "danger" &&
                "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold",
              step.state === "upcoming" &&
                "border-border/60 bg-muted/40 text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {idx < steps.length - 1 && (
            <span className="text-[10px] text-muted-foreground/60">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function InlineOfferingSelector({
  currency,
  selectedOfferingId,
  options,
  onSelect,
}: {
  currency: string;
  selectedOfferingId: string | null;
  options: QuotationLine["offeringOptions"];
  onSelect: (option: QuotationLine["offeringOptions"][number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = selectedOfferingId
    ? options.find((o) => o.id === selectedOfferingId)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-auto min-h-8 w-full justify-between px-2.5 py-1.5 text-left text-xs font-normal",
            !selected && "border-destructive/40 bg-destructive/5",
          )}
        >
          {selected ? (
            <div className="min-w-0 flex-1 space-y-0.5 pr-1">
              <div className="flex items-center gap-1">
                <span className="truncate font-semibold text-foreground">
                  {selected.brandName ?? "Unbranded"}
                </span>
                {selected.isPreferred && (
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 text-[9px] font-medium"
                  >
                    Pref
                  </Badge>
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {selected.manufacturerModel}
              </p>
            </div>
          ) : (
            <span className="text-[11px] font-medium text-destructive">
              Select brand / make…
            </span>
          )}
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        <Command>
          <CommandInput
            placeholder="Search brand, model, SKU…"
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              No approved offering options.
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.brandName ?? "Unbranded"} ${option.manufacturerModel} ${option.manufacturerSku ?? ""}`}
                  onSelect={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  className="flex items-start justify-between gap-2 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          option.id === selectedOfferingId
                            ? "opacity-100 text-primary"
                            : "opacity-0",
                        )}
                      />
                      <span className="font-semibold">
                        {option.brandName ?? "Unbranded"} ·{" "}
                        {option.manufacturerModel}
                      </span>
                    </div>
                    {option.manufacturerSku && (
                      <p className="pl-5 font-mono text-[10px] text-muted-foreground">
                        SKU: {option.manufacturerSku}
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono text-[11px] tabular-nums">
                    <div>{money(currency, option.quotedUnitRate)}</div>
                    {option.isPreferred && (
                      <span className="text-[9px] text-emerald-600 dark:text-emerald-400">
                        Preferred
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InlineLineNotesPopover({
  notes,
  hasNotes,
  onChange,
}: {
  notes: string;
  hasNotes: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Edit commercial line note"
              className={cn(
                "relative size-7",
                hasNotes
                  ? "text-primary hover:text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageSquareText className="size-3.5" />
              {hasNotes && (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {hasNotes ? "Edit line note" : "Add line note"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Commercial Line Note</Label>
          <p className="text-[11px] text-muted-foreground">
            Saved together with inline rate updates.
          </p>
        </div>
        <Textarea
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Specific warranty, delivery, or specification remark…"
          className="text-xs leading-relaxed"
        />
      </PopoverContent>
    </Popover>
  );
}

function MetricCard({
  label,
  value,
  strong = false,
  badge,
}: {
  label: string;
  value: string;
  strong?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 shadow-2xs transition-colors duration-150",
        strong ? "border-primary/20 bg-primary/5" : "bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        {badge && (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-700 dark:text-amber-300"
          >
            {badge}
          </Badge>
        )}
      </div>
      <p
        className={cn(
          "mt-0.5 font-mono tabular-nums",
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
    <div className="space-y-1.5 rounded-lg border bg-card p-3.5 shadow-2xs">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <p className="max-h-36 overflow-y-auto whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted-foreground">
        {value || "No special conditions specified."}
      </p>
    </div>
  );
}

function QuotationDialog({
  defaults,
  modal,
  revision,
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
  leadOutcome,
  setLeadOutcome,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  defaults: { exclusions: string; deliveryTerms: string; paymentTerms: string };
  modal?: Modal;
  revision?: QuotationRevision;
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
  leadOutcome: QuotationDeclineOutcome;
  setLeadOutcome: (v: QuotationDeclineOutcome) => void;
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
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b p-5 pb-3">
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
                    : modal === "document"
                      ? "Preserve configurable sender and customer letterhead details for generated PDFs."
                      : "Identify traceable proof of the customer's decision (3–1,000 characters required)."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Modal: Document Details */}
            {modal === "document" && revision && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 border-b pb-1">
                    <Building2 className="size-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Banking &amp; Authorization
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

                <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
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
                <Alert className="border-amber-500/20 bg-amber-500/10">
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
                {modal === "declined" && (
                  <SelectField
                    label="Lead & Opportunity Outcome *"
                    value={leadOutcome}
                    onValueChange={(value) =>
                      setLeadOutcome(value as QuotationDeclineOutcome)
                    }
                    items={[
                      {
                        value: "keep_negotiating",
                        label:
                          "Keep in Commercial Negotiation (prepare new quotation revision)",
                      },
                      {
                        value: "put_on_hold",
                        label: "Put Lead, Opportunity & Design On Hold",
                      },
                      {
                        value: "mark_lost",
                        label:
                          "Mark Lead & Opportunity Lost (cancel active design)",
                      },
                    ]}
                  />
                )}
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
                        "font-mono text-[10px]",
                        evidenceText.length >= 3 && evidenceText.length <= 1000
                          ? "text-muted-foreground"
                          : "font-semibold text-destructive",
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
                    <span className="font-mono text-[10px] text-muted-foreground">
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

          <DialogFooter className="shrink-0 border-t bg-card p-4">
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
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving…
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
        <SelectTrigger className="h-9 w-full text-xs">
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
