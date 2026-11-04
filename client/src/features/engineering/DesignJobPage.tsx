import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  ClipboardList,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  LockKeyhole,
  MapPinned,
  Plus,
  Send,
  ShieldCheck,
  Upload,
  UserRoundCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  User,
  Clock,
  Sparkles,
  Layers,
  FileCheck2,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  createDesignRevision,
  createSurveyRevision,
  assignDesignEngineer,
  designFileUrl,
  designJobQuery,
  eligibleDesignersQuery,
  recordDesignCustomerDecision,
  finalizeSurveyRevision,
  reviewDesignRevision,
  sendDesignToCustomer,
  submitDesignRevision,
  surveyFileUrl,
  useDesignDeadlineBuffer,
  uploadDesignFile,
  uploadSurveyFile,
  type DesignRevision,
  type SurveyRevision,
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DesignDeadline } from "./DesignDeadline";
import { StartProjectDialog } from "@/features/projects/StartProjectDialog";

type Action =
  | "assign"
  | "create"
  | "return"
  | "customer-approved"
  | "changes-requested";

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
  const designers = useQuery({
    ...eligibleDesignersQuery(jobId),
    enabled: Boolean(jobId) && query.data?.job.status === "awaiting_designer",
  });

  const [action, setAction] = useState<Action>();
  const [designerId, setDesignerId] = useState("");
  const [selectedRevision, setSelectedRevision] = useState<DesignRevision>();
  const [bufferOpen, setBufferOpen] = useState(false);
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);

  // Form field character counters
  const [evidenceText, setEvidenceText] = useState("");
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
          action === "customer-approved" ? "approved" : "changes_requested",
        evidenceReference: String(form.get("evidenceReference") ?? "").trim(),
        notes: String(form.get("notes") ?? "").trim() || undefined,
        expectedVersion: selectedRevision.rowVersion,
      });
    },
    async onSuccess() {
      await invalidate();
      setAction(undefined);
      setSelectedRevision(undefined);
      setEvidenceText("");
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
      return createSurveyRevision(jobId, {
        title: String(form.get("title")),
        changeSummary: String(form.get("changeSummary")),
        surveyedOn: String(form.get("surveyedOn")),
      });
    },
    async onSuccess() {
      await invalidate();
      setSurveyDialogOpen(false);
      toast.success("Survey revision created.");
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
        <Skeleton className="h-36" />
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
  const isDesigner =
    (user.id === job.designerUserId ||
      user.permissions.includes("system.access.all")) &&
    user.permissions.includes("engineering.design.write");
  const isHead =
    (user.id === job.designHeadUserId ||
      user.permissions.includes("system.access.all")) &&
    user.permissions.includes("engineering.design.review");
  const canAssignDesigner =
    (user.id === job.designHeadUserId ||
      user.permissions.includes("system.access.all")) &&
    user.permissions.includes("engineering.design.assign_engineer") &&
    job.status === "awaiting_designer";
  const isSales = user.permissions.includes(
    "engineering.design.customer_decision",
  );
  const canCreate =
    isDesigner &&
    ["authorized", "returned", "changes_requested"].includes(job.status);
  const canUseBuffer =
    isDesigner &&
    !job.designerCompletedAt &&
    Boolean(job.designDueAt) &&
    job.bufferExtensionsUsed < 3;
  const canCreateSurvey =
    isDesigner &&
    !surveyRevisions.some((revision) => revision.status === "draft");

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <Button asChild className="-ml-2 mb-2" variant="ghost">
          <Link to="/engineering/design-jobs">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Design jobs
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Engineering · {job.leadNumber}
              </span>
              <StatusBadge status={job.status} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {job.title}
            </h1>
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

          <div className="flex flex-wrap items-center gap-2">
            {canAssignDesigner && (
              <Button onClick={() => setAction("assign")} size="sm">
                <UserRoundCheck className="h-4 w-4 mr-1.5" />
                Assign Design Engineer
              </Button>
            )}
            {job.status === "customer_approved" &&
              user.permissions.includes("project.start") && (
                <StartProjectDialog jobId={job.id} jobTitle={job.title} />
              )}
            <Button asChild variant="outline" size="sm">
              <Link to={`/engineering/design-jobs/${job.id}/boq`}>
                <ClipboardList className="h-4 w-4 mr-1.5" />
                BOQ & Estimate
              </Link>
            </Button>
            {user.permissions.includes("engineering.quotation.read") && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/engineering/design-jobs/${job.id}/quotations`}>
                  <FileText className="h-4 w-4 mr-1.5" />
                  Quotations
                </Link>
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setAction("create")} size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                New Revision
              </Button>
            )}
          </div>
        </div>

        {/* Operational Overview Stat Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
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
            <CardHeader className="p-4 pb-2">
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
            <CardHeader className="p-4 pb-2">
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

          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium">
                  First Submission Timer
                </CardDescription>
                <Clock className="h-4 w-4 text-muted-foreground/70" />
              </div>
              <div className="pt-1">
                <DesignDeadline job={job} />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              {canUseBuffer && (
                <Button
                  className="w-full h-7 text-xs mt-1"
                  variant="outline"
                  size="sm"
                  onClick={() => setBufferOpen(true)}
                >
                  Use 3-day buffer ({3 - job.bufferExtensionsUsed} left)
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Buffer Extension History */}
        {deadlineExtensions.length > 0 && (
          <Card className="mt-4 shadow-2xs border-dashed bg-muted/20">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Deadline Buffer History
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Each extension adds exactly 3 calendar days and is permanently
                audited.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2">
              {deadlineExtensions.map((extension) => (
                <div
                  className="rounded-lg border bg-card p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  key={extension.id}
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">
                      Buffer Extension {extension.sequenceNumber} of 3
                    </span>
                    <p className="text-muted-foreground">{extension.reason}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="self-start sm:self-center font-mono text-[10px]"
                  >
                    New Due: {new Date(extension.newDueAt).toLocaleString()}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Section 1: Site Survey Revisions */}
        <section className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                <MapPinned className="h-4.5 w-4.5 text-primary" />
                Site Survey Revisions
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Survey evidence is optional and does not gate CAD engineering.
                Finalized survey packages remain immutable.
              </p>
            </div>
            {canCreateSurvey && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSurveyDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Survey Revision
              </Button>
            )}
          </div>

          {surveyRevisions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
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
                canEdit={isDesigner}
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
        </section>

        {/* Section 2: Package Revisions */}
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <Layers className="h-4.5 w-4.5 text-primary" />
              Design Package Revisions
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Submitted packages are frozen in place. Any corrections or
              customer changes create a fresh revision.
            </p>
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
                isDesigner={isDesigner}
                isHead={isHead}
                isSales={isSales}
                busy={quickMutation.isPending || uploadMutation.isPending}
                onQuick={(type) => quickMutation.mutate({ revision, type })}
                onDialog={(next) => {
                  mutation.reset();
                  setSelectedRevision(revision);
                  setEvidenceText("");
                  setNotesText("");
                  setAction(next);
                }}
                onUpload={(kind, files) =>
                  uploadMutation.mutate({ revision, kind, files })
                }
              />
            ))
          )}
        </section>

        {/* Main Action Dialog (Assign / Create / Return / Customer Decisions) */}
        <Dialog
          open={Boolean(action)}
          onOpenChange={(open) => {
            if (!open) {
              setAction(undefined);
              setSelectedRevision(undefined);
              setDesignerId("");
              setEvidenceText("");
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
                    : action === "create"
                      ? "Create Design Revision"
                      : action === "return"
                        ? "Return Revision for Corrections"
                        : action === "customer-approved"
                          ? "Record Customer Approval"
                          : "Record Customer Changes Requested"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {action === "assign"
                    ? "Only the assigned design head can select the responsible engineer for this job."
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
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                    ((action === "customer-approved" ||
                      action === "changes-requested") &&
                      evidenceText.trim().length < 3)
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
        <Dialog open={surveyDialogOpen} onOpenChange={setSurveyDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createSurveyMutation.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>Create Site Survey Draft</DialogTitle>
                <DialogDescription className="text-xs">
                  Initiate a numbered revision for photos and site notes. You
                  must upload at least one file before finalization.
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
        <div className="grid gap-2.5 sm:grid-cols-2">
          {revision.files.map((file) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-2xs hover:border-primary/30 transition-colors"
              key={file.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {file.originalName}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256
                  Verified
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
                      href={surveyFileUrl(jobId, revision.id, file.id)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${file.originalName}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download survey file</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>

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
                  label="Upload Survey Evidence (PDF / Photos)"
                  accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
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
  isDesigner: boolean;
  isHead: boolean;
  isSales: boolean;
  busy: boolean;
  onQuick: (type: "submit" | "approve" | "send") => void;
  onDialog: (action: Exclude<Action, "create" | "assign">) => void;
  onUpload: (kind: "cad" | "pdf", files: File[]) => void;
}) {
  const cadFiles = revision.files.filter((file) => file.kind === "cad");
  const pdfFiles = revision.files.filter((file) => file.kind === "pdf");

  return (
    <Card className="shadow-xs overflow-hidden">
      <CardHeader className="border-b bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="font-mono text-xs font-semibold"
              >
                R{revision.revisionNumber}
              </Badge>
              <StatusBadge status={revision.status} />
            </div>
            <CardTitle className="text-base font-semibold pt-1">
              {revision.title}
            </CardTitle>
            <div className="max-w-2xl">
              <ExpandableText
                text={revision.changeSummary}
                limit={95}
                className="text-xs text-muted-foreground"
              />
            </div>
          </div>

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
              <Button size="sm" disabled={busy} onClick={() => onQuick("send")}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Mark Sent to Customer
              </Button>
            )}
            {isSales && revision.status === "sent_to_customer" && (
              <>
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
        </div>
      </CardHeader>

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

        {/* Review Results */}
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
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Upload className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9 text-xs"
          type="file"
          accept={accept}
          disabled={disabled}
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length) onFile(files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Select one or more files. Private checksums are generated upon upload.
      </p>
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
