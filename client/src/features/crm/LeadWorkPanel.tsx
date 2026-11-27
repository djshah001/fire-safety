import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Building,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  DraftingCompass,
  ExternalLink,
  FileCode,
  FileImage,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  Paperclip,
  PauseCircle,
  Phone,
  PhoneCall,
  PlayCircle,
  Send,
  ShieldCheck,
  User,
  Users,
  XCircle,
} from "lucide-react";

import {
  activitiesQuery,
  attachmentsQuery,
  createActivity,
  createReminder,
  downloadLeadAttachment,
  leadAttachmentPreviewUrl,
  leadRemindersQuery,
  type Lead,
  type LeadAttachment,
  type LeadStage,
} from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import {
  isImageFile,
  UploadedFilePreviewDialog,
} from "@/components/ImagePreview";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OpportunityDocumentsCard } from "@/features/crm/OpportunityDocumentsCard";
import { cn } from "@/lib/utils";

type Assignee = { id: string; name: string };

const PIPELINE_STEPS: Array<{ key: LeadStage; label: string }> = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "design_authorized", label: "Design" },
  { key: "commercial_negotiation", label: "Negotiation" },
  { key: "won", label: "Won" },
];

const localDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function ExpandableSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 140;

  return (
    <div className="min-w-0 w-full whitespace-normal">
      <p
        className={cn(
          "text-xs leading-relaxed text-muted-foreground break-words whitespace-normal",
          !expanded && isLong && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
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
      )}
    </div>
  );
}

