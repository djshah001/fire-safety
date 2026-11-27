import { useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  FolderInput,
  GripVertical,
  Hash,
  Layers,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRoundCheck,
  Wand2,
  X,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  addBoqLines,
  applyBoqTemplate,
  boqPdfUrl,
  boqWorkspaceQuery,
  bulkDeleteBoqLines,
  bulkMarkupBoq,
  bulkUpdateBoqLines,
  createBoqRevision,
  reassignBoqChain,
  refreshBoqCostingRates,
  removeBoqLine,
  reorderBoqLines,
  reviewBoq,
  saveBoqMarkup,
  saveBoqQuantitiesBatch,
  submitBoq,
  submitBoqCosting,
  type BoqChainUser,
  type BoqRevision,
  type BoqTemplateSummary,
  type EstimateLine,
} from "@/api/engineering";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BoqAddItemDialog } from "./BoqAddItemPopover";

type Modal =
  | "create"
  | "add-item"
  | "switch-template"
  | "reassign-chain"
  | "bulk-section"
  | "bulk-quantity"
  | "bulk-delete"
  | "bulk-markup"
  | "markup"
  | "return-purchase"
  | "return-final";

function formatQtyDisplay(qty: string) {
  if (!qty.includes(".")) return qty;
  const trimmed = qty.replace(/\.?0+$/, "");
  return trimmed || "0";
}

function normalizeQtyCompare(raw: string) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw.trim();
  return num.toFixed(4);
}

