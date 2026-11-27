import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarOff,
  Check,
  ChevronsUpDown,
  Loader2,
  UserCheck,
} from "lucide-react";

import {
  employeeWorkloadQuery,
  employeesQuery,
  returnEmployeeFromLeave,
  submitEmployeeLeaveHandover,
  type Employee,
} from "@/api/admin";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function LeaveHandoverSheet({
  employee,
  open,
  onOpenChange,
  onCompleted,
}: {
  employee?: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [coveringOpen, setCoveringOpen] = useState(false);
  const [coveringId, setCoveringId] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState(todayIso);
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [reassignLeads, setReassignLeads] = useState(true);
  const [reassignReminders, setReassignReminders] = useState(true);
  const [reassignDesignHeadJobs, setReassignDesignHeadJobs] = useState(true);
  const [reassignDesignEngineerJobs, setReassignDesignEngineerJobs] = useState(true);
  const [reassignBoqReviews, setReassignBoqReviews] = useState(true);

  const workload = useQuery({
    ...employeeWorkloadQuery(employee?.id),
    enabled: open && Boolean(employee?.id),
  });

  const directory = useQuery({
    ...employeesQuery({ status: "active", pageSize: 100 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !employee) return;
    setCoveringId(employee.coveringEmployeeId ?? "");
    setLeaveStartDate(employee.leaveStartDate ?? todayIso());
    setLeaveEndDate(employee.leaveEndDate ?? "");
    setLeaveReason(employee.leaveReason ?? "");
    setReassignLeads(true);
    setReassignReminders(true);
    setReassignDesignHeadJobs(true);
    setReassignDesignEngineerJobs(true);
    setReassignBoqReviews(true);
  }, [open, employee]);

  const candidates = (directory.data?.items ?? []).filter(
    (item) => item.id !== employee?.id && item.status === "active" && !item.isOnLeave,
  );
  const selectedCovering = candidates.find((c) => c.id === coveringId);

  const handover = useMutation({
    mutationFn: async () => {
      if (!employee) throw new Error("Employee is unavailable.");
      const version = workload.data?.employee.rowVersion ?? employee.rowVersion;
      return submitEmployeeLeaveHandover(employee.id, {
        rowVersion: version,
        leaveStartDate,
        leaveEndDate: leaveEndDate || undefined,
        coveringEmployeeId: coveringId,
        leaveReason: leaveReason.trim(),
        reassignLeads,
        reassignReminders,
        reassignDesignHeadJobs,
        reassignDesignEngineerJobs,
        reassignBoqReviews,
      });
    },
    async onSuccess(result) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "employees"] }),
        queryClient.invalidateQueries({ queryKey: ["crm"] }),
        queryClient.invalidateQueries({ queryKey: ["engineering"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      const total =
        result.reassigned.leads +
        result.reassigned.reminders +
        result.reassigned.designHeadJobs +
        result.reassigned.designEngineerJobs +
        result.reassigned.boqReviews;
      toast.success(`Marked On Leave and reassigned ${total} active item${total === 1 ? "" : "s"}.`);
      await onCompleted?.();
      onOpenChange(false);
    },
  });

  const returnLeave = useMutation({
    mutationFn: async () => {
      if (!employee) throw new Error("Employee is unavailable.");
      const version = workload.data?.employee.rowVersion ?? employee.rowVersion;
      return returnEmployeeFromLeave(employee.id, { rowVersion: version });
    },
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "employees"] }),
        queryClient.invalidateQueries({ queryKey: ["crm"] }),
        queryClient.invalidateQueries({ queryKey: ["engineering"] }),
      ]);
      toast.success("Employee marked returned from leave.");
      await onCompleted?.();
      onOpenChange(false);
    },
  });

  const counts = workload.data?.workload;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <CalendarOff className="size-4 text-primary" />
            Leave & Task Handover
          </SheetTitle>
          <SheetDescription className="text-xs">
            {employee
              ? `Mark ${employee.name} (${employee.email}) On Leave and transfer active items cleanly without resetting design deadlines.`
              : "Manage employee leave and covering assignment."}
          </SheetDescription>
        </SheetHeader>

        {employee && (
          <div className="flex flex-1 flex-col justify-between">
            <div className="space-y-5 px-6 py-5">
              {employee.isOnLeave && (
                <Alert className="border-amber-500/40 bg-amber-500/10">
                  <AlertTitle className="text-xs font-semibold">
                    Currently On Leave
                  </AlertTitle>
                  <AlertDescription className="mt-1 space-y-2 text-xs">
                    <p>
                      From {employee.leaveStartDate}
                      {employee.leaveEndDate ? ` to ${employee.leaveEndDate}` : ""} ·{" "}
                      {employee.leaveReason}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={returnLeave.isPending}
                      onClick={() => returnLeave.mutate()}
                    >
                      {returnLeave.isPending ? (
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <UserCheck className="size-3.5 mr-1.5" />
                      )}
                      Mark Returned from Leave
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Active Workload Summary */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Active Workload to Reassign</Label>
                {workload.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : workload.isError ? (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {getApiErrorMessage(workload.error)}
                    </AlertDescription>
                  </Alert>
                ) : counts ? (
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
                    {[
                      {
                        label: "Active CRM Leads",
                        count: counts.leads.length,
                        checked: reassignLeads,
                        onChange: setReassignLeads,
                        id: "handover-leads",
                      },
                      {
                        label: "Pending Follow-up Reminders",
                        count: counts.reminders.length,
                        checked: reassignReminders,
                        onChange: setReassignReminders,
                        id: "handover-reminders",
                      },
                      {
                        label: "Design Jobs (as Design Head)",
                        count: counts.designHeadJobs.length,
                        checked: reassignDesignHeadJobs,
                        onChange: setReassignDesignHeadJobs,
                        id: "handover-head",
                      },
                      {
                        label: "Design Jobs (as Design Engineer — clock preserved)",
                        count: counts.designEngineerJobs.length,
                        checked: reassignDesignEngineerJobs,
                        onChange: setReassignDesignEngineerJobs,
                        id: "handover-engineer",
                      },
                      {
                        label: "Pending BOQ Costing / Review Tasks",
                        count: counts.boqReviews.length,
                        checked: reassignBoqReviews,
                        onChange: setReassignBoqReviews,
                        id: "handover-boq",
                      },
                    ].map((row) => (
                      <label
                        key={row.id}
                        htmlFor={row.id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Checkbox
                            id={row.id}
                            checked={row.checked}
                            onCheckedChange={(v) => row.onChange(Boolean(v))}
                          />
                          <span>{row.label}</span>
                        </span>
                        <Badge variant={row.count > 0 ? "default" : "secondary"} className="text-[10px] font-mono">
                          {row.count}
                        </Badge>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Searchable Covering Employee Combobox */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Covering Employee <span className="text-destructive">*</span>
                </Label>
                <Popover open={coveringOpen} onOpenChange={setCoveringOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={coveringOpen}
                      className="w-full justify-between text-xs font-normal h-9"
                    >
                      {selectedCovering
                        ? `${selectedCovering.name} (${selectedCovering.email})`
                        : "Search and select covering employee…"}
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by name or email…" className="text-xs" />
                      <CommandList>
                        <CommandEmpty>No available active employees found.</CommandEmpty>
                        <CommandGroup>
                          {candidates.map((candidate) => (
                            <CommandItem
                              key={candidate.id}
                              value={`${candidate.name} ${candidate.email}`}
                              onSelect={() => {
                                setCoveringId(candidate.id);
                                setCoveringOpen(false);
                              }}
                              className="text-xs"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
                                  coveringId === candidate.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{candidate.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {candidate.email}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Leave Dates & Reason */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="leave-start" className="text-xs font-semibold">
                    Leave Start Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="leave-start"
                    type="date"
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="leave-end" className="text-xs font-semibold">
                    Leave End Date (optional)
                  </Label>
                  <Input
                    id="leave-end"
                    type="date"
                    value={leaveEndDate}
                    min={leaveStartDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="leave-reason" className="text-xs font-semibold">
                  Handover Reason / Notes <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="leave-reason"
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Planned annual leave / medical leave handover…"
                  className="text-sm"
                />
              </div>

              {(handover.isError || returnLeave.isError) && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    {getApiErrorMessage(handover.error ?? returnLeave.error)}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <SheetFooter className="border-t bg-card px-6 py-4 flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  handover.isPending ||
                  !coveringId ||
                  !leaveStartDate ||
                  leaveReason.trim().length < 3
                }
                onClick={() => handover.mutate()}
              >
                {handover.isPending ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Reassigning…
                  </>
                ) : (
                  "Confirm Leave & Reassign"
                )}
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
