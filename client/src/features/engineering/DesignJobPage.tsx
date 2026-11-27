import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileCode2,
  FileText,
  History,
  Layers,
  Loader2,
  LockKeyhole,
  MapPinned,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  User,
  UserRoundCheck,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  assignDesignEngineer,
  createDesignRevision,
  createSurveyRevision,
  designFileUrl,
  designJobQuery,
  eligibleDesignAssigneesQuery,
  eligibleDesignersQuery,
  finalizeSurveyRevision,
  reassignDesignJob,
  recordDesignCustomerDecision,
  reviewDesignRevision,
  sendDesignToCustomer,
  submitDesignRevision,
  surveyFileUrl,
  uploadDesignFile,
  uploadSurveyFile,
  useDesignDeadlineBuffer,
  type DesignRevision,
  type DesignStatus,
  type SurveyRevision,
} from "@/api/engineering";
import { FileDropzone } from "@/components/FileDropzone";
import {
  isImageFile,
  UploadedFilePreviewDialog,
} from "@/components/ImagePreview";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OpportunityDocumentsCard } from "@/features/crm/OpportunityDocumentsCard";
import { StartProjectDialog } from "@/features/projects/StartProjectDialog";
import { cn } from "@/lib/utils";
import { DesignDeadline } from "./DesignDeadline";

type Action =
  | "assign"
  | "reassign"
  | "create"
  | "return"
  | "customer-approved"
  | "changes-requested"
  | "customer-abandoned";