function ExpandableText({
  text,
  limit = 40,
  className,
}: {
  text?: string | null;
  limit?: number;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
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
      // Ignore clipboard write failures
    }
  };

  return (
    <div className={cn("group/text relative", className)}>
      <p
        className={cn(
          "text-xs leading-relaxed text-muted-foreground break-words whitespace-normal",
          !isExpanded && isLong && "line-clamp-2",
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
              setIsExpanded(!isExpanded);
            }}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline focus:outline-hidden"
          >
            {isExpanded ? (
              <>
                Show less <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            title="Copy text"
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground opacity-0 group-hover/text:opacity-100 transition-opacity"
          >
            {copied ? (
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Copied
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <Copy className="h-3 w-3" /> Copy
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export function BoqWorkspacePage() {
  const { jobId } = useParams();
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const workspace = useQuery(boqWorkspaceQuery(jobId));

  const [modal, setModal] = useState<Modal>();
  const [boq, setBoq] = useState<BoqRevision>();
  const [estimateLine, setEstimateLine] = useState<EstimateLine>();
  const [designRevisionId, setDesignRevisionId] = useState("");
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);

  // Inline quantity state (keyed by lineId -> current input text)
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});

  // Row selection state
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCostIds, setSelectedCostIds] = useState<Set<string>>(
    new Set(),
  );

  // Drag-and-drop state
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null);

  // Template switch state
  const [switchTemplateId, setSwitchTemplateId] = useState("");
  const [switchMode, setSwitchMode] = useState<"append" | "replace">("append");

  // Bulk markup scope state
  const [bulkMarkupScope, setBulkMarkupScope] = useState<
    "selected" | "section" | "all"
  >("selected");
  const [bulkMarkupSection, setBulkMarkupSection] = useState("");

  // Admin chain reassignment state
  const [chainCostingId, setChainCostingId] = useState("");
  const [chainPurchaseHeadId, setChainPurchaseHeadId] = useState("");
  const [chainAdminApproverId, setChainAdminApproverId] = useState("");

  // In-workspace search & filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [qtyStatusFilter, setQtyStatusFilter] = useState<
    "all" | "missing" | "entered"
  >("all");
  const [costStatusFilter, setCostStatusFilter] = useState<
    "all" | "missing_markup" | "stale_rate" | "complete"
  >("all");

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["engineering", "design-job", jobId, "boqs"],
    });

  const handleMutationError = (error: unknown) => {
    const msg = getApiErrorMessage(error);
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      (error as { response?: { status?: number } }).response?.status === 409
    ) {
      setConflictBanner(
        "Another update changed this BOQ version (409 Conflict). Reload the latest BOQ before retrying — your unsaved typed quantities remain preserved.",
      );
    }
    toast.error(msg);
  };

  const close = () => {
    setModal(undefined);
    setBoq(undefined);
    setEstimateLine(undefined);
  };

  const batchQtyMutation = useMutation({
    mutationFn: async ({
      revision,
      updates,
    }: {
      revision: BoqRevision;
      updates: Array<{ lineId: string; quantity: string }>;
    }) => {
      if (!jobId) throw new Error("BOQ workspace is unavailable.");
      return saveBoqQuantitiesBatch(jobId, revision.id, {
        expectedVersion: revision.rowVersion,
        updates,
      });
    },
    async onSuccess(_data, variables) {
      setConflictBanner(null);
      setQtyEdits((prev) => {
        const next = { ...prev };
        for (const u of variables.updates) delete next[u.lineId];
        return next;
      });
      await invalidate();
      toast.success(`Saved ${variables.updates.length} quantity change(s).`);
    },
    onError: handleMutationError,
  });

  const reorderMutation = useMutation({
    mutationFn: async ({
      revision,
      orderedLineIds,
    }: {
      revision: BoqRevision;
      orderedLineIds: string[];
    }) => {
      if (!jobId) throw new Error("BOQ workspace is unavailable.");
      return reorderBoqLines(jobId, revision.id, {
        expectedVersion: revision.rowVersion,
        orderedLineIds,
      });
    },
    async onSuccess() {
      setConflictBanner(null);
      await invalidate();
      toast.success("Line order saved.");
    },
    onError: handleMutationError,
  });

  const removeLineMutation = useMutation({
    mutationFn: async ({
      revision,
      lineId,
    }: {
      revision: BoqRevision;
      lineId: string;
    }) => {
      if (!jobId) throw new Error("BOQ workspace is unavailable.");
      return removeBoqLine(jobId, revision.id, lineId, revision.rowVersion);
    },
    async onSuccess(_data, variables) {
      setConflictBanner(null);
      setSelectedLineIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.lineId);
        return next;
      });
      await invalidate();
      toast.success("Item removed from BOQ.");
    },
    onError: handleMutationError,
  });

  const addItemMutation = useMutation({
    mutationFn: async (input: {
      itemId: string;
      section?: string;
      quantity?: string;
    }) => {
      if (!jobId || !boq) throw new Error("BOQ revision unavailable.");
      return addBoqLines(jobId, boq.id, {
        expectedVersion: boq.rowVersion,
        items: [input],
      });
    },
    async onSuccess() {
      setConflictBanner(null);
      await invalidate();
      close();
      toast.success("Catalogue item added to BOQ.");
    },
    onError: handleMutationError,
  });

  const refreshRatesMutation = useMutation({
    mutationFn: async (revision: BoqRevision) => {
      if (!jobId) throw new Error("BOQ workspace unavailable.");
      return refreshBoqCostingRates(jobId, revision.id, revision.rowVersion);
    },
    async onSuccess() {
      setConflictBanner(null);
      await invalidate();
      toast.success(
        "Costing snapshots refreshed from latest active catalogue rates.",
      );
    },
    onError: handleMutationError,
  });

  const formMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !workspace.data || !modal) {
        throw new Error("BOQ workspace is unavailable.");
      }
      if (modal === "create") {
        const source = workspace.data.boqs[0];
        return createBoqRevision(jobId, {
          designRevisionId,
          sourceBoqRevisionId:
            source && ["returned", "approved"].includes(source.status)
              ? source.id
              : undefined,
          title: String(form.get("title")),
          changeSummary: String(form.get("changeSummary")),
        });
      }
      if (!boq) throw new Error("BOQ revision is unavailable.");

      if (modal === "switch-template") {
        return applyBoqTemplate(jobId, boq.id, {
          expectedVersion: boq.rowVersion,
          templateId: switchTemplateId,
          mode: switchMode,
        });
      }

      if (modal === "reassign-chain") {
        return reassignBoqChain(jobId, boq.id, {
          expectedVersion: boq.rowVersion,
          costingUserId: chainCostingId,
          purchaseHeadUserId: chainPurchaseHeadId,
          adminApproverUserId: chainAdminApproverId,
        });
      }

      if (modal === "bulk-section") {
        return bulkUpdateBoqLines(jobId, boq.id, {
          expectedVersion: boq.rowVersion,
          lineIds: [...selectedLineIds],
          patch: { sectionName: String(form.get("sectionName")).trim() },
        });
      }

      if (modal === "bulk-quantity") {
        return bulkUpdateBoqLines(jobId, boq.id, {
          expectedVersion: boq.rowVersion,
          lineIds: [...selectedLineIds],
          patch: { quantity: String(form.get("quantity")).trim() },
        });
      }

      if (modal === "bulk-delete") {
        return bulkDeleteBoqLines(jobId, boq.id, {
          expectedVersion: boq.rowVersion,
          lineIds: [...selectedLineIds],
        });
      }

      if (modal === "bulk-markup") {
        return bulkMarkupBoq(jobId, boq.id, {
          expectedVersion: boq.rowVersion,
          markupPercent: String(form.get("markupPercent")).trim(),
          ...(bulkMarkupScope === "selected"
            ? { lineIds: [...selectedCostIds] }
            : bulkMarkupScope === "section"
              ? { sectionName: bulkMarkupSection }
              : {}),
        });
      }

      if (modal === "markup" && estimateLine) {
        return saveBoqMarkup(
          jobId,
          boq.id,
          estimateLine,
          String(form.get("markupPercent")),
          boq.rowVersion,
        );
      }

      const stage = modal === "return-purchase" ? "purchase" : "final";
      return reviewBoq(jobId, boq.id, stage, {
        decision: "returned",
        reason: String(form.get("reason")),
        expectedVersion: boq.rowVersion,
      });
    },
    async onSuccess() {
      setConflictBanner(null);
      if (
        modal === "bulk-delete" ||
        modal === "bulk-section" ||
        modal === "bulk-quantity" ||
        modal === "switch-template"
      ) {
        setSelectedLineIds(new Set());
        if (modal === "switch-template") setQtyEdits({});
      }
      if (modal === "bulk-markup") setSelectedCostIds(new Set());
      await invalidate();
      close();
      toast.success("BOQ updated.");
    },
    onError: handleMutationError,
  });

  const workflow = useMutation({
    mutationFn: async ({
      revision,
      action,
    }: {
      revision: BoqRevision;
      action:
        | "submit-quantity"
        | "submit-costing"
        | "approve-purchase"
        | "approve-final";
    }) => {
      if (!jobId) return;
      if (action === "submit-quantity") {
        return submitBoq(jobId, revision.id, revision.rowVersion);
      }
      if (action === "submit-costing") {
        return submitBoqCosting(jobId, revision.id, revision.rowVersion);
      }
      return reviewBoq(
        jobId,
        revision.id,
        action === "approve-purchase" ? "purchase" : "final",
        { decision: "approved", expectedVersion: revision.rowVersion },
      );
    },
    async onSuccess() {
      setConflictBanner(null);
      await invalidate();
      toast.success("BOQ moved to the next workflow stage.");
    },
    onError: handleMutationError,
  });

  const hasActiveFilter =
    Boolean(searchTerm.trim()) ||
    sectionFilter !== "all" ||
    categoryFilter !== "all" ||
    qtyStatusFilter !== "all" ||
    costStatusFilter !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setSectionFilter("all");
    setCategoryFilter("all");
    setQtyStatusFilter("all");
    setCostStatusFilter("all");
  };

  const activeDraftRevision = useMemo(
    () =>
      workspace.data?.boqs.find(
        (item) => item.status === "draft" && item.canEditQuantity,
      ),
    [workspace.data?.boqs],
  );

  const dirtyUpdates = useMemo(() => {
    if (!activeDraftRevision) return [];
    const list: Array<{ lineId: string; quantity: string }> = [];
    for (const line of activeDraftRevision.technicalLines) {
      const edited = qtyEdits[line.id];
      if (edited === undefined) continue;
      if (normalizeQtyCompare(edited) !== normalizeQtyCompare(line.quantity)) {
        list.push({ lineId: line.id, quantity: edited.trim() });
      }
    }
    return list;
  }, [activeDraftRevision, qtyEdits]);

  const dirtySet = useMemo(
    () => new Set(dirtyUpdates.map((u) => u.lineId)),
    [dirtyUpdates],
  );

  if (workspace.isPending) {
    return (
      <main className="mx-auto max-w-7xl space-y-5 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-36" />
        <Skeleton className="h-96" />
      </main>
    );
  }

  if (workspace.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost">
          <Link to={`/engineering/design-jobs/${jobId}`}>
            <ArrowLeft />
            Design job
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>BOQ unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(workspace.error)}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const {
    job,
    boqs,
    eligibleDesignRevisions,
    availableTemplates,
    canCreateBoq,
    chainOptions,
  } = workspace.data;
  const latestDesignId = eligibleDesignRevisions[0]?.id;
  const isAdmin = user.permissions.includes("system.access.all");
  const canCreate =
    canCreateBoq ??
    ((user.id === job.designerUserId || isAdmin) &&
      Boolean(latestDesignId) &&
      !boqs.some((item) => item.status === "draft") &&
      (boqs.length === 0 ||
        isAdmin ||
        ["returned", "approved"].includes(boqs[0]!.status)));

  const moveRowByDelta = (
    revision: BoqRevision,
    lineId: string,
    delta: -1 | 1,
  ) => {
    const ids = revision.technicalLines.map((l) => l.id);
    const idx = ids.indexOf(lineId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ids.length) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(nextIdx, 0, moved!);
    reorderMutation.mutate({ revision, orderedLineIds: reordered });
  };

  const dropRow = (revision: BoqRevision, targetLineId: string) => {
    if (!draggedLineId || draggedLineId === targetLineId) {
      setDraggedLineId(null);
      return;
    }
    const ids = revision.technicalLines.map((l) => l.id);
    const fromIdx = ids.indexOf(draggedLineId);
    const toIdx = ids.indexOf(targetLineId);
    setDraggedLineId(null);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved!);
    reorderMutation.mutate({ revision, orderedLineIds: reordered });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 pb-24">
        <Button asChild className="-ml-2 mb-2" variant="ghost">
          <Link to={`/engineering/design-jobs/${jobId}`}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {job.title}
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Engineering · {job.leadNumber}
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
              Technical BOQ & Costing
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground leading-relaxed">
              Edit draft quantities inline, reorder or customize scope items,
              switch templates, and let purchase configure brand/model markups.
            </p>
          </div>
          {canCreate && (
            <Button
              onClick={() => {
                setDesignRevisionId(latestDesignId!);
                setModal("create");
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create BOQ from template
            </Button>
          )}
        </div>

        {conflictBanner && (
          <Alert variant="destructive" className="mt-5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">
              Concurrent edit conflict (409)
            </AlertTitle>
            <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>{conflictBanner}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await invalidate();
                  setConflictBanner(null);
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reload latest BOQ
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {eligibleDesignRevisions.length === 0 && (
          <Alert className="mt-5">
            <AlertTitle className="text-xs font-semibold">
              Customer-approved design required
            </AlertTitle>
            <AlertDescription className="text-xs">
              Approve an exact design package before creating its sector-based
              BOQ.
            </AlertDescription>
          </Alert>
        )}

        <section className="mt-6 space-y-6">
          {boqs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                <p className="font-medium text-foreground">
                  No BOQ revision has been created
                </p>
                <p className="mt-1 text-xs max-w-md mx-auto">
                  If creation is blocked, ask the purchase manager to configure
                  a template for this lead’s market sector.
                </p>
              </CardContent>
            </Card>
          ) : (
            boqs.map((revision) => {
              const allSections = [
                ...new Set(revision.technicalLines.map((l) => l.section)),
              ].sort();
              const allCategories = [
                ...new Set(revision.technicalLines.map((l) => l.categoryName)),
              ].sort();
              const staleLineSet = new Set(revision.staleLineIds ?? []);
              const staleEstSet = new Set(revision.staleEstimateLineIds ?? []);
              const needle = searchTerm.trim().toLowerCase();

              const filteredTechLines = revision.technicalLines.filter(
                (line) => {
                  if (sectionFilter !== "all" && line.section !== sectionFilter)
                    return false;
                  if (
                    categoryFilter !== "all" &&
                    line.categoryName !== categoryFilter
                  )
                    return false;
                  const currentQtyStr = qtyEdits[line.id] ?? line.quantity;
                  const currentQtyNum = Number(currentQtyStr);
                  if (qtyStatusFilter === "missing" && currentQtyNum > 0)
                    return false;
                  if (qtyStatusFilter === "entered" && currentQtyNum <= 0)
                    return false;
                  if (needle) {
                    const hay =
                      `${line.itemCode} ${line.itemName} ${line.section} ${line.categoryName} ${line.familyName ?? ""} ${line.specification}`.toLowerCase();
                    if (!hay.includes(needle)) return false;
                  }
                  return true;
                },
              );

              const techById = new Map(
                revision.technicalLines.map((l) => [l.id, l]),
              );
              const filteredEstLines = (revision.estimateLines ?? []).filter(
                (est) => {
                  const parent = est.boqLineId
                    ? techById.get(est.boqLineId)
                    : undefined;
                  if (
                    sectionFilter !== "all" &&
                    parent?.section !== sectionFilter
                  )
                    return false;
                  if (
                    categoryFilter !== "all" &&
                    parent?.categoryName !== categoryFilter
                  )
                    return false;
                  const isStale = staleEstSet.has(est.id);
                  if (
                    costStatusFilter === "missing_markup" &&
                    est.markupPercent !== null
                  )
                    return false;
                  if (costStatusFilter === "stale_rate" && !isStale)
                    return false;
                  if (
                    costStatusFilter === "complete" &&
                    (est.markupPercent === null || isStale)
                  )
                    return false;
                  if (needle) {
                    const hay =
                      `${est.description} ${parent?.itemCode ?? ""} ${parent?.section ?? ""} ${est.brandName ?? ""} ${est.manufacturerModel ?? ""} ${est.manufacturerSku ?? ""}`.toLowerCase();
                    if (!hay.includes(needle)) return false;
                  }
                  return true;
                },
              );

              const allVisibleSelected =
                revision.canEditQuantity &&
                filteredTechLines.length > 0 &&
                filteredTechLines.every((l) => selectedLineIds.has(l.id));

              const allVisibleCostSelected =
                revision.canEditCosting &&
                filteredEstLines.length > 0 &&
                filteredEstLines.every((e) => selectedCostIds.has(e.id));

              return (
                <Card key={revision.id} className="shadow-xs overflow-hidden">
                  <CardHeader className="border-b bg-card/60 pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs font-semibold"
                          >
                            BOQ R{revision.revisionNumber}
                          </Badge>
                          <StatusBadge status={revision.status} />
                          {revision.hasStaleRates && (
                            <Badge
                              variant="outline"
                              className="text-xs border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Stale rates ({revision.staleLineIds?.length ?? 0})
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg font-semibold pt-1">
                          {revision.title}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {revision.templateNameSnapshot ?? "Legacy BOQ"} ·{" "}
                          {revision.changeSummary}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {revision.canReassignChain && chainOptions && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setBoq(revision);
                              setChainCostingId(revision.costingUserId ?? "");
                              setChainPurchaseHeadId(revision.purchaseHeadUserId ?? "");
                              setChainAdminApproverId(revision.adminApproverUserId ?? "");
                              setModal("reassign-chain");
                            }}
                          >
                            <UserRoundCheck className="h-3.5 w-3.5 mr-1.5" />
                            Reassign Chain
                          </Button>
                        )}
                        {revision.canEditQuantity && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setBoq(revision);
                                setSwitchTemplateId(
                                  revision.templateId ??
                                    availableTemplates[0]?.id ??
                                    "",
                                );
                                setSwitchMode("append");
                                setModal("switch-template");
                              }}
                            >
                              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                              Change Template
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setBoq(revision);
                                setModal("add-item");
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              Add Item
                            </Button>
                          </>
                        )}

                        <Button asChild variant="outline" size="sm">
                          <a
                            href={boqPdfUrl(job.id, revision.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            BOQ PDF
                          </a>
                        </Button>

                        {revision.canEditQuantity && (
                          <Button
                            size="sm"
                            disabled={
                              workflow.isPending ||
                              dirtyUpdates.length > 0 ||
                              revision.technicalLines.length === 0 ||
                              revision.technicalLines.some(
                                (line) => Number(line.quantity) <= 0,
                              )
                            }
                            onClick={() =>
                              workflow.mutate({
                                revision,
                                action: "submit-quantity",
                              })
                            }
                          >
                            <Send className="h-3.5 w-3.5 mr-1.5" />
                            Send to Costing
                          </Button>
                        )}

                        {revision.canEditCosting && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setBoq(revision);
                                setBulkMarkupScope(
                                  selectedCostIds.size > 0 ? "selected" : "all",
                                );
                                setBulkMarkupSection(allSections[0] ?? "");
                                setModal("bulk-markup");
                              }}
                            >
                              <Percent className="h-3.5 w-3.5 mr-1.5" />
                              Bulk Markup
                            </Button>
                            <Button
                              size="sm"
                              disabled={
                                workflow.isPending ||
                                (revision.estimateLines?.length ?? 0) === 0 ||
                                revision.estimateLines?.some(
                                  (line) => line.markupPercent === null,
                                )
                              }
                              onClick={() =>
                                workflow.mutate({
                                  revision,
                                  action: "submit-costing",
                                })
                              }
                            >
                              <Send className="h-3.5 w-3.5 mr-1.5" />
                              Send to Purchase Head
                            </Button>
                          </>
                        )}

                        {revision.canPurchaseReview && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setBoq(revision);
                                setModal("return-purchase");
                              }}
                            >
                              Return
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                workflow.mutate({
                                  revision,
                                  action: "approve-purchase",
                                })
                              }
                            >
                              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                              Purchase Approve
                            </Button>
                          </>
                        )}

                        {revision.canFinalReview && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setBoq(revision);
                                setModal("return-final");
                              }}
                            >
                              Return
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                workflow.mutate({
                                  revision,
                                  action: "approve-final",
                                })
                              }
                            >
                              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                              Final Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 p-4 sm:p-6">
                    {/* Stale Rates Alert Banner in Costing */}
                    {revision.hasStaleRates && revision.canEditCosting && (
                      <Alert className="border-amber-500/30 bg-amber-500/10">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                          Newer active catalogue rates are available
                        </AlertTitle>
                        <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>
                            {revision.staleLineIds?.length ?? 0} item(s) have
                            newer effective rates in Item Master. Refresh to
                            re-snapshot while keeping your entered markups.
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={refreshRatesMutation.isPending}
                            onClick={() =>
                              refreshRatesMutation.mutate(revision)
                            }
                          >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Refresh Stale Rates
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* In-Workspace Search & Filter Bar */}
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
                      <div className="relative min-w-[210px] flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search code, item, family, spec, brand…"
                          className="h-8 pl-8 pr-7 text-xs bg-background"
                        />
                        {searchTerm && (
                          <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => setSearchTerm("")}
                            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <Select
                        value={sectionFilter}
                        onValueChange={setSectionFilter}
                      >
                        <SelectTrigger className="h-8 w-[155px] text-xs bg-background">
                          <SelectValue placeholder="Section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All sections</SelectItem>
                          {allSections.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={categoryFilter}
                        onValueChange={setCategoryFilter}
                      >
                        <SelectTrigger className="h-8 w-[155px] text-xs bg-background">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {allCategories.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={qtyStatusFilter}
                        onValueChange={(v) =>
                          setQtyStatusFilter(v as "all" | "missing" | "entered")
                        }
                      >
                        <SelectTrigger className="h-8 w-[155px] text-xs bg-background">
                          <SelectValue placeholder="Quantity status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All quantities</SelectItem>
                          <SelectItem value="missing">
                            Zero / missing (&gt;0 needed)
                          </SelectItem>
                          <SelectItem value="entered">
                            Entered (&gt;0)
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {revision.canViewEstimate &&
                        revision.status === "costing" && (
                          <Select
                            value={costStatusFilter}
                            onValueChange={(v) =>
                              setCostStatusFilter(
                                v as
                                  | "all"
                                  | "missing_markup"
                                  | "stale_rate"
                                  | "complete",
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs bg-background">
                              <SelectValue placeholder="Pricing status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                All costing states
                              </SelectItem>
                              <SelectItem value="missing_markup">
                                Missing markup
                              </SelectItem>
                              <SelectItem value="stale_rate">
                                Stale rate
                              </SelectItem>
                              <SelectItem value="complete">Complete</SelectItem>
                            </SelectContent>
                          </Select>
                        )}

                      {hasActiveFilter && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={clearFilters}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>

                    {/* Table 1: Technical Scope Table */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <Layers className="h-4 w-4 text-primary" />
                            Technical Scope & Quantities
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {revision.canEditQuantity
                              ? "Enter quantities directly inline (press Enter to advance), drag or step rows to reorder, and use checkboxes for bulk edits."
                              : "Frozen technical scope and verified quantities."}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-xs tabular-nums"
                        >
                          Showing {filteredTechLines.length} of{" "}
                          {revision.technicalLines.length} items
                        </Badge>
                      </div>

                      <div className="overflow-x-auto rounded-lg border bg-card max-h-[34rem] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                            <TableRow className="hover:bg-transparent">
                              {revision.canEditQuantity && (
                                <TableHead className="w-10 text-center">
                                  <Checkbox
                                    aria-label="Select all visible BOQ lines"
                                    checked={allVisibleSelected}
                                    onCheckedChange={(checked) => {
                                      setSelectedLineIds((prev) => {
                                        const next = new Set(prev);
                                        for (const line of filteredTechLines) {
                                          if (checked === true)
                                            next.add(line.id);
                                          else next.delete(line.id);
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                </TableHead>
                              )}
                              <TableHead className="w-12 text-center text-xs font-semibold">
                                #
                              </TableHead>
                              <TableHead className="min-w-[220px] max-w-[290px] text-xs font-semibold">
                                Section / Item
                              </TableHead>
                              <TableHead className="min-w-[280px] max-w-[440px] text-xs font-semibold">
                                Specification / Standard
                              </TableHead>
                              <TableHead className="text-right text-xs font-semibold min-w-[165px]">
                                Quantity
                              </TableHead>
                              {revision.canEditQuantity && (
                                <TableHead className="w-28 text-center text-xs font-semibold">
                                  Order / Remove
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredTechLines.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={revision.canEditQuantity ? 6 : 4}
                                  className="h-28 text-center text-xs text-muted-foreground"
                                >
                                  {revision.technicalLines.length === 0
                                    ? "No items in this BOQ yet. Add items or apply a template."
                                    : "No BOQ lines match the current search/filter criteria."}
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredTechLines.map((line, index) => {
                                const isDirty = dirtySet.has(line.id);
                                const rawVal =
                                  qtyEdits[line.id] ??
                                  formatQtyDisplay(line.quantity);
                                const numericVal = Number(rawVal);
                                const isZero =
                                  !rawVal.trim() || numericVal <= 0;
                                const invalidFractional =
                                  !line.allowFractional &&
                                  rawVal.trim() !== "" &&
                                  (!Number.isFinite(numericVal) ||
                                    !Number.isInteger(numericVal));

                                return (
                                  <TableRow
                                    key={line.id}
                                    draggable={
                                      revision.canEditQuantity &&
                                      !hasActiveFilter
                                    }
                                    onDragStart={() =>
                                      setDraggedLineId(line.id)
                                    }
                                    onDragOver={(e) => {
                                      if (
                                        revision.canEditQuantity &&
                                        !hasActiveFilter
                                      ) {
                                        e.preventDefault();
                                      }
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (
                                        revision.canEditQuantity &&
                                        !hasActiveFilter
                                      ) {
                                        dropRow(revision, line.id);
                                      }
                                    }}
                                    className={cn(
                                      "hover:bg-muted/40 transition-colors align-top",
                                      isDirty && "bg-primary/[0.04]",
                                      staleLineSet.has(line.id) &&
                                        "bg-amber-500/[0.04]",
                                    )}
                                  >
                                    {revision.canEditQuantity && (
                                      <TableCell className="pt-3 text-center">
                                        <Checkbox
                                          aria-label={`Select ${line.itemName}`}
                                          checked={selectedLineIds.has(line.id)}
                                          onCheckedChange={(checked) => {
                                            setSelectedLineIds((prev) => {
                                              const next = new Set(prev);
                                              if (checked === true)
                                                next.add(line.id);
                                              else next.delete(line.id);
                                              return next;
                                            });
                                          }}
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell className="text-center font-mono text-xs text-muted-foreground pt-3">
                                      <div className="flex items-center justify-center gap-1">
                                        {revision.canEditQuantity &&
                                          !hasActiveFilter && (
                                            <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground/60" />
                                          )}
                                        <span>{line.lineNumber}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="pt-3">
                                      <p className="font-medium text-xs text-foreground">
                                        {line.itemName}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px] px-1.5 py-0 h-4 font-normal"
                                        >
                                          {line.section}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 h-4 font-normal"
                                        >
                                          {line.categoryName}
                                        </Badge>
                                        <span className="text-[11px] font-mono text-muted-foreground">
                                          {line.itemCode}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="pt-3 max-w-[440px]">
                                      <ExpandableText
                                        text={line.specification}
                                        limit={45}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right pt-2 whitespace-nowrap">
                                      {revision.canEditQuantity ? (
                                        <div className="inline-flex items-center justify-end gap-1.5">
                                          {isDirty && (
                                            <span
                                              className="h-2 w-2 rounded-full bg-primary"
                                              title="Unsaved quantity edit"
                                            />
                                          )}
                                          <Input
                                            data-boq-qty-index={index}
                                            value={rawVal}
                                            inputMode="decimal"
                                            aria-label={`Quantity for ${line.itemName}`}
                                            aria-invalid={invalidFractional}
                                            onChange={(e) => {
                                              const nextVal = e.target.value;
                                              setQtyEdits((prev) => ({
                                                ...prev,
                                                [line.id]: nextVal,
                                              }));
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                const nextEl =
                                                  document.querySelector<HTMLInputElement>(
                                                    `input[data-boq-qty-index="${index + 1}"]`,
                                                  );
                                                if (nextEl) {
                                                  nextEl.focus();
                                                  nextEl.select();
                                                } else if (
                                                  dirtyUpdates.length > 0
                                                ) {
                                                  batchQtyMutation.mutate({
                                                    revision,
                                                    updates: dirtyUpdates,
                                                  });
                                                }
                                              }
                                            }}
                                            className={cn(
                                              "h-8 w-24 text-right font-mono text-xs tabular-nums",
                                              isZero &&
                                                !isDirty &&
                                                "border-amber-500/40",
                                              invalidFractional &&
                                                "border-destructive",
                                            )}
                                          />
                                          <span className="w-10 text-left text-xs text-muted-foreground font-mono">
                                            {line.unitSymbol}
                                          </span>
                                        </div>
                                      ) : Number(line.quantity) > 0 ? (
                                        <span className="font-medium text-xs tabular-nums font-mono text-foreground">
                                          {formatQtyDisplay(line.quantity)}{" "}
                                          {line.unitSymbol}
                                        </span>
                                      ) : (
                                        <span className="text-destructive text-xs">
                                          Pending entry
                                        </span>
                                      )}
                                    </TableCell>
                                    {revision.canEditQuantity && (
                                      <TableCell className="text-center pt-2">
                                        <div className="inline-flex items-center gap-0.5">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                aria-label={`Move ${line.itemName} up`}
                                                disabled={
                                                  hasActiveFilter ||
                                                  reorderMutation.isPending ||
                                                  index === 0
                                                }
                                                onClick={() =>
                                                  moveRowByDelta(
                                                    revision,
                                                    line.id,
                                                    -1,
                                                  )
                                                }
                                              >
                                                <ArrowUp className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              {hasActiveFilter
                                                ? "Clear filters to reorder"
                                                : "Move up"}
                                            </TooltipContent>
                                          </Tooltip>

                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                aria-label={`Move ${line.itemName} down`}
                                                disabled={
                                                  hasActiveFilter ||
                                                  reorderMutation.isPending ||
                                                  index ===
                                                    filteredTechLines.length - 1
                                                }
                                                onClick={() =>
                                                  moveRowByDelta(
                                                    revision,
                                                    line.id,
                                                    1,
                                                  )
                                                }
                                              >
                                                <ArrowDown className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              {hasActiveFilter
                                                ? "Clear filters to reorder"
                                                : "Move down"}
                                            </TooltipContent>
                                          </Tooltip>

                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                aria-label={`Remove ${line.itemName}`}
                                                disabled={
                                                  removeLineMutation.isPending
                                                }
                                                onClick={() =>
                                                  removeLineMutation.mutate({
                                                    revision,
                                                    lineId: line.id,
                                                  })
                                                }
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              Remove item
                                            </TooltipContent>
                                          </Tooltip>
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

                    {/* Table 2: Brand/Model Costing Matrix Table */}
                    {revision.canViewEstimate ? (
                      <div className="space-y-2.5 pt-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <Sparkles className="h-4 w-4 text-primary" />
                              Brand / Model Costing Matrix
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Internal breakdown: Supply, Labour, Misc, and
                              Markup % per offering. Customer quotation PDFs
                              omit Supply, Markup, and Misc.
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-xs tabular-nums"
                          >
                            Showing {filteredEstLines.length} of{" "}
                            {revision.estimateLines?.length ?? 0} options
                          </Badge>
                        </div>

                        {(revision.estimateLines?.length ?? 0) === 0 && (
                          <Alert variant="destructive">
                            <AlertTitle className="text-xs font-semibold">
                              Pricing is incomplete
                            </AlertTitle>
                            <AlertDescription className="text-xs">
                              Configure offerings and effective rates in
                              Masters, then submit quantities or refresh rates.
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="overflow-x-auto rounded-lg border bg-card max-h-[32rem] overflow-y-auto">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                              <TableRow className="hover:bg-transparent">
                                {revision.canEditCosting && (
                                  <TableHead className="w-10 text-center">
                                    <Checkbox
                                      aria-label="Select all visible costing rows"
                                      checked={allVisibleCostSelected}
                                      onCheckedChange={(checked) => {
                                        setSelectedCostIds((prev) => {
                                          const next = new Set(prev);
                                          for (const est of filteredEstLines) {
                                            if (checked === true)
                                              next.add(est.id);
                                            else next.delete(est.id);
                                          }
                                          return next;
                                        });
                                      }}
                                    />
                                  </TableHead>
                                )}
                                <TableHead className="w-12 text-center text-xs font-semibold">
                                  #
                                </TableHead>
                                <TableHead className="min-w-[260px] max-w-[380px] text-xs font-semibold">
                                  Description / Offering
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[70px]">
                                  Qty
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[85px]">
                                  Supply
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[85px]">
                                  Labour
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[85px]">
                                  Misc.
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[125px]">
                                  Markup
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[95px]">
                                  Unit Rate
                                </TableHead>
                                <TableHead className="text-right text-xs font-semibold min-w-[105px]">
                                  Amount
                                </TableHead>
                                {revision.canEditCosting && (
                                  <TableHead className="w-14 text-center text-xs font-semibold">
                                    Action
                                  </TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredEstLines.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={revision.canEditCosting ? 11 : 9}
                                    className="h-28 text-center text-xs text-muted-foreground"
                                  >
                                    {(revision.estimateLines ?? []).length === 0
                                      ? "Costing rows are generated when design submits quantities."
                                      : "No costing rows match current filters."}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredEstLines.map((line) => {
                                  const isPreferred = line.isPreferredOffering;
                                  const isStale = staleEstSet.has(line.id);
                                  return (
                                    <TableRow
                                      key={line.id}
                                      className={cn(
                                        "transition-colors align-top",
                                        isPreferred
                                          ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
                                          : "hover:bg-muted/40",
                                      )}
                                    >
                                      {revision.canEditCosting && (
                                        <TableCell className="pt-3 text-center">
                                          <Checkbox
                                            aria-label={`Select costing option ${line.description} ${line.manufacturerModel ?? ""}`}
                                            checked={selectedCostIds.has(
                                              line.id,
                                            )}
                                            onCheckedChange={(checked) => {
                                              setSelectedCostIds((prev) => {
                                                const next = new Set(prev);
                                                if (checked === true)
                                                  next.add(line.id);
                                                else next.delete(line.id);
                                                return next;
                                              });
                                            }}
                                          />
                                        </TableCell>
                                      )}
                                      <TableCell className="text-center font-mono text-xs text-muted-foreground pt-3">
                                        {line.lineNumber}
                                      </TableCell>
                                      <TableCell className="pt-3 max-w-[380px]">
                                        <ExpandableText
                                          text={line.description}
                                          limit={85}
                                        />
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                          <span className="text-[11px] font-medium text-foreground/80">
                                            {line.brandName ?? "Unbranded"} ·{" "}
                                            {line.manufacturerModel}
                                          </span>
                                          {line.manufacturerSku && (
                                            <span className="text-[10px] font-mono text-muted-foreground">
                                              [{line.manufacturerSku}]
                                            </span>
                                          )}
                                          {isPreferred && (
                                            <Badge
                                              variant="secondary"
                                              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 font-medium flex items-center gap-1"
                                            >
                                              <Star className="h-2.5 w-2.5 fill-primary" />
                                              Preferred
                                            </Badge>
                                          )}
                                          {isStale && (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                            >
                                              Stale rate
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground font-mono pt-3">
                                        {formatQtyDisplay(line.quantity)}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-xs pt-3">
                                        ₹{line.supplyRate}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-xs pt-3">
                                        ₹{line.labourRate}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-xs pt-3">
                                        ₹{line.miscellaneousRate}
                                      </TableCell>
                                      <TableCell className="text-right text-xs pt-3">
                                        {line.markupPercent === null ? (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] text-destructive border-destructive/30 bg-destructive/5 font-normal"
                                          >
                                            Not confirmed
                                          </Badge>
                                        ) : (
                                          <span className="tabular-nums font-mono text-[11px]">
                                            {line.markupPercent}% · ₹
                                            {line.markupAmount}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-xs pt-3">
                                        {line.quotedUnitRate === null
                                          ? "—"
                                          : `₹${line.quotedUnitRate}`}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold text-xs tabular-nums text-foreground pt-3">
                                        ₹{line.lineTotal}
                                      </TableCell>
                                      {revision.canEditCosting && (
                                        <TableCell className="text-center pt-2">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                aria-label={`Set markup for ${line.description} ${line.manufacturerModel ?? ""}`}
                                                onClick={() => {
                                                  setBoq(revision);
                                                  setEstimateLine(line);
                                                  setModal("markup");
                                                }}
                                              >
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              Set Markup
                                            </TooltipContent>
                                          </Tooltip>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  );
                                })
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-1.5 shadow-2xs">
                            <Calculator className="h-4 w-4 text-primary" />
                            <span className="text-xs text-muted-foreground font-medium">
                              Preferred-Option Total:
                            </span>
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              ₹{revision.estimateTotals?.total ?? "0.00"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Alert>
                        <AlertTitle className="text-xs font-semibold">
                          Commercial costing is restricted
                        </AlertTitle>
                        <AlertDescription className="text-xs">
                          You can see complete technical quantities, but costing
                          is visible only to the explicitly assigned purchase
                          and approval users.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Reviews Banner */}
                    {revision.reviews.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2 pt-2">
                        {revision.reviews.map((review) => (
                          <Alert key={review.reviewStage}>
                            <ShieldCheck className="h-4 w-4" />
                            <AlertTitle className="capitalize text-xs font-semibold">
                              {review.reviewStage} Review: {review.decision}
                            </AlertTitle>
                            <AlertDescription className="text-xs text-muted-foreground">
                              {review.reason || "Approved without notes."}
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>

        {/* Sticky Unsaved Inline Quantity Bar */}
        <AnimatePresence>
          {activeDraftRevision && dirtyUpdates.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18 }}
              className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-xl border bg-card px-4 py-2.5 shadow-lg flex flex-wrap items-center gap-3"
            >
              <Badge variant="secondary" className="font-mono text-xs">
                {dirtyUpdates.length} unsaved quantity edit(s)
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                disabled={batchQtyMutation.isPending}
                onClick={() => setQtyEdits({})}
              >
                Discard
              </Button>
              <Button
                size="sm"
                disabled={batchQtyMutation.isPending}
                onClick={() =>
                  batchQtyMutation.mutate({
                    revision: activeDraftRevision,
                    updates: dirtyUpdates,
                  })
                }
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save changes
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Bulk Selection Bar (Draft or Costing) */}
        <AnimatePresence>
          {activeDraftRevision &&
            selectedLineIds.size > 0 &&
            dirtyUpdates.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.18 }}
                className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-xl border bg-card px-4 py-2.5 shadow-lg flex flex-wrap items-center gap-2"
              >
                <Badge variant="secondary" className="font-mono text-xs mr-1">
                  {selectedLineIds.size} selected
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBoq(activeDraftRevision);
                    setModal("bulk-section");
                  }}
                >
                  <FolderInput className="mr-1.5 h-3.5 w-3.5" />
                  Bulk Edit Section
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBoq(activeDraftRevision);
                    setModal("bulk-quantity");
                  }}
                >
                  <Hash className="mr-1.5 h-3.5 w-3.5" />
                  Set Quantity
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setBoq(activeDraftRevision);
                    setModal("bulk-delete");
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove Selected
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedLineIds(new Set())}
                >
                  Clear
                </Button>
              </motion.div>
            )}

          {!activeDraftRevision &&
            selectedCostIds.size > 0 &&
            (() => {
              const costingBoq = boqs.find((b) => b.canEditCosting);
              if (!costingBoq) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.18 }}
                  className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-xl border bg-card px-4 py-2.5 shadow-lg flex flex-wrap items-center gap-2"
                >
                  <Badge variant="secondary" className="font-mono text-xs mr-1">
                    {selectedCostIds.size} option(s) selected
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => {
                      setBoq(costingBoq);
                      setBulkMarkupScope("selected");
                      setModal("bulk-markup");
                    }}
                  >
                    <Percent className="mr-1.5 h-3.5 w-3.5" />
                    Apply Bulk Markup %
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCostIds(new Set())}
                  >
                    Clear
                  </Button>
                </motion.div>
              );
            })()}
        </AnimatePresence>

        {jobId && (
          <BoqAddItemDialog
            open={modal === "add-item"}
            jobId={jobId}
            existingSections={[
              ...new Set((boq?.technicalLines ?? []).map((l) => l.section)),
            ]}
            busy={addItemMutation.isPending}
            error={
              addItemMutation.isError
                ? getApiErrorMessage(addItemMutation.error)
                : undefined
            }
            onClose={close}
            onAdd={(input) => addItemMutation.mutate(input)}
          />
        )}

        <BoqDialog
          modal={modal === "add-item" ? undefined : modal}
          estimate={estimateLine}
          eligible={eligibleDesignRevisions}
          designRevisionId={designRevisionId}
          setDesignRevisionId={setDesignRevisionId}
          templates={availableTemplates}
          switchTemplateId={switchTemplateId}
          setSwitchTemplateId={setSwitchTemplateId}
          switchMode={switchMode}
          setSwitchMode={setSwitchMode}
          chainOptions={chainOptions}
          chainCostingId={chainCostingId}
          setChainCostingId={setChainCostingId}
          chainPurchaseHeadId={chainPurchaseHeadId}
          setChainPurchaseHeadId={setChainPurchaseHeadId}
          chainAdminApproverId={chainAdminApproverId}
          setChainAdminApproverId={setChainAdminApproverId}
          selectedCount={
            modal === "bulk-markup"
              ? selectedCostIds.size
              : selectedLineIds.size
          }
          sections={[
            ...new Set((boq?.technicalLines ?? []).map((l) => l.section)),
          ]}
          bulkMarkupScope={bulkMarkupScope}
          setBulkMarkupScope={setBulkMarkupScope}
          bulkMarkupSection={bulkMarkupSection}
          setBulkMarkupSection={setBulkMarkupSection}
          error={
            formMutation.isError
              ? getApiErrorMessage(formMutation.error)
              : undefined
          }
          busy={formMutation.isPending}
          onClose={close}
          onSubmit={(form) => formMutation.mutate(form)}
        />
      </main>
    </TooltipProvider>
  );
}

function BoqDialog({
  modal,
  estimate,
  eligible,
  designRevisionId,
  setDesignRevisionId,
  templates,
  switchTemplateId,
  setSwitchTemplateId,
  switchMode,
  setSwitchMode,
  chainOptions,
  chainCostingId,
  setChainCostingId,
  chainPurchaseHeadId,
  setChainPurchaseHeadId,
  chainAdminApproverId,
  setChainAdminApproverId,
  selectedCount,
  sections,
  bulkMarkupScope,
  setBulkMarkupScope,
  bulkMarkupSection,
  setBulkMarkupSection,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  modal?: Exclude<Modal, "add-item">;
  estimate?: EstimateLine;
  eligible: Array<{ id: string; revisionNumber: number; title: string }>;
  designRevisionId: string;
  setDesignRevisionId: (value: string) => void;
  templates: BoqTemplateSummary[];
  switchTemplateId: string;
  setSwitchTemplateId: (value: string) => void;
  switchMode: "append" | "replace";
  setSwitchMode: (value: "append" | "replace") => void;
  chainOptions?: { costingUsers: BoqChainUser[]; purchaseHeads: BoqChainUser[]; adminApprovers: BoqChainUser[] };
  chainCostingId: string;
  setChainCostingId: (value: string) => void;
  chainPurchaseHeadId: string;
  setChainPurchaseHeadId: (value: string) => void;
  chainAdminApproverId: string;
  setChainAdminApproverId: (value: string) => void;
  selectedCount: number;
  sections: string[];
  bulkMarkupScope: "selected" | "section" | "all";
  setBulkMarkupScope: (value: "selected" | "section" | "all") => void;
  bulkMarkupSection: string;
  setBulkMarkupSection: (value: string) => void;
  error?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const returning = modal === "return-purchase" || modal === "return-final";
  const titleMap: Record<Exclude<Modal, "add-item">, string> = {
    create: "Create BOQ from Sector Template",
    "switch-template": "Switch or Append BOQ Template",
    "reassign-chain": "Reassign BOQ Workflow Chain",
    "bulk-section": `Assign Section (${selectedCount} items)`,
    "bulk-quantity": `Set Quantity (${selectedCount} items)`,
    "bulk-delete": `Remove ${selectedCount} Selected Item(s)?`,
    "bulk-markup": "Apply Bulk Markup %",
    markup: `Confirm Markup · ${estimate?.description ?? ""}`,
    "return-purchase": "Return BOQ",
    "return-final": "Return BOQ",
  };

  return (
    <Dialog
      open={Boolean(modal)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
        >
          <DialogHeader>
            <DialogTitle>{modal ? titleMap[modal] : ""}</DialogTitle>
            <DialogDescription>
              {modal === "create"
                ? "The lead market sector selects the initial template and assigned costing/review chain."
                : modal === "switch-template"
                  ? "Choose an active company BOQ template to replace current draft lines or append missing items."
                  : returning
                    ? "The submitted revision remains immutable; the designer can create a corrected revision."
                    : "Server-side decimal validation and optimistic version checks apply."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            {modal === "create" && (
              <>
                <SelectField
                  label="Customer-approved Design"
                  value={designRevisionId}
                  onValueChange={setDesignRevisionId}
                  items={eligible.map((item) => ({
                    value: item.id,
                    label: `R${item.revisionNumber} · ${item.title}`,
                  }))}
                />
                <Field label="BOQ Title" name="title" required />
                <TextField
                  label="Change Summary"
                  name="changeSummary"
                  required
                />
              </>
            )}

            {modal === "switch-template" && (
              <>
                <SelectField
                  label="Target Template"
                  value={switchTemplateId}
                  onValueChange={setSwitchTemplateId}
                  items={templates.map((t) => ({
                    value: t.id,
                    label: `${t.sectorName} · ${t.name} (${t.itemCount} items)`,
                  }))}
                />
                <SelectField
                  label="Application Mode"
                  value={switchMode}
                  onValueChange={(v) =>
                    setSwitchMode(v as "append" | "replace")
                  }
                  items={[
                    {
                      value: "append",
                      label: "Append missing items (keep existing quantities)",
                    },
                    {
                      value: "replace",
                      label:
                        "Replace existing items (reset lines & costing chain)",
                    },
                  ]}
                />
                {switchMode === "replace" && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-semibold">
                      Replace deletes current draft lines
                    </AlertTitle>
                    <AlertDescription className="text-xs">
                      All current quantities in this draft revision will be
                      cleared and replaced with the selected template items at 0
                      quantity.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {modal === "reassign-chain" && chainOptions && (
              <>
                <SelectField
                  label="Costing Employee (Purchase)"
                  value={chainCostingId}
                  onValueChange={setChainCostingId}
                  items={chainOptions.costingUsers.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${u.email})${u.isOnLeave ? " · On Leave" : ""}`,
                  }))}
                />
                <SelectField
                  label="Purchase Head"
                  value={chainPurchaseHeadId}
                  onValueChange={setChainPurchaseHeadId}
                  items={chainOptions.purchaseHeads.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${u.email})${u.isOnLeave ? " · On Leave" : ""}`,
                  }))}
                />
                <SelectField
                  label="Final Administrative Approver"
                  value={chainAdminApproverId}
                  onValueChange={setChainAdminApproverId}
                  items={chainOptions.adminApprovers.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${u.email})${u.isOnLeave ? " · On Leave" : ""}`,
                  }))}
                />
              </>
            )}

            {modal === "bulk-section" && (
              <Field
                label="Section / Group Name"
                name="sectionName"
                placeholder="e.g. Pump house, Hydrant riser"
                required
              />
            )}

            {modal === "bulk-quantity" && (
              <Field
                label="Quantity (enter 0 to clear)"
                name="quantity"
                inputMode="decimal"
                defaultValue="0"
                required
              />
            )}

            {modal === "bulk-delete" && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  This removes {selectedCount} item(s) from this draft BOQ and
                  renumbers remaining rows sequentially.
                </AlertDescription>
              </Alert>
            )}

            {modal === "bulk-markup" && (
              <>
                <SelectField
                  label="Apply To"
                  value={bulkMarkupScope}
                  onValueChange={(v) =>
                    setBulkMarkupScope(v as "selected" | "section" | "all")
                  }
                  items={[
                    ...(selectedCount > 0
                      ? [
                          {
                            value: "selected",
                            label: `Selected rows (${selectedCount})`,
                          },
                        ]
                      : []),
                    { value: "section", label: "Entire section" },
                    { value: "all", label: "All costing rows in BOQ" },
                  ]}
                />
                {bulkMarkupScope === "section" && (
                  <SelectField
                    label="Target Section"
                    value={bulkMarkupSection}
                    onValueChange={setBulkMarkupSection}
                    items={sections.map((s) => ({ value: s, label: s }))}
                  />
                )}
                <Field
                  label="Markup Percentage (%)"
                  name="markupPercent"
                  inputMode="decimal"
                  min="0"
                  max="1000"
                  step="0.0001"
                  required
                />
              </>
            )}

            {modal === "markup" && (
              <>
                <Alert>
                  <AlertTitle className="text-xs font-semibold">
                    Fixed Rate Snapshot
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    Supply ₹{estimate?.supplyRate} + Labour ₹
                    {estimate?.labourRate}. Miscellaneous ₹
                    {estimate?.miscellaneousRate} is added after markup and is
                    not part of the markup base.
                  </AlertDescription>
                </Alert>
                <Field
                  label="Markup Percentage (%)"
                  name="markupPercent"
                  inputMode="decimal"
                  min="0"
                  max="1000"
                  step="0.0001"
                  required
                  defaultValue={estimate?.markupPercent ?? ""}
                />
              </>
            )}

            {returning && (
              <TextField
                label="Return Reason"
                name="reason"
                minLength={3}
                required
              />
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={modal === "bulk-delete" ? "destructive" : "default"}
              disabled={
                busy ||
                (modal === "create" && !designRevisionId) ||
                (modal === "switch-template" && !switchTemplateId)
              }
            >
              {returning
                ? "Return BOQ"
                : modal === "bulk-delete"
                  ? "Remove Selected"
                  : modal === "switch-template"
                    ? "Apply Template"
                    : "Save"}
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
      <Label htmlFor={`boq-${name}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id={`boq-${name}`}
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
      <Label htmlFor={`boq-${name}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Textarea
        id={`boq-${name}`}
        name={name}
        rows={3}
        className="text-sm"
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
        <SelectTrigger className="w-full h-9 text-sm">
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
