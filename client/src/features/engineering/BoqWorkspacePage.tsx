import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calculator,
  ClipboardList,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  boqPdfUrl,
  boqWorkspaceQuery,
  createBoqRevision,
  reviewBoq,
  saveBoqMarkup,
  saveBoqQuantity,
  submitBoq,
  submitBoqCosting,
  type BoqLine,
  type BoqRevision,
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
  | "create"
  | "quantity"
  | "markup"
  | "return-purchase"
  | "return-final";

function ExpandableText({
  text,
  limit = 15,
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
  const [technicalLine, setTechnicalLine] = useState<BoqLine>();
  const [estimateLine, setEstimateLine] = useState<EstimateLine>();
  const [designRevisionId, setDesignRevisionId] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["engineering", "design-job", jobId, "boqs"],
    });

  const close = () => {
    setModal(undefined);
    setBoq(undefined);
    setTechnicalLine(undefined);
    setEstimateLine(undefined);
  };

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
      if (modal === "quantity" && technicalLine) {
        return saveBoqQuantity(
          jobId,
          boq.id,
          technicalLine,
          String(form.get("quantity")),
          boq.rowVersion,
        );
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
      await invalidate();
      close();
      toast.success("BOQ updated.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
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
      await invalidate();
      toast.success("BOQ moved to the next workflow stage.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

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

  const { job, boqs, eligibleDesignRevisions } = workspace.data;
  const latestDesignId = eligibleDesignRevisions[0]?.id;
  const canCreate =
    user.id === job.designerUserId &&
    Boolean(latestDesignId) &&
    !boqs.some((item) => item.status === "draft") &&
    (boqs.length === 0 || ["returned", "approved"].includes(boqs[0]!.status));

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
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
              The sector template fixes item scope. Design engineering records
              exact quantities; purchasing configures offering markups; the
              designated approver performs final review.
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

        {eligibleDesignRevisions.length === 0 && (
          <Alert className="mt-6">
            <AlertTitle>Customer-approved design required</AlertTitle>
            <AlertDescription>
              Approve an exact design package before creating its sector-based
              BOQ.
            </AlertDescription>
          </Alert>
        )}

        <section className="mt-8 space-y-6">
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
            boqs.map((revision) => (
              <Card key={revision.id} className="shadow-xs overflow-hidden">
                <CardHeader className="border-b bg-card/60 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs font-semibold"
                        >
                          BOQ R{revision.revisionNumber}
                        </Badge>
                        <StatusBadge status={revision.status} />
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

                <CardContent className="space-y-8 p-5 sm:p-6">
                  {/* Table 1: Technical Scope Table */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-primary" />
                          Template Technical Scope
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Items are governed by market sector; the design
                          engineer records full verified quantities.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {revision.technicalLines.length} item(s)
                      </Badge>
                    </div>

                    <div className="overflow-x-auto rounded-lg border bg-card max-h-[28rem] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-12 text-center text-xs font-semibold">
                              #
                            </TableHead>
                            <TableHead className="min-w-[220px] max-w-[280px] text-xs font-semibold">
                              Section / Item
                            </TableHead>
                            <TableHead className="min-w-[320px] max-w-[500px] text-xs font-semibold">
                              Specification / Standard
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold min-w-[120px]">
                              Quantity
                            </TableHead>
                            {revision.canEditQuantity && (
                              <TableHead className="w-14 text-center text-xs font-semibold">
                                Action
                              </TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revision.technicalLines.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={revision.canEditQuantity ? 5 : 4}
                                className="h-28 text-center text-xs text-muted-foreground"
                              >
                                No technical items defined in this template.
                              </TableCell>
                            </TableRow>
                          ) : (
                            revision.technicalLines.map((line) => (
                              <TableRow
                                key={line.id}
                                className="hover:bg-muted/40 transition-colors align-top"
                              >
                                <TableCell className="text-center font-mono text-xs text-muted-foreground pt-3">
                                  {line.lineNumber}
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
                                    <span className="text-[11px] font-mono text-muted-foreground">
                                      {line.itemCode}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="pt-3 max-w-[500px]">
                                  <ExpandableText
                                    text={line.specification}
                                    limit={30}
                                  />
                                </TableCell>
                                <TableCell className="text-right font-medium text-xs tabular-nums text-foreground pt-3 whitespace-nowrap">
                                  {Number(line.quantity) > 0 ? (
                                    <span>
                                      {line.quantity} {line.unitSymbol}
                                    </span>
                                  ) : (
                                    <span className="text-destructive font-normal">
                                      Pending entry
                                    </span>
                                  )}
                                </TableCell>
                                {revision.canEditQuantity && (
                                  <TableCell className="text-center pt-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon-sm"
                                          variant="ghost"
                                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                          aria-label={`Edit ${line.itemName} quantity`}
                                          onClick={() => {
                                            setBoq(revision);
                                            setTechnicalLine(line);
                                            setModal("quantity");
                                          }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Edit Quantity
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Table 2: Brand/Model Costing Matrix Table */}
                  {revision.canViewEstimate ? (
                    <div className="space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Brand / Model Costing Matrix
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Independent fixed rate snapshot per offering.
                            Purchase confirms markup for every option; quotation
                            later selects one approved option.
                          </p>
                        </div>
                      </div>

                      {(revision.estimateLines?.length ?? 0) === 0 && (
                        <Alert variant="destructive">
                          <AlertTitle>Pricing is incomplete</AlertTitle>
                          <AlertDescription>
                            Configure offerings and effective rates in Masters,
                            then create a new BOQ revision.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="overflow-x-auto rounded-lg border bg-card max-h-[32rem] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-12 text-center text-xs font-semibold">
                                #
                              </TableHead>
                              <TableHead className="min-w-[280px] max-w-[420px] text-xs font-semibold">
                                Description / Offering
                              </TableHead>
                              <TableHead className="text-right text-xs font-semibold min-w-[70px]">
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
                              <TableHead className="text-right text-xs font-semibold min-w-[130px]">
                                Markup
                              </TableHead>
                              <TableHead className="text-right text-xs font-semibold min-w-[100px]">
                                Unit Rate
                              </TableHead>
                              <TableHead className="text-right text-xs font-semibold min-w-[110px]">
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
                            {(revision.estimateLines ?? []).length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={revision.canEditCosting ? 10 : 9}
                                  className="h-28 text-center text-xs text-muted-foreground"
                                >
                                  No effective offering rates were available for
                                  this revision.
                                </TableCell>
                              </TableRow>
                            ) : (
                              revision.estimateLines!.map((line) => {
                                const isPreferred = line.isPreferredOffering;
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
                                    <TableCell className="text-center font-mono text-xs text-muted-foreground pt-3">
                                      {line.lineNumber}
                                    </TableCell>
                                    <TableCell className="pt-3 max-w-[420px]">
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
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground font-mono pt-3">
                                      {line.quantity}
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
                      <AlertTitle>Commercial costing is restricted</AlertTitle>
                      <AlertDescription>
                        You can see complete technical quantities, but costing
                        is visible only to the explicitly assigned purchase and
                        approval users.
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
            ))
          )}
        </section>

        <BoqDialog
          modal={modal}
          line={technicalLine}
          estimate={estimateLine}
          eligible={eligibleDesignRevisions}
          designRevisionId={designRevisionId}
          setDesignRevisionId={setDesignRevisionId}
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
  line,
  estimate,
  eligible,
  designRevisionId,
  setDesignRevisionId,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  modal?: Modal;
  line?: BoqLine;
  estimate?: EstimateLine;
  eligible: Array<{ id: string; revisionNumber: number; title: string }>;
  designRevisionId: string;
  setDesignRevisionId: (value: string) => void;
  error?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const returning = modal === "return-purchase" || modal === "return-final";
  const title =
    modal === "create"
      ? "Create BOQ from Sector Template"
      : modal === "quantity"
        ? `Enter Quantity · ${line?.itemName}`
        : modal === "markup"
          ? `Confirm Markup · ${estimate?.description}`
          : "Return BOQ";

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
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {modal === "create"
                ? "The lead market sector selects the item template and assigned costing/review chain."
                : modal === "quantity"
                  ? "Design engineering records quantity only. Purchase controls all costing."
                  : returning
                    ? "The submitted revision remains immutable; the designer can create a corrected revision."
                    : "Server-side decimal validation and totals are authoritative."}
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

            {modal === "quantity" && (
              <Field
                label={`Full Quantity (${line?.unitSymbol ?? ""})`}
                name="quantity"
                inputMode="decimal"
                min="0.0001"
                step="0.0001"
                defaultValue={line?.quantity}
                required
              />
            )}

            {modal === "markup" && (
              <>
                <Alert>
                  <AlertTitle>Fixed Rate Snapshot</AlertTitle>
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
              disabled={busy || (modal === "create" && !designRevisionId)}
            >
              {returning ? "Return BOQ" : "Save"}
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