const DESIGN_STEPS = [
  { key: "assign", label: "Assign" },
  { key: "draft", label: "Drafting" },
  { key: "review", label: "Internal Review" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent to Client" },
  { key: "won", label: "Client Approved" },
] as const;

function getStepIndex(status: DesignStatus): number {
  switch (status) {
    case "awaiting_designer":
      return 0;
    case "authorized":
    case "draft":
    case "returned":
    case "changes_requested":
      return 1;
    case "under_review":
      return 2;
    case "internally_approved":
      return 3;
    case "sent_to_customer":
      return 4;
    case "customer_approved":
      return 5;
    default:
      return -1;
  }
}

function DesignStageStepper({ status }: { status: DesignStatus }) {
  const isFrozen = ["paused", "cancelled", "abandoned"].includes(status);
  const currentIndex = getStepIndex(status);

  return (
    <div className="flex items-center gap-1.5">
      {DESIGN_STEPS.map((step, idx) => {
        const isCompleted = !isFrozen && currentIndex > idx;
        const isCurrent = !isFrozen && currentIndex === idx;

        return (
          <div key={step.key} className="flex-1 space-y-1">
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                isCompleted && "bg-primary",
                isCurrent && "bg-primary/70",
                !isCompleted && !isCurrent && "bg-muted",
              )}
            />
            <span
              className={cn(
                "block truncate text-[10px] leading-none",
                isCurrent
                  ? "font-semibold text-foreground"
                  : isCompleted
                    ? "font-medium text-primary"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ExpandableText({
  text,
  limit = 90,
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
    <div
      className={cn(
        "group/text relative min-w-0 w-full whitespace-normal",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs leading-relaxed text-muted-foreground break-words whitespace-normal",
          !isExpanded && isLong && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {isLong && (
        <div className="mt-1 flex items-center gap-2.5">
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
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground opacity-0 group-hover/text:opacity-100 transition-opacity"
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

export function DesignJobPage() {
  const { jobId } = useParams();
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const query = useQuery(designJobQuery(jobId));
  const isAdmin = user.permissions.includes("system.access.all");
  const designers = useQuery({
    ...eligibleDesignersQuery(jobId),
    enabled: Boolean(jobId) && query.data?.job.status === "awaiting_designer",
  });
  const adminAssignees = useQuery({
    ...eligibleDesignAssigneesQuery(jobId),
    enabled: Boolean(jobId) && isAdmin,
  });

  const [action, setAction] = useState<Action>();
  const [designerId, setDesignerId] = useState("");
  const [reassignHeadId, setReassignHeadId] = useState("");
  const [reassignDesignerId, setReassignDesignerId] = useState("");
  const [selectedRevision, setSelectedRevision] = useState<DesignRevision>();
  const [bufferOpen, setBufferOpen] = useState(false);
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const [surveyFiles, setSurveyFiles] = useState<File[]>([]);

  const [evidenceText, setEvidenceText] = useState("");
  const [lossReasonText, setLossReasonText] = useState("");
  const [notesText, setNotesText] = useState("");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["engineering", "design-job", jobId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["engineering", "design-jobs"],
      }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !query.data || !action) {
        throw new Error("Design job is unavailable.");
      }
      if (action === "assign") {
        return assignDesignEngineer(jobId, {
          designerUserId: designerId,
          expectedVersion: query.data.job.rowVersion,
        });
      }
      if (action === "reassign") {
        return reassignDesignJob(jobId, {
          designHeadUserId: reassignHeadId || undefined,
          designerUserId: reassignDesignerId || undefined,
          expectedVersion: query.data.job.rowVersion,
        });
      }
      if (action === "create") {
        return createDesignRevision(jobId, {
          title: String(form.get("title")),
          changeSummary: String(form.get("changeSummary")),
          expectedJobVersion: query.data.job.rowVersion,
        });
      }
      if (!selectedRevision) throw new Error("Revision is unavailable.");
      if (action === "return") {
        return reviewDesignRevision(jobId, selectedRevision.id, {
          decision: "returned",
          reason: String(form.get("reason")),
          expectedVersion: selectedRevision.rowVersion,
        });
      }
      return recordDesignCustomerDecision(jobId, selectedRevision.id, {
        decision:
          action === "customer-approved"
            ? "approved"
            : action === "customer-abandoned"
              ? "abandoned"
              : "changes_requested",
        evidenceReference: String(form.get("evidenceReference") ?? "").trim(),
        lossReason:
          action === "customer-abandoned"
            ? String(form.get("lossReason") ?? "").trim()
            : undefined,
        notes: String(form.get("notes") ?? "").trim() || undefined,
        expectedVersion: selectedRevision.rowVersion,
      });
    },
    async onSuccess() {
      await invalidate();
      setAction(undefined);
      setSelectedRevision(undefined);
      setEvidenceText("");
      setLossReasonText("");
      setNotesText("");
      toast.success("Design workflow updated.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const quickMutation = useMutation({
    mutationFn: async ({
      revision,
      type,
    }: {
      revision: DesignRevision;
      type: "submit" | "approve" | "send";
    }) => {
      if (!jobId) return;
      if (type === "submit") {
        return submitDesignRevision(jobId, revision.id, revision.rowVersion);
      }
      if (type === "approve") {
        return reviewDesignRevision(jobId, revision.id, {
          decision: "approved",
          expectedVersion: revision.rowVersion,
        });
      }
      return sendDesignToCustomer(jobId, revision.id, revision.rowVersion);
    },
    async onSuccess() {
      await invalidate();
      toast.success("Design workflow updated.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      revision,
      kind,
      files,
    }: {
      revision: DesignRevision;
      kind: "cad" | "pdf";
      files: File[];
    }) => {
      if (jobId) {
        for (const file of files) {
          await uploadDesignFile(jobId, revision.id, kind, file);
        }
      }
    },
    async onSuccess(_result, variables) {
      await invalidate();
      toast.success(
        `${variables.files.length} private design file${variables.files.length === 1 ? "" : "s"} uploaded.`,
      );
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const bufferMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId || !query.data) throw new Error("Design job is unavailable.");
      return useDesignDeadlineBuffer(jobId, {
        reason: String(form.get("reason")),
        expectedVersion: query.data.job.rowVersion,
      });
    },
    async onSuccess() {
      await invalidate();
      setBufferOpen(false);
      toast.success("The deadline was extended by 3 calendar days.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const createSurveyMutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!jobId) throw new Error("Design job is unavailable.");
      const filesToUpload = [...surveyFiles];
      const created = await createSurveyRevision(jobId, {
        title: String(form.get("title")),
        changeSummary: String(form.get("changeSummary")),
        surveyedOn: String(form.get("surveyedOn")),
      });
      for (const file of filesToUpload) {
        await uploadSurveyFile(jobId, created.id, file);
      }
      return { created, uploadedCount: filesToUpload.length };
    },
    async onSuccess(result) {
      await invalidate();
      setSurveyFiles([]);
      setSurveyDialogOpen(false);
      toast.success(
        result.uploadedCount
          ? `Survey revision created with ${result.uploadedCount} site file${result.uploadedCount === 1 ? "" : "s"}.`
          : "Survey revision created.",
      );
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const surveyUploadMutation = useMutation({
    mutationFn: async ({
      revision,
      files,
    }: {
      revision: SurveyRevision;
      files: File[];
    }) => {
      if (!jobId) throw new Error("Design job is unavailable.");
      for (const file of files) {
        await uploadSurveyFile(jobId, revision.id, file);
      }
    },
    async onSuccess(_result, variables) {
      await invalidate();
      toast.success(
        `${variables.files.length} private survey file${variables.files.length === 1 ? "" : "s"} uploaded.`,
      );
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const finalizeSurveyMutation = useMutation({
    mutationFn: async (revision: SurveyRevision) => {
      if (!jobId) throw new Error("Design job is unavailable.");
      return finalizeSurveyRevision(jobId, revision.id, revision.rowVersion);
    },
    async onSuccess() {
      await invalidate();
      toast.success("Survey revision finalized.");
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  if (query.isPending) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost">
          <Link to="/engineering/design-jobs">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Design jobs
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Design job unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              query.error,
              "This job is unavailable or outside your assignment.",
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const { job, revisions, surveyRevisions, deadlineExtensions } = query.data;
  const isFrozen = ["paused", "cancelled", "abandoned"].includes(job.status);
  const isDesigner =
    !isFrozen &&
    (user.id === job.designerUserId ||
      user.permissions.includes("system.access.all")) &&
    user.permissions.includes("engineering.design.write");
  const isHead =
    !isFrozen &&
    (user.id === job.designHeadUserId ||
      user.permissions.includes("system.access.all")) &&
    user.permissions.includes("engineering.design.review");
  const canAssignDesigner =
    !isFrozen &&
    (user.id === job.designHeadUserId ||
      user.permissions.includes("system.access.all")) &&
    user.permissions.includes("engineering.design.assign_engineer") &&
    job.status === "awaiting_designer";
  const isSales =
    !isFrozen &&
    user.permissions.includes("engineering.design.customer_decision");
  const canCreate =
    isDesigner &&
    ["authorized", "returned", "changes_requested"].includes(job.status);
  const canUseBuffer =
    isDesigner &&
    !job.designerCompletedAt &&
    Boolean(job.designDueAt) &&
    job.bufferExtensionsUsed < 3;
  const canSurveyEdit = isDesigner || isHead;
  const canCreateSurvey =
    canSurveyEdit &&
    !surveyRevisions.some((revision) => revision.status === "draft");

  const latestRevisionNumber = revisions.reduce(
    (max, r) => Math.max(max, r.revisionNumber),
    0,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <Button asChild className="-ml-2 mb-2" variant="ghost" size="sm">
          <Link to="/engineering/design-jobs">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Design jobs
          </Link>
        </Button>

        {/* Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Engineering · {job.leadNumber}
              </span>
              <StatusBadge status={job.status} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {job.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {job.customerName && (
                <span>
                  Customer:{" "}
                  <strong className="text-foreground">
                    {job.customerName}
                  </strong>
                </span>
              )}
              <span>
                Last modified by{" "}
                <strong className="text-foreground">
                  {job.lastModifiedByName ?? job.authorizedByName ?? "System"}
                </strong>{" "}
                · {new Date(job.updatedAt).toLocaleString()}
              </span>
            </div>
            {job.authorizationNotes && (
              <div className="max-w-3xl pt-1">
                <ExpandableText
                  text={job.authorizationNotes}
                  limit={120}
                  className="text-muted-foreground"
                />
              </div>
            )}
          </div>

          {/* Separated Navigation Links & Primary Workflow CTA */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 text-xs"
              >
                <Link to={`/engineering/design-jobs/${job.id}/boq`}>
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                  BOQ & Estimate
                </Link>
              </Button>
              {user.permissions.includes("engineering.quotation.read") && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  <Link to={`/engineering/design-jobs/${job.id}/quotations`}>
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Quotations
                  </Link>
                </Button>
              )}
            </div>

            {(canAssignDesigner ||
              canCreate ||
              (job.status === "customer_approved" &&
                user.permissions.includes("project.start"))) && (
              <Separator
                orientation="vertical"
                className="h-6 hidden sm:block"
              />
            )}

            {canAssignDesigner && (
              <Button
                onClick={() => setAction("assign")}
                size="sm"
                className="h-8 text-xs"
              >
                <UserRoundCheck className="h-3.5 w-3.5 mr-1.5" />
                Assign Design Engineer
              </Button>
            )}
            {!isFrozen && isAdmin && (
              <Button
                variant="outline"
                onClick={() => {
                  setReassignHeadId(job.designHeadUserId);
                  setReassignDesignerId(job.designerUserId ?? "");
                  setAction("reassign");
                }}
                size="sm"
                className="h-8 text-xs"
              >
                <UserRoundCheck className="h-3.5 w-3.5 mr-1.5" />
                Reassign
              </Button>
            )}
            {job.status === "customer_approved" &&
              user.permissions.includes("project.start") && (
                <StartProjectDialog jobId={job.id} jobTitle={job.title} />
              )}
            {canCreate && (
              <Button
                onClick={() => setAction("create")}
                size="sm"
                className="h-8 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Revision
              </Button>
            )}
          </div>
        </div>

        {/* Engineering Stage Stepper */}
        <div className="mt-5">
          <DesignStageStepper status={job.status} />
        </div>

        {/* Frozen / Hold / Closed Banner */}
        {isFrozen && (
          <Alert
            variant={job.status === "paused" ? "default" : "destructive"}
            className="mt-4"
          >
            <AlertTitle className="text-xs font-semibold uppercase tracking-wide">
              Design Job {job.status}
            </AlertTitle>
            <AlertDescription className="text-xs mt-1">
              {job.status === "paused"
                ? "This design job is paused because the linked lead/opportunity is on hold. Deadline alerts are suspended until resumed."
                : `This design job is ${job.status}${job.closedReason ? `: ${job.closedReason}` : "."} No further revisions or approvals can be recorded.`}
            </AlertDescription>
          </Alert>
        )}

        {/* Operational Overview Stat Cards */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium">
                  Assigned Designer
                </CardDescription>
                <User className="h-4 w-4 text-muted-foreground/70" />
              </div>
              <CardTitle className="text-sm font-semibold pt-1">
                {job.designerName ?? (
                  <span className="text-amber-600 dark:text-amber-500 font-normal text-xs">
                    Awaiting assignment
                  </span>
                )}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium">
                  Design Head / Reviewer
                </CardDescription>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-sm font-semibold pt-1">
                {job.designHeadName ?? "Assigned reviewer"}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium">
                  Site Survey Status
                </CardDescription>
                <MapPinned className="h-4 w-4 text-muted-foreground/70" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <CardTitle className="text-sm font-semibold">
                  {job.surveyRequested ? "Requested" : "Optional"}
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] h-4.5 px-1.5 font-normal"
                >
                  {surveyRevisions.length} rev
                  {surveyRevisions.length === 1 ? "" : "s"}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Timer Card with Embedded Buffer History Popover */}
          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="text-xs font-medium">
                  First Submission Timer
                </CardDescription>
                {deadlineExtensions.length > 0 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <History className="size-3" />
                        {deadlineExtensions.length}/3
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-80 p-3 space-y-2.5"
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Deadline Buffer History
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Each extension adds 3 calendar days (audited).
                        </p>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {deadlineExtensions.map((ext) => (
                          <div
                            key={ext.id}
                            className="rounded-md border bg-muted/20 p-2 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-[11px]">
                                Buffer {ext.sequenceNumber} of 3
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {new Date(ext.newDueAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              {ext.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground/70" />
                )}
              </div>
              <div className="pt-1">
                <DesignDeadline job={job} />
              </div>
            </CardHeader>
            {canUseBuffer && (
              <CardContent className="p-4 pt-1">
                <Button
                  className="w-full h-7 text-xs"
                  variant="outline"
                  size="sm"
                  onClick={() => setBufferOpen(true)}
                >
                  Use 3-day buffer ({3 - job.bufferExtensionsUsed} left)
                </Button>
              </CardContent>
            )}
          </Card>
        </div>

        {/* 3-Tab Workspace (Design Revisions First) */}
        <Tabs defaultValue="revisions" className="mt-6">
          <div className="border-b">
            <TabsList className="h-10 w-full justify-start gap-2 bg-transparent p-0">
              <TabsTrigger
                value="revisions"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Layers className="size-3.5 mr-1.5" />
                Design Revisions
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4.5 px-1.5 text-[10px]"
                >
                  {revisions.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="surveys"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <MapPinned className="size-3.5 mr-1.5" />
                Site Surveys
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4.5 px-1.5 text-[10px]"
                >
                  {surveyRevisions.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Paperclip className="size-3.5 mr-1.5" />
                Client Documents
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: DESIGN PACKAGE REVISIONS */}
          <TabsContent value="revisions" className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Submitted packages are frozen in place. Any corrections or
                customer changes create a fresh revision.
              </p>
              {canCreate && (
                <Button
                  onClick={() => setAction("create")}
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New Revision
                </Button>
              )}
            </div>

            {revisions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileCode2 className="mx-auto mb-2.5 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">
                    No design revision created yet
                  </p>
                  <p className="text-xs max-w-sm mx-auto mt-0.5">
                    {job.status === "awaiting_designer"
                      ? "The assigned design head must assign an engineer first."
                      : "The assigned engineer can now create Revision R01."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              revisions.map((revision) => (
                <RevisionCard
                  key={revision.id}
                  revision={revision}
                  jobId={job.id}
                  defaultExpanded={
                    revision.revisionNumber === latestRevisionNumber
                  }
                  isDesigner={isDesigner}
                  isHead={isHead}
                  isSales={isSales}
                  busy={quickMutation.isPending || uploadMutation.isPending}
                  onQuick={(type) => quickMutation.mutate({ revision, type })}
                  onDialog={(next) => {
                    mutation.reset();
                    setSelectedRevision(revision);
                    setEvidenceText("");
                    setLossReasonText("");
                    setNotesText("");
                    setAction(next);
                  }}
                  onUpload={(kind, files) =>
                    uploadMutation.mutate({ revision, kind, files })
                  }
                />
              ))
            )}
          </TabsContent>

          {/* TAB 2: SITE SURVEY REVISIONS */}
          <TabsContent value="surveys" className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Survey evidence is optional and does not gate CAD engineering.
                Finalized survey packages remain immutable.
              </p>
              {canCreateSurvey && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setSurveyDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New Survey Revision
                </Button>
              )}
            </div>

            {surveyRevisions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Camera className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">
                    No site survey evidence recorded
                  </p>
                  <p className="text-xs max-w-sm mx-auto mt-0.5">
                    The CAD package workflow can proceed without survey files.
                  </p>
                </CardContent>
              </Card>
            ) : (
              surveyRevisions.map((revision) => (
                <SurveyRevisionCard
                  key={revision.id}
                  revision={revision}
                  jobId={job.id}
                  canEdit={canSurveyEdit}
                  busy={
                    surveyUploadMutation.isPending ||
                    finalizeSurveyMutation.isPending
                  }
                  onUpload={(files) =>
                    surveyUploadMutation.mutate({ revision, files })
                  }
                  onFinalize={() => finalizeSurveyMutation.mutate(revision)}
                />
              ))
            )}
          </TabsContent>

          {/* TAB 3: CLIENT DOCUMENTS */}
          <TabsContent value="documents" className="mt-5">
            <OpportunityDocumentsCard
              opportunityId={job.opportunityId}
              canUpload={
                user.permissions.includes("crm.lead.write") ||
                user.permissions.includes("crm.lead.qualify") ||
                user.permissions.includes("system.access.all")
              }
            />
          </TabsContent>
        </Tabs>

        {/* Main Action Dialog (Assign / Create / Return / Customer Decisions) */}
        <Dialog
          open={Boolean(action)}
          onOpenChange={(open) => {
            if (!open) {
              setAction(undefined);
              setSelectedRevision(undefined);
              setDesignerId("");
              setEvidenceText("");
              setLossReasonText("");
              setNotesText("");
            }
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {action === "assign"
                    ? "Assign Design Engineer"
                    : action === "reassign"
                      ? "Reassign Design Head / Engineer"
                      : action === "create"
                        ? "Create Design Revision"
                        : action === "return"
                          ? "Return Revision for Corrections"
                          : action === "customer-approved"
                            ? "Record Customer Approval"
                            : action === "customer-abandoned"
                              ? "Record Customer Design Abandonment"
                              : "Record Customer Changes Requested"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {action === "assign"
                    ? "Only the assigned design head (or administrator) can select the responsible engineer for this job."
                    : action === "reassign"
                      ? "Administrators can reassign the design head and/or design engineer at any active stage."
                      : action === "create"
                        ? "A new mutable draft revision will be initialized."
                        : action === "return"
                          ? "The submitted revision remains immutable; the designer will create a corrected revision."
                          : "Identify traceable evidence for this exact revision (3–1,000 characters required)."}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                {action === "assign" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Design Engineer{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select value={designerId} onValueChange={setDesignerId}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Choose engineer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {designers.data?.map((designer) => (
                          <SelectItem key={designer.id} value={designer.id}>
                            {designer.name} ({designer.email})
                            {designer.isOnLeave ? " · On Leave" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : action === "reassign" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Design Head</Label>
                      <Select value={reassignHeadId} onValueChange={setReassignHeadId}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Choose design head…" />
                        </SelectTrigger>
                        <SelectContent>
                          {adminAssignees.data?.designHeads.map((head) => (
                            <SelectItem key={head.id} value={head.id}>
                              {head.name} ({head.email})
                              {head.isOnLeave ? " · On Leave" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Design Engineer</Label>
                      <Select value={reassignDesignerId} onValueChange={setReassignDesignerId}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Keep unassigned / choose engineer…" />
                        </SelectTrigger>
                        <SelectContent>
                          {adminAssignees.data?.designers.map((designer) => (
                            <SelectItem key={designer.id} value={designer.id}>
                              {designer.name} ({designer.email})
                              {designer.isOnLeave ? " · On Leave" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : action === "create" ? (
                  <>
                    <Field label="Revision Title" name="title" required />
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="changeSummary"
                        className="text-xs font-semibold"
                      >
                        Change Summary{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="changeSummary"
                        name="changeSummary"
                        rows={3}
                        className="text-sm"
                        placeholder="Key design adjustments, additions, or modifications…"
                        required
                      />
                    </div>
                  </>
                ) : action === "return" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="reason" className="text-xs font-semibold">
                      Return Reason <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      rows={3}
                      className="text-sm"
                      placeholder="Specify technical deviations or missing requirements…"
                      required
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="evidenceReference"
                          className="text-xs font-semibold"
                        >
                          Evidence Reference{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <span
                          className={cn(
                            "text-[10px] font-mono",
                            evidenceText.length >= 3 &&
                              evidenceText.length <= 1000
                              ? "text-muted-foreground"
                              : "text-destructive font-medium",
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
                        placeholder="Email date, stamped drawing, MOM date, or PO number"
                        className="h-9 text-sm"
                        minLength={3}
                        maxLength={1000}
                        required
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Traceable proof for this revision (min 3 chars).
                      </p>
                    </div>

                    {action === "customer-abandoned" && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="lossReason"
                          className="text-xs font-semibold"
                        >
                          Loss / Abandonment Reason{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="lossReason"
                          name="lossReason"
                          value={lossReasonText}
                          onChange={(e) => setLossReasonText(e.target.value)}
                          placeholder="e.g. Project shelved by client, budget cancelled"
                          className="h-9 text-sm"
                          minLength={3}
                          maxLength={500}
                          required
                        />
                        <p className="text-[11px] text-destructive">
                          Abandoning closes this design job and marks the linked
                          Lead & Opportunity as Lost.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="notes"
                          className="text-xs font-semibold"
                        >
                          Customer Notes / Comments (optional)
                        </Label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {notesText.length}/1000
                        </span>
                      </div>
                      <Textarea
                        id="notes"
                        name="notes"
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        rows={3}
                        className="text-sm"
                        maxLength={1000}
                        placeholder="Any conditional approvals, customer remarks, or scope notes…"
                      />
                    </div>
                  </>
                )}

                {mutation.isError && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {getApiErrorMessage(mutation.error)}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter className="mt-6 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAction(undefined)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    mutation.isPending ||
                    (action === "assign" && !designerId) ||
                    (action === "reassign" && !reassignHeadId && !reassignDesignerId) ||
                    ((action === "customer-approved" ||
                      action === "changes-requested" ||
                      action === "customer-abandoned") &&
                      evidenceText.trim().length < 3) ||
                    (action === "customer-abandoned" &&
                      lossReasonText.trim().length < 3)
                  }
                  type="submit"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                    </>
                  ) : action === "assign" ? (
                    "Assign Engineer"
                  ) : (
                    "Save & Continue"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 3-day Deadline Buffer Dialog */}
        <Dialog open={bufferOpen} onOpenChange={setBufferOpen}>
          <DialogContent className="sm:max-w-md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                bufferMutation.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>Use 3-Day Deadline Buffer</DialogTitle>
                <DialogDescription className="text-xs">
                  This grants 3 calendar days to the first-submission deadline.{" "}
                  <strong>{3 - job.bufferExtensionsUsed}</strong> buffer
                  {3 - job.bufferExtensionsUsed === 1 ? "" : "s"} remain.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-2">
                <Label htmlFor="bufferReason" className="text-xs font-semibold">
                  Reason for Extension{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="bufferReason"
                  name="reason"
                  rows={3}
                  className="text-sm"
                  minLength={3}
                  maxLength={500}
                  placeholder="e.g. Awaiting architectural CAD update from client…"
                  required
                />
                {bufferMutation.isError && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {getApiErrorMessage(bufferMutation.error)}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter className="mt-6 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBufferOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={bufferMutation.isPending}>
                  {bufferMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                      Extending…
                    </>
                  ) : (
                    "Extend Deadline"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* New Survey Revision Dialog */}
        <Dialog
          open={surveyDialogOpen}
          onOpenChange={(open) => {
            setSurveyDialogOpen(open);
            if (!open) setSurveyFiles([]);
          }}
        >
          <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createSurveyMutation.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>Create Site Survey Draft</DialogTitle>
                <DialogDescription className="text-xs">
                  Initiate a numbered revision for site photos and inspection
                  notes. Upload site images now or after creating the draft.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <Field
                  label="Survey Title"
                  name="title"
                  placeholder="e.g. Initial Basement Sprinkler Route Survey"
                  minLength={2}
                  maxLength={200}
                  required
                />
                <div className="space-y-1.5">
                  <Label htmlFor="surveyedOn" className="text-xs font-semibold">
                    Date of Site Visit{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="surveyedOn"
                    name="surveyedOn"
                    type="date"
                    className="h-9 text-sm"
                    defaultValue={localDateValue(new Date())}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="surveyChangeSummary"
                    className="text-xs font-semibold"
                  >
                    Revision Summary <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="surveyChangeSummary"
                    name="changeSummary"
                    minLength={2}
                    maxLength={1000}
                    rows={3}
                    className="text-sm"
                    placeholder="Key observations, obstructions, or structural deviations seen on site…"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Camera className="size-3.5 text-primary" />
                    Site Photos / Evidence (Optional)
                  </Label>
                  <FileDropzone
                    id="survey-initial-files"
                    label="Drag & drop site photos or PDFs, or browse"
                    hint="JPG, PNG, WebP, or PDF up to 20 MiB each (max 25 files)."
                    accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                    allowedMimeTypes={
                      new Set([
                        "image/jpeg",
                        "image/png",
                        "image/webp",
                        "application/pdf",
                      ])
                    }
                    allowedExtensions={
                      new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"])
                    }
                    maxFiles={25}
                    files={surveyFiles}
                    onFilesChange={setSurveyFiles}
                    compact
                  />
                </div>

                {createSurveyMutation.isError && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {getApiErrorMessage(createSurveyMutation.error)}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter className="mt-6 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSurveyDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createSurveyMutation.isPending}>
                  {createSurveyMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                      Creating…
                    </>
                  ) : (
                    "Create Survey Draft"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}

function SurveyRevisionCard({
  revision,
  jobId,
  canEdit,
  busy,
  onUpload,
  onFinalize,
}: {
  revision: SurveyRevision;
  jobId: string;
  canEdit: boolean;
  busy: boolean;
  onUpload: (files: File[]) => void;
  onFinalize: () => void;
}) {
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [previewFile, setPreviewFile] =
    useState<SurveyRevision["files"][number]>();

  return (
    <Card className="shadow-xs overflow-hidden">
      <CardHeader className="border-b bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="font-mono text-xs font-semibold"
              >
                S{revision.revisionNumber}
              </Badge>
              <StatusBadge status={revision.status} />
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(
                  `${revision.surveyedOn}T00:00:00`,
                ).toLocaleDateString()}
              </span>
            </div>
            <CardTitle className="text-base font-semibold pt-1">
              {revision.title}
            </CardTitle>
            <div className="max-w-2xl">
              <ExpandableText
                text={revision.changeSummary}
                limit={90}
                className="text-xs text-muted-foreground"
              />
            </div>
          </div>
          {revision.status === "finalized" && (
            <Badge variant="outline" className="gap-1 text-[11px] font-mono">
              <LockKeyhole className="h-3 w-3" />
              Immutable
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {revision.files.map((file) => {
            const isImage = isImageFile(file.mimeType, file.originalName);
            const url = surveyFileUrl(jobId, revision.id, file.id);
            return (
              <div
                className="flex flex-col justify-between gap-2.5 rounded-lg border bg-card p-3 shadow-2xs hover:border-primary/30 transition-colors"
                key={file.id}
              >
                {isImage && (
                  <button
                    type="button"
                    onClick={() => setPreviewFile(file)}
                    className="overflow-hidden rounded-md border bg-muted/20 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <img
                      src={url}
                      alt={file.originalName}
                      className="h-44 w-full object-cover transition-transform hover:scale-[1.02]"
                    />
                  </button>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {file.originalName}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256
                      Verified
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setPreviewFile(file)}
                          aria-label={`Preview ${file.originalName}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          asChild
                          size="icon-sm"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <a
                            href={url}
                            download={file.originalName}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Download ${file.originalName}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download survey file</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <UploadedFilePreviewDialog
          open={Boolean(previewFile)}
          onOpenChange={(open) => !open && setPreviewFile(undefined)}
          title={previewFile?.originalName}
          description="Site survey evidence preview"
          src={
            previewFile
              ? surveyFileUrl(jobId, revision.id, previewFile.id)
              : undefined
          }
          mimeType={previewFile?.mimeType}
          downloadHref={
            previewFile
              ? surveyFileUrl(jobId, revision.id, previewFile.id)
              : undefined
          }
        />

        {revision.files.length === 0 && (
          <Alert>
            <Camera className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">
              No survey files uploaded
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              This survey draft requires at least one PDF or photo before it can
              be finalized.
            </AlertDescription>
          </Alert>
        )}

        {canEdit && revision.status === "draft" && (
          <>
            <Separator />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-64 flex-1">
                <UploadControl
                  label="Add Site Photos / Survey Files (JPG, PNG, WebP, PDF)"
                  accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                  disabled={busy}
                  onFile={onUpload}
                />
              </div>
              <Button
                size="sm"
                disabled={busy || revision.files.length === 0}
                onClick={() => setFinalizeOpen(true)}
              >
                <LockKeyhole className="h-3.5 w-3.5 mr-1.5" />
                Finalize Revision
              </Button>
            </div>
          </>
        )}

        {revision.status === "finalized" && revision.finalizedAt && (
          <p className="text-[11px] text-muted-foreground font-mono">
            Finalized on {new Date(revision.finalizedAt).toLocaleString()}.
          </p>
        )}
      </CardContent>

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Finalize Survey S{revision.revisionNumber}?
            </DialogTitle>
            <DialogDescription className="text-xs">
              This permanently freezes the revision and its{" "}
              {revision.files.length} file
              {revision.files.length === 1 ? "" : "s"}. Any future changes will
              require a new numbered survey revision.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setFinalizeOpen(false);
                onFinalize();
              }}
            >
              Confirm & Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RevisionCard({
  revision,
  jobId,
  defaultExpanded,
  isDesigner,
  isHead,
  isSales,
  busy,
  onQuick,
  onDialog,
  onUpload,
}: {
  revision: DesignRevision;
  jobId: string;
  defaultExpanded: boolean;
  isDesigner: boolean;
  isHead: boolean;
  isSales: boolean;
  busy: boolean;
  onQuick: (type: "submit" | "approve" | "send") => void;
  onDialog: (action: Exclude<Action, "create" | "assign">) => void;
  onUpload: (kind: "cad" | "pdf", files: File[]) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const cadFiles = revision.files.filter((file) => file.kind === "cad");
  const pdfFiles = revision.files.filter((file) => file.kind === "pdf");

  return (
    <Card className="shadow-xs overflow-hidden">
      <CardHeader className={cn("bg-card/60 p-4", expanded && "border-b")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-start gap-2.5 text-left min-w-0 flex-1 group"
          >
            <span className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </span>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="font-mono text-xs font-semibold"
                >
                  R{revision.revisionNumber}
                </Badge>
                <StatusBadge status={revision.status} />
                {!expanded && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {cadFiles.length} CAD · {pdfFiles.length} PDF
                  </span>
                )}
              </div>
              <CardTitle className="text-sm sm:text-base font-semibold pt-0.5 truncate">
                {revision.title}
              </CardTitle>
              {expanded && (
                <div className="max-w-2xl">
                  <ExpandableText
                    text={revision.changeSummary}
                    limit={95}
                    className="text-xs text-muted-foreground"
                  />
                </div>
              )}
            </div>
          </button>

          {expanded && (
            <div className="flex flex-wrap items-center gap-2">
              {isDesigner && revision.status === "draft" && (
                <Button
                  size="sm"
                  disabled={
                    busy || cadFiles.length === 0 || pdfFiles.length === 0
                  }
                  onClick={() => onQuick("submit")}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Submit for Internal Review
                </Button>
              )}
              {isHead && revision.status === "submitted" && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    variant="outline"
                    onClick={() => onDialog("return")}
                  >
                    Return
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onQuick("approve")}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                    Approve Internally
                  </Button>
                </>
              )}
              {isSales && revision.status === "internally_approved" && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onQuick("send")}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Mark Sent to Customer
                </Button>
              )}
              {isSales && revision.status === "sent_to_customer" && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    variant="destructive"
                    onClick={() => onDialog("customer-abandoned")}
                  >
                    Customer Abandoned
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    variant="outline"
                    onClick={() => onDialog("changes-requested")}
                  >
                    Changes Requested
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onDialog("customer-approved")}
                  >
                    <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                    Customer Approved
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <FileGroup
              title="Original CAD Drawings"
              badge="Download only"
              icon={
                <FileCode2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              }
              files={cadFiles}
              jobId={jobId}
              revisionId={revision.id}
            />
            <FileGroup
              title="PDF Printable Previews"
              badge="Direct preview"
              icon={
                <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              }
              files={pdfFiles}
              jobId={jobId}
              revisionId={revision.id}
            />
          </div>

          {isDesigner && revision.status === "draft" && (
            <>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <UploadControl
                  label="Add Original CAD (DWG / DXF)"
                  accept=".dwg,.dxf"
                  disabled={busy}
                  onFile={(file) => onUpload("cad", file)}
                />
                <UploadControl
                  label="Add PDF Printable Preview"
                  accept="application/pdf,.pdf"
                  disabled={busy}
                  onFile={(file) => onUpload("pdf", file)}
                />
              </div>
            </>
          )}

          {revision.review && (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">
                Internal Review Decision: {revision.review.decision}
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                {revision.review.reason || "Approved without notes."}
              </AlertDescription>
            </Alert>
          )}

          {revision.customerDecision && (
            <Alert>
              <FileCheck2 className="h-4 w-4 text-primary" />
              <AlertTitle className="text-xs font-semibold">
                Customer Decision:{" "}
                {revision.customerDecision.decision.replaceAll("_", " ")}
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                Evidence:{" "}
                <strong className="text-foreground">
                  {revision.customerDecision.evidenceReference}
                </strong>
                {revision.customerDecision.notes
                  ? ` · ${revision.customerDecision.notes}`
                  : ""}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function FileGroup({
  title,
  badge,
  icon,
  files,
  jobId,
  revisionId,
}: {
  title: string;
  badge: string;
  icon: React.ReactNode;
  files: DesignRevision["files"];
  jobId: string;
  revisionId: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {icon}
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground font-mono">
          {badge}
        </span>
      </div>

      <div className="space-y-2">
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground bg-muted/10">
            No files attached yet.
          </div>
        ) : (
          files.map((file) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2.5 text-xs shadow-2xs hover:border-primary/30 transition-colors"
              key={file.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {file.originalName}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256
                </p>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    size="icon-sm"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <a
                      href={designFileUrl(jobId, revisionId, file.id)}
                      target={file.kind === "pdf" ? "_blank" : undefined}
                      rel="noreferrer"
                      aria-label={`${file.kind === "pdf" ? "Preview" : "Download"} ${file.originalName}`}
                    >
                      {file.kind === "pdf" ? (
                        <ExternalLink className="h-3.5 w-3.5" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {file.kind === "pdf" ? "Preview PDF" : "Download CAD File"}
                </TooltipContent>
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UploadControl({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  onFile: (files: File[]) => void;
}) {
  const maxBytes = accept.includes(".dwg")
    ? 100 * 1024 * 1024
    : 20 * 1024 * 1024;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <FileDropzone
        label="Drag & drop files here, or click to upload"
        hint="Multiple files supported. Private SHA-256 checksums generated on upload."
        accept={accept}
        maxFileBytes={maxBytes}
        maxFiles={25}
        disabled={disabled}
        uploading={disabled}
        showPreviews={false}
        compact
        onFilesSelected={(selected) => {
          if (selected.length) onFile(selected);
        }}
      />
    </div>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs font-semibold">
        {label} <span className="text-destructive">*</span>
      </Label>
      <Input id={name} name={name} className="h-9 text-sm" {...props} />
    </div>
  );
}

function localDateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