function StageStepper({ stage }: { stage: LeadStage }) {
  const isTerminalException = stage === "lost" || stage === "on_hold";
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {PIPELINE_STEPS.map((step, idx) => {
          const isCompleted = !isTerminalException && currentIndex > idx;
          const isCurrent = !isTerminalException && currentIndex === idx;

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
                      ? "text-primary font-medium"
                      : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeadWorkPanel({
  lead,
  canAssign,
  canUploadOpportunityDocs = false,
  canAuthorizeDesign,
  assignees,
  stageChangePending,
  stageChangeError,
  onStageChange,
  onMarkLost,
  onConvert,
  onAuthorizeDesign,
}: {
  lead: Lead;
  canAssign: boolean;
  canUploadOpportunityDocs?: boolean;
  canAuthorizeDesign: boolean;
  assignees: Assignee[];
  stageChangePending: boolean;
  stageChangeError: unknown;
  onStageChange: (input: {
    lead: Lead;
    stage: "contacted" | "on_hold" | "resume";
  }) => void;
  onMarkLost: (lead: Lead) => void;
  onConvert: () => void;
  onAuthorizeDesign: () => void;
}) {
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [activityType, setActivityType] = useState<"call" | "meeting" | "note">(
    "call",
  );
  const [summaryText, setSummaryText] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<LeadAttachment>();
  const queryClient = useQueryClient();

  const activities = useQuery(activitiesQuery(lead.id));
  const reminders = useQuery(leadRemindersQuery(lead.id));
  const attachments = useQuery(attachmentsQuery(lead.id));

  const activityCreation = useMutation({
    mutationFn: () =>
      createActivity(lead.id, {
        type: activityType,
        summary: summaryText.trim(),
        occurredAt: new Date().toISOString(),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["crm", "lead", lead.id, "activities"],
      });
      setSummaryText("");
      toast.success("Activity recorded.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const reminderCreation = useMutation({
    mutationFn: (form: FormData) =>
      createReminder(lead.id, {
        title: String(form.get("title")).trim(),
        assigneeUserId:
          !form.get("assigneeUserId") || form.get("assigneeUserId") === "self"
            ? undefined
            : String(form.get("assigneeUserId")),
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        dueAt: new Date(String(form.get("dueAt"))).toISOString(),
        recurrence: String(form.get("recurrence")) as
          | "none"
          | "daily"
          | "weekly"
          | "monthly",
      }),
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["crm", "lead", lead.id, "reminders"],
        }),
        queryClient.invalidateQueries({ queryKey: ["crm", "reminders"] }),
      ]);
      setShowReminderDialog(false);
      toast.success("Follow-up scheduled.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const canModifyStage = [
    "new",
    "contacted",
    "qualified",
    "design_authorized",
    "commercial_negotiation",
    "on_hold",
  ].includes(lead.stage);

  const overdueCount = (reminders.data ?? []).filter(
    (r) => r.status === "pending" && new Date(r.dueAt).getTime() < Date.now(),
  ).length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        {/* Pinned Header + Stepper + Primary Action */}
        <div className="border-b bg-card/60 px-6 pt-5 pb-4 space-y-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-primary">
                  {lead.leadNumber}
                </span>
                <StatusBadge status={lead.stage} />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">
                {lead.inquiryName}
              </h2>
              <p className="text-xs text-muted-foreground">
                {lead.contactName}
                {lead.companyName ? ` · ${lead.companyName}` : ""}
              </p>
            </div>

            {canModifyStage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-8 shrink-0"
                    aria-label="More lead actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {lead.stage === "new" && (
                    <DropdownMenuItem
                      disabled={stageChangePending}
                      onClick={() =>
                        onStageChange({ lead, stage: "contacted" })
                      }
                    >
                      <Check className="size-3.5 mr-2" />
                      Mark contacted
                    </DropdownMenuItem>
                  )}
                  {lead.stage === "on_hold" ? (
                    <DropdownMenuItem
                      disabled={stageChangePending}
                      onClick={() => onStageChange({ lead, stage: "resume" })}
                    >
                      <PlayCircle className="size-3.5 mr-2" />
                      Resume lead
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={stageChangePending}
                      onClick={() => onStageChange({ lead, stage: "on_hold" })}
                    >
                      <PauseCircle className="size-3.5 mr-2" />
                      Put on hold
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={stageChangePending}
                    onClick={() => onMarkLost(lead)}
                    className="text-destructive focus:text-destructive"
                  >
                    <XCircle className="size-3.5 mr-2" />
                    Mark as lost
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <StageStepper stage={lead.stage} />

          {/* Single Primary Next-Step CTA */}
          <div className="flex flex-wrap items-center gap-2">
            {lead.stage === "new" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={stageChangePending}
                  onClick={() => onStageChange({ lead, stage: "contacted" })}
                  className="h-8 text-xs"
                >
                  Mark Contacted
                </Button>
                <Button
                  size="sm"
                  onClick={onConvert}
                  className="h-8 text-xs flex-1"
                >
                  Qualify into Opportunity →
                </Button>
              </>
            )}

            {lead.stage === "contacted" && (
              <Button
                size="sm"
                onClick={onConvert}
                className="h-8 text-xs w-full"
              >
                Qualify into Opportunity →
              </Button>
            )}

            {lead.stage === "qualified" && canAuthorizeDesign && (
              <Button
                size="sm"
                onClick={onAuthorizeDesign}
                className="h-8 text-xs w-full"
              >
                <DraftingCompass className="size-3.5 mr-1.5" />
                Authorize Free Design
              </Button>
            )}

            {lead.stage === "on_hold" && (
              <Button
                size="sm"
                disabled={stageChangePending}
                onClick={() => onStageChange({ lead, stage: "resume" })}
                className="h-8 text-xs w-full"
              >
                <PlayCircle className="size-3.5 mr-1.5" />
                Resume Lead
              </Button>
            )}

            {lead.designJobId && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 text-xs w-full"
              >
                <Link to={`/engineering/design-jobs/${lead.designJobId}`}>
                  <DraftingCompass className="size-3.5 mr-1.5" />
                  Open Linked Design Job
                  <ExternalLink className="size-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>

          {Boolean(stageChangeError) && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                {getApiErrorMessage(stageChangeError)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Tabbed Workspace */}
        <Tabs
          defaultValue="overview"
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="border-b px-6 pt-2">
            <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0">
              <TabsTrigger
                value="overview"
                className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Activity
                {(activities.data?.length ?? 0) > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 h-4 px-1 text-[10px]"
                  >
                    {activities.data?.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="followups"
                className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Follow-ups
                {(reminders.data?.length ?? 0) > 0 && (
                  <Badge
                    variant={overdueCount > 0 ? "destructive" : "secondary"}
                    className="ml-1.5 h-4 px-1 text-[10px]"
                  >
                    {reminders.data?.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Documents
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: OVERVIEW */}
          <TabsContent
            value="overview"
            className="flex-1 overflow-y-auto px-6 py-5 space-y-4 mt-0"
          >
            {lead.stage === "design_authorized" && (
              <Alert className="bg-primary/5 border-primary/20">
                <ShieldCheck className="size-4 text-primary" />
                <AlertTitle className="text-xs font-semibold">
                  Design Authorized
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  Ready for CAD workspace engineering. Commercial award is
                  independent.
                </AlertDescription>
              </Alert>
            )}

            {/* Contact Card */}
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5 text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contact Information
              </p>
              <div className="space-y-1.5">
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="size-3.5 text-primary shrink-0" />
                    <span className="font-mono">{lead.phone}</span>
                  </a>
                )}
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="flex items-center gap-2 text-foreground hover:text-primary transition-colors truncate"
                  >
                    <Mail className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">{lead.email}</span>
                  </a>
                )}
                {lead.address && (
                  <p className="flex items-start gap-2 text-muted-foreground pt-1.5 border-t">
                    <Building className="size-3.5 shrink-0 mt-0.5" />
                    <span>{lead.address}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Classification Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border p-3 bg-card">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Service Category
                </span>
                <span className="mt-0.5 font-medium text-foreground block">
                  {lead.serviceCategoryName ?? "—"}
                </span>
              </div>
              <div className="rounded-lg border p-3 bg-card">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Source
                </span>
                <span className="mt-0.5 font-medium text-foreground block">
                  {lead.source}
                </span>
              </div>
              <div className="rounded-lg border p-3 bg-card">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Purpose
                </span>
                <span className="mt-0.5 font-medium text-foreground block">
                  {lead.purposeName}
                </span>
              </div>
              <div className="rounded-lg border p-3 bg-card">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Market Sector
                </span>
                <span className="mt-0.5 font-medium text-foreground block">
                  {lead.sectorName}
                </span>
              </div>
            </div>

            {/* Audit Trail */}
            <div className="rounded-lg border bg-muted/20 p-3.5 text-xs space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ownership & Audit
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <User className="size-3.5" /> Owner
                </span>
                <span className="font-medium text-foreground">
                  {lead.ownerName ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Last edited by
                </span>
                <span className="font-medium text-foreground">
                  {lead.lastModifiedByName ?? lead.createdByName ?? "System"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Updated at</span>
                <span className="font-mono text-[11px] text-foreground/90">
                  {new Date(lead.updatedAt).toLocaleString()}
                </span>
              </div>
              {lead.createdByName && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Created by</span>
                  <span className="text-foreground/90">
                    {lead.createdByName}
                  </span>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: ACTIVITY (Inline Quick-Log + Full Timeline) */}
          <TabsContent
            value="activity"
            className="flex-1 overflow-y-auto px-6 py-5 space-y-4 mt-0"
          >
            {/* Inline Quick-Log Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (summaryText.trim().length >= 3) activityCreation.mutate();
              }}
              className="rounded-lg border bg-card p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ["call", "Call", PhoneCall],
                      ["meeting", "Meeting", Users],
                      ["note", "Note", FileText],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={activityType === value ? "secondary" : "ghost"}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setActivityType(value)}
                    >
                      <Icon className="size-3 mr-1" />
                      {label}
                    </Button>
                  ))}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {summaryText.length}/2000
                </span>
              </div>

              <Textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                placeholder="Log a call summary, meeting outcome, or quick note…"
                rows={2}
                maxLength={2000}
                className="text-xs resize-none"
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={
                    activityCreation.isPending || summaryText.trim().length < 3
                  }
                >
                  {activityCreation.isPending ? (
                    <Loader2 className="size-3 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="size-3 mr-1.5" />
                  )}
                  Log {activityType}
                </Button>
              </div>
            </form>

            {/* Full Timeline */}
            <div className="space-y-2.5">
              {activities.data?.map((item) => {
                const Icon =
                  item.type === "call"
                    ? PhoneCall
                    : item.type === "meeting"
                      ? Users
                      : FileText;

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize text-foreground">
                        <Icon className="size-3.5 text-primary" />
                        {item.type}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {new Date(item.occurredAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <ExpandableSummary text={item.summary} />
                  </div>
                );
              })}

              {activities.data?.length === 0 && (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  No activities logged yet. Use the composer above to record
                  your first interaction.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 3: FOLLOW-UPS */}
          <TabsContent
            value="followups"
            className="flex-1 overflow-y-auto px-6 py-5 space-y-4 mt-0"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Scheduled reminders & recurrence rules
              </p>
              <Button
                onClick={() => setShowReminderDialog(true)}
                size="sm"
                className="h-8 text-xs"
              >
                <CalendarPlus className="size-3.5 mr-1.5" />
                Schedule Follow-up
              </Button>
            </div>

            <div className="space-y-2.5">
              {reminders.data?.map((item) => {
                const isOverdue =
                  item.status === "pending" &&
                  new Date(item.dueAt).getTime() < Date.now();

                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {isOverdue ? (
                          <AlertCircle className="size-3.5 text-rose-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                        )}
                        <p className="text-xs font-semibold text-foreground">
                          {item.title}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {new Date(item.dueAt).toLocaleString()} ·{" "}
                        {item.assigneeName}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.status === "pending"
                          ? isOverdue
                            ? "destructive"
                            : "default"
                          : "secondary"
                      }
                      className="text-[10px] uppercase font-semibold h-5 px-1.5 shrink-0"
                    >
                      {isOverdue ? "Overdue" : item.status}
                    </Badge>
                  </div>
                );
              })}

              {reminders.data?.length === 0 && (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  <Calendar className="mx-auto mb-2 size-5 text-muted-foreground/40" />
                  No follow-ups scheduled for this lead.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 4: DOCUMENTS */}
          <TabsContent
            value="documents"
            className="flex-1 overflow-y-auto px-6 py-5 space-y-4 mt-0"
          >
            {lead.opportunityId ? (
              <OpportunityDocumentsCard
                opportunityId={lead.opportunityId}
                canUpload={canUploadOpportunityDocs}
                compact
              />
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <Paperclip className="size-3.5 text-primary" />
                  Opportunity Documents
                </p>
                <p>
                  Upload client drawings, RFPs, or photos when converting this
                  lead to an opportunity so CRM and Design Engineering share one
                  document set.
                </p>
              </div>
            )}

            {(attachments.data?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Legacy Lead Attachments
                </p>
                {attachments.data?.map((item) => {
                  const isPdf = item.originalName
                    .toLowerCase()
                    .endsWith(".pdf");
                  const isImage = isImageFile(item.mimeType, item.originalName);

                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5 text-xs"
                    >
                      {isImage && (
                        <button
                          type="button"
                          onClick={() => setPreviewAttachment(item)}
                          className="overflow-hidden rounded border bg-background"
                        >
                          <img
                            src={leadAttachmentPreviewUrl(lead.id, item.id)}
                            alt={item.originalName}
                            className="h-32 w-full object-cover"
                          />
                        </button>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isPdf ? (
                            <FileCode className="size-4 text-rose-500 shrink-0" />
                          ) : (
                            <FileImage className="size-4 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate font-medium text-foreground">
                            {item.originalName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {formatFileSize(item.sizeBytes)}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="size-7"
                                onClick={() =>
                                  void downloadLeadAttachment(
                                    lead.id,
                                    item,
                                  ).catch((error) =>
                                    toast.error(getApiErrorMessage(error)),
                                  )
                                }
                                aria-label={`Download ${item.originalName}`}
                              >
                                <Download className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download file</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Image Preview Dialog */}
        <UploadedFilePreviewDialog
          open={Boolean(previewAttachment)}
          onOpenChange={(open) => !open && setPreviewAttachment(undefined)}
          title={previewAttachment?.originalName}
          description="Legacy lead attachment preview"
          src={
            previewAttachment
              ? leadAttachmentPreviewUrl(lead.id, previewAttachment.id)
              : undefined
          }
          mimeType={previewAttachment?.mimeType}
          onDownload={
            previewAttachment
              ? () =>
                  void downloadLeadAttachment(lead.id, previewAttachment).catch(
                    (error) => toast.error(getApiErrorMessage(error)),
                  )
              : undefined
          }
        />

        {/* Schedule Follow-up Dialog (Silent Timezone) */}
        <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                reminderCreation.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>Schedule Follow-up</DialogTitle>
                <DialogDescription className="text-xs">
                  Set due time, assignee, and recurrence. Timezone is detected
                  automatically.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="work-title" className="text-xs font-semibold">
                    Follow-up Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="work-title"
                    name="title"
                    placeholder="e.g. Call regarding quotation revisions"
                    minLength={3}
                    maxLength={200}
                    className="h-9 text-sm"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="work-dueAt" className="text-xs font-semibold">
                    Due Time <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="work-dueAt"
                    name="dueAt"
                    type="datetime-local"
                    min={localDateTime(new Date(Date.now() + 60_000))}
                    className="h-9 text-sm"
                    required
                  />
                </div>

                {canAssign && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="work-assignee"
                      className="text-xs font-semibold"
                    >
                      Assignee
                    </Label>
                    <Select name="assigneeUserId" defaultValue="self">
                      <SelectTrigger
                        id="work-assignee"
                        className="w-full h-9 text-xs"
                      >
                        <SelectValue placeholder="Assign to me" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self" className="text-xs">
                          Assign to me
                        </SelectItem>
                        {assignees.map((item) => (
                          <SelectItem
                            key={item.id}
                            value={item.id}
                            className="text-xs"
                          >
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label
                    htmlFor="work-recurrence"
                    className="text-xs font-semibold"
                  >
                    Recurrence
                  </Label>
                  <Select name="recurrence" defaultValue="none" required>
                    <SelectTrigger
                      id="work-recurrence"
                      className="w-full h-9 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">
                        Does not repeat
                      </SelectItem>
                      <SelectItem value="daily" className="text-xs">
                        Daily
                      </SelectItem>
                      <SelectItem value="weekly" className="text-xs">
                        Weekly
                      </SelectItem>
                      <SelectItem value="monthly" className="text-xs">
                        Monthly
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="mt-6 border-t pt-4">
                <Button
                  onClick={() => setShowReminderDialog(false)}
                  type="button"
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  disabled={reminderCreation.isPending}
                  type="submit"
                  size="sm"
                >
                  {reminderCreation.isPending && (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  )}
                  Schedule Follow-up
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
