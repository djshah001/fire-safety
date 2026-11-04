import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarPlus,
  Download,
  Paperclip,
  PhoneCall,
  Calendar,
  Clock,
  FileText,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileCode,
  FileImage,
  RefreshCw,
} from "lucide-react";

import {
  activitiesQuery,
  attachmentsQuery,
  createActivity,
  createReminder,
  downloadLeadAttachment,
  leadRemindersQuery,
  uploadLeadAttachment,
  type Lead,
} from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Assignee = { id: string; name: string };

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
  const isLong = text.length > 90;

  return (
    <div className="min-w-0 w-full whitespace-normal">
      <p
        className={cn(
          "text-xs leading-relaxed text-muted-foreground break-words whitespace-normal",
          !expanded && isLong && "line-clamp-2",
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

export function LeadWorkPanel({
  lead,
  canAssign,
  assignees,
}: {
  lead: Lead;
  canAssign: boolean;
  assignees: Assignee[];
}) {
  const [dialog, setDialog] = useState<"activity" | "reminder">();
  const [summaryText, setSummaryText] = useState("");
  const queryClient = useQueryClient();

  const activities = useQuery(activitiesQuery(lead.id));
  const reminders = useQuery(leadRemindersQuery(lead.id));
  const attachments = useQuery(attachmentsQuery(lead.id));

  const activityCreation = useMutation({
    mutationFn: (form: FormData) =>
      createActivity(lead.id, {
        type: String(form.get("type")) as "call" | "meeting" | "note",
        summary: String(form.get("summary")).trim(),
        occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["crm", "lead", lead.id, "activities"],
      });
      setDialog(undefined);
      setSummaryText("");
      toast.success("Activity recorded.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const reminderCreation = useMutation({
    mutationFn: (form: FormData) =>
      createReminder(lead.id, {
        title: String(form.get("title")).trim(),
        assigneeUserId: String(form.get("assigneeUserId")) || undefined,
        timezone: String(form.get("timezone")),
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
      setDialog(undefined);
      toast.success("Follow-up scheduled.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadLeadAttachment(lead.id, file),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["crm", "lead", lead.id, "attachments"],
      });
      toast.success("Attachment uploaded.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <TooltipProvider delayDuration={150}>
      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* Card 1: Activities */}
        <Card className="shadow-2xs">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="size-4 text-primary" />
                Activity Timeline
              </CardTitle>
              <CardDescription className="text-xs">
                Calls, meetings and notes
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setSummaryText("");
                setDialog("activity");
              }}
              size="sm"
              className="h-8 text-xs px-2.5"
            >
              <PhoneCall className="size-3.5 mr-1" />
              Record
            </Button>
          </CardHeader>

          <CardContent className="space-y-3 pt-1">
            {activities.data?.slice(0, 4).map((item) => {
              const Icon =
                item.type === "call"
                  ? PhoneCall
                  : item.type === "meeting"
                    ? Users
                    : FileText;

              return (
                <div
                  key={item.id}
                  className="rounded-lg border bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize text-foreground">
                      <Icon className="size-3.5 text-primary" />
                      {item.type}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {new Date(item.occurredAt).toLocaleDateString()}
                    </span>
                  </div>
                  <ExpandableSummary text={item.summary} />
                </div>
              );
            })}

            {activities.data?.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No activities logged yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Follow-ups */}
        <Card className="shadow-2xs">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="size-4 text-primary" />
                Follow-ups
              </CardTitle>
              <CardDescription className="text-xs">
                Scheduled occurrences & rules
              </CardDescription>
            </div>
            <Button
              onClick={() => setDialog("reminder")}
              size="sm"
              className="h-8 text-xs px-2.5"
            >
              <CalendarPlus className="size-3.5 mr-1" />
              Schedule
            </Button>
          </CardHeader>

          <CardContent className="space-y-3 pt-1">
            {reminders.data?.slice(0, 4).map((item) => {
              const isOverdue =
                item.status === "pending" &&
                new Date(item.dueAt).getTime() < Date.now();

              return (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      {isOverdue ? (
                        <AlertCircle className="size-3.5 text-rose-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                      )}
                      <p className="text-xs font-semibold text-foreground truncate">
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
                    className="text-[10px] uppercase font-semibold h-4.5 px-1.5 shrink-0"
                  >
                    {isOverdue ? "Overdue" : item.status}
                  </Badge>
                </div>
              );
            })}

            {reminders.data?.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No follow-ups scheduled.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Attachments */}
        <Card className="shadow-2xs">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Paperclip className="size-4 text-primary" />
                Attachments
              </CardTitle>
              <CardDescription className="text-xs">
                Private PDF & images (max 20 MiB)
              </CardDescription>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 text-xs px-2.5"
            >
              <Label className="cursor-pointer">
                {upload.isPending ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Paperclip className="size-3.5 mr-1" />
                )}
                Upload
                <Input
                  accept="application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  disabled={upload.isPending}
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate(file);
                    event.target.value = "";
                  }}
                />
              </Label>
            </Button>
          </CardHeader>

          <CardContent className="space-y-2 pt-1">
            {attachments.data?.slice(0, 4).map((item) => {
              const isPdf = item.originalName.toLowerCase().endsWith(".pdf");

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/40"
                >
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
                          className="size-7 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            void downloadLeadAttachment(lead.id, item).catch(
                              (error) => toast.error(getApiErrorMessage(error)),
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
              );
            })}

            {attachments.data?.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No attachments uploaded.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal: Activity or Reminder */}
        <Dialog
          open={Boolean(dialog)}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            {dialog === "activity" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  activityCreation.mutate(new FormData(event.currentTarget));
                }}
              >
                <DialogHeader>
                  <DialogTitle>Record Activity</DialogTitle>
                  <DialogDescription className="text-xs">
                    Append an immutable call, meeting or note to this lead
                    timeline.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-4">
                  <SelectInput
                    label="Activity Type"
                    name="type"
                    required
                    items={[
                      ["call", "Call"],
                      ["meeting", "Meeting"],
                      ["note", "Note"],
                    ]}
                  />
                  <TextInput
                    label="Occurred At"
                    name="occurredAt"
                    type="datetime-local"
                    defaultValue={localDateTime(new Date())}
                    required
                  />
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="activity-summary"
                        className="text-xs font-semibold"
                      >
                        Summary <span className="text-destructive">*</span>
                      </Label>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {summaryText.length}/2000
                      </span>
                    </div>
                    <Textarea
                      id="activity-summary"
                      name="summary"
                      value={summaryText}
                      onChange={(e) => setSummaryText(e.target.value)}
                      minLength={3}
                      maxLength={2000}
                      rows={3}
                      className="text-sm"
                      placeholder="Discussed requirements, customer objections, next steps…"
                      required
                    />
                  </div>
                </div>

                <Actions
                  pending={activityCreation.isPending}
                  label="Record Activity"
                  onCancel={() => setDialog(undefined)}
                />
              </form>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  reminderCreation.mutate(new FormData(event.currentTarget));
                }}
              >
                <DialogHeader>
                  <DialogTitle>Schedule Follow-up</DialogTitle>
                  <DialogDescription className="text-xs">
                    Set assignee, timezone, due time, and automated recurrence
                    rules.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-3.5">
                  <TextInput
                    label="Follow-up Title"
                    name="title"
                    placeholder="e.g. Call regarding quotation revisions"
                    minLength={3}
                    maxLength={200}
                    required
                  />
                  <TextInput
                    label="Due Time"
                    name="dueAt"
                    type="datetime-local"
                    min={localDateTime(new Date(Date.now() + 60_000))}
                    required
                  />
                  <TextInput
                    label="IANA Timezone"
                    name="timezone"
                    defaultValue="Asia/Kolkata"
                    required
                  />
                  {canAssign && (
                    <SelectInput
                      label="Assignee"
                      name="assigneeUserId"
                      items={assignees.map((item) => [item.id, item.name])}
                      placeholder="Assign to me"
                    />
                  )}
                  <SelectInput
                    label="Recurrence"
                    name="recurrence"
                    required
                    defaultValue="none"
                    items={[
                      ["none", "Does not repeat"],
                      ["daily", "Daily"],
                      ["weekly", "Weekly"],
                      ["monthly", "Monthly"],
                    ]}
                  />
                </div>

                <Actions
                  pending={reminderCreation.isPending}
                  label="Schedule Follow-up"
                  onCancel={() => setDialog(undefined)}
                />
              </form>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  );
}

function TextInput({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`work-${name}`} className="text-xs font-semibold">
        {label} <span className="text-destructive">*</span>
      </Label>
      <Input
        id={`work-${name}`}
        name={name}
        className="h-9 text-sm"
        {...props}
      />
    </div>
  );
}

function SelectInput({
  label,
  name,
  items,
  placeholder,
  defaultValue,
  ...props
}: {
  label: string;
  name: string;
  items: string[][];
  placeholder?: string;
  defaultValue?: string;
} & React.ComponentProps<typeof Select>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`work-${name}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Select name={name} defaultValue={defaultValue} {...props}>
        <SelectTrigger id={`work-${name}`} className="w-full h-9 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map(([value, text]) => (
            <SelectItem key={value} value={value!}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Actions({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="mt-6 border-t pt-4">
      <Button onClick={onCancel} type="button" variant="outline" size="sm">
        Cancel
      </Button>
      <Button disabled={pending} type="submit" size="sm">
        {pending ? (
          <>
            <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…
          </>
        ) : (
          label
        )}
      </Button>
    </DialogFooter>
  );
}
