import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ClipboardPenLine, MapPinned } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "@/api/client";
import {
  designJobFilterOptionsQuery,
  designJobsQuery,
  type DesignJob,
  type DesignJobSortField,
  type DesignStatus,
} from "@/api/engineering";
import {
  ListToolbar,
  type ActiveFilterChip,
} from "@/components/data-table/ListToolbar";
import {
  ServerDataTable,
  type ServerColumn,
} from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Separator } from "@/components/ui/separator";
import { useHotkeys } from "@/hooks/useHotkeys";
import { DesignDeadline } from "./DesignDeadline";

const ALL_STATUSES: DesignStatus[] = [
  "awaiting_designer",
  "authorized",
  "draft",
  "under_review",
  "returned",
  "internally_approved",
  "sent_to_customer",
  "customer_approved",
  "changes_requested",
  "paused",
  "cancelled",
  "abandoned",
];

const ACTIVE_QUICK_STATUSES: DesignStatus[] = [
  "awaiting_designer",
  "draft",
  "under_review",
  "sent_to_customer",
  "customer_approved",
];

const TERMINAL_STATUSES: DesignStatus[] = ["paused", "cancelled", "abandoned"];

type DeadlineState =
  | "overdue"
  | "due_soon"
  | "on_track"
  | "completed"
  | "unassigned";

const DEADLINE_LABELS: Record<DeadlineState, string> = {
  overdue: "Overdue SLA",
  due_soon: "Due within 24h",
  on_track: "On track",
  completed: "First revision submitted",
  unassigned: "Awaiting designer assignment",
};

const formatLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function DesignJobsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useHotkeys({
    f: () => {
      searchInputRef.current?.focus();
    },
  });

  const search = params.get("search") ?? "";
  const status = (
    ALL_STATUSES.includes(params.get("status") as DesignStatus)
      ? params.get("status")
      : undefined
  ) as DesignStatus | undefined;
  const designerUserId = params.get("designerUserId") || undefined;
  const designHeadUserId = params.get("designHeadUserId") || undefined;
  const surveyRequested = (
    params.get("surveyRequested") === "yes" ||
    params.get("surveyRequested") === "no"
      ? params.get("surveyRequested")
      : undefined
  ) as "yes" | "no" | undefined;
  const deadlineState = (
    ["overdue", "due_soon", "on_track", "completed", "unassigned"].includes(
      params.get("deadlineState") ?? "",
    )
      ? params.get("deadlineState")
      : undefined
  ) as DeadlineState | undefined;
  const sectorId = params.get("sectorId") || undefined;
  const serviceCategoryId = params.get("serviceCategoryId") || undefined;
  const updatedByUserId = params.get("updatedByUserId") || undefined;
  const authorizedFrom = params.get("authorizedFrom") || undefined;
  const authorizedTo = params.get("authorizedTo") || undefined;
  const updatedFrom = params.get("updatedFrom") || undefined;
  const updatedTo = params.get("updatedTo") || undefined;

  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;
  const sort = (
    [
      "title",
      "status",
      "updatedAt",
      "authorizedAt",
      "designDueAt",
      "customerName",
    ].includes(params.get("sort") ?? "")
      ? params.get("sort")
      : "updatedAt"
  ) as DesignJobSortField;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const query = useQuery(
    designJobsQuery({
      search: search || undefined,
      status,
      designerUserId,
      designHeadUserId,
      surveyRequested,
      deadlineState,
      sectorId,
      serviceCategoryId,
      updatedByUserId,
      authorizedFrom,
      authorizedTo,
      updatedFrom,
      updatedTo,
      page,
      pageSize,
      sort,
      direction,
    }),
  );
  const filterOptions = useQuery(designJobFilterOptionsQuery);

  const update = (values: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value === undefined || value === "" || value === "all"
        ? next.delete(key)
        : next.set(key, String(value)),
    );
    if (!("page" in values)) next.delete("page");
    setParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    const next = new URLSearchParams(params);
    [
      "status",
      "designerUserId",
      "designHeadUserId",
      "surveyRequested",
      "deadlineState",
      "sectorId",
      "serviceCategoryId",
      "updatedByUserId",
      "authorizedFrom",
      "authorizedTo",
      "updatedFrom",
      "updatedTo",
      "page",
    ].forEach((key) => next.delete(key));
    setParams(next, { replace: true });
  };

  const userNameMap = new Map(
    (filterOptions.data?.users ?? []).map((u) => [u.id, u.name]),
  );
  const sectorNameMap = new Map(
    (filterOptions.data?.sectors ?? []).map((s) => [s.id, s.name]),
  );
  const categoryNameMap = new Map(
    (filterOptions.data?.serviceCategories ?? []).map((c) => [c.id, c.name]),
  );

  const activeChips: ActiveFilterChip[] = [
    status
      ? {
          key: "status",
          label: `State: ${formatLabel(status)}`,
          onRemove: () => update({ status: undefined }),
        }
      : null,
    designerUserId
      ? {
          key: "designerUserId",
          label:
            designerUserId === "unassigned"
              ? "Engineer: Unassigned"
              : `Engineer: ${userNameMap.get(designerUserId) ?? "Selected"}`,
          onRemove: () => update({ designerUserId: undefined }),
        }
      : null,
    designHeadUserId
      ? {
          key: "designHeadUserId",
          label: `Design Head: ${userNameMap.get(designHeadUserId) ?? "Selected"}`,
          onRemove: () => update({ designHeadUserId: undefined }),
        }
      : null,
    deadlineState
      ? {
          key: "deadlineState",
          label: `SLA: ${DEADLINE_LABELS[deadlineState]}`,
          onRemove: () => update({ deadlineState: undefined }),
        }
      : null,
    surveyRequested
      ? {
          key: "surveyRequested",
          label:
            surveyRequested === "yes"
              ? "Survey requested"
              : "Survey optional / none",
          onRemove: () => update({ surveyRequested: undefined }),
        }
      : null,
    sectorId
      ? {
          key: "sectorId",
          label: `Sector: ${sectorNameMap.get(sectorId) ?? "Selected"}`,
          onRemove: () => update({ sectorId: undefined }),
        }
      : null,
    serviceCategoryId
      ? {
          key: "serviceCategoryId",
          label: `Service: ${categoryNameMap.get(serviceCategoryId) ?? "Selected"}`,
          onRemove: () => update({ serviceCategoryId: undefined }),
        }
      : null,
    updatedByUserId
      ? {
          key: "updatedByUserId",
          label: `Last edited by: ${userNameMap.get(updatedByUserId) ?? "Selected"}`,
          onRemove: () => update({ updatedByUserId: undefined }),
        }
      : null,
    authorizedFrom || authorizedTo
      ? {
          key: "authorizedRange",
          label: `Authorized: ${authorizedFrom ?? "…"} → ${authorizedTo ?? "…"}`,
          onRemove: () =>
            update({ authorizedFrom: undefined, authorizedTo: undefined }),
        }
      : null,
    updatedFrom || updatedTo
      ? {
          key: "updatedRange",
          label: `Updated: ${updatedFrom ?? "…"} → ${updatedTo ?? "…"}`,
          onRemove: () =>
            update({ updatedFrom: undefined, updatedTo: undefined }),
        }
      : null,
  ].filter((chip): chip is ActiveFilterChip => Boolean(chip));

  const columns: Array<ServerColumn<DesignJob, DesignJobSortField>> = [
    {
      key: "title",
      label: "Design Job",
      sort: "title",
      className: "min-w-[245px]",
      cell: (job) => (
        <div className="space-y-1">
          <p className="font-semibold text-xs text-foreground leading-snug">
            {job.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono font-medium text-foreground/80">
              {job.leadNumber}
            </span>
            {job.serviceCategoryName && (
              <>
                <span>•</span>
                <span>{job.serviceCategoryName}</span>
              </>
            )}
            {job.sectorName && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal"
              >
                {job.sectorName}
              </Badge>
            )}
            {job.surveyRequested && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 font-medium gap-1"
              >
                <MapPinned className="size-2.5" />
                Survey
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sort: "customerName",
      className: "min-w-[165px]",
      cell: (job) => (
        <span className="text-xs font-medium text-foreground">
          {job.customerName ?? "—"}
        </span>
      ),
    },
    {
      key: "team",
      label: "Engineering Team",
      className: "min-w-[185px]",
      cell: (job) => (
        <div className="space-y-0.5 text-xs">
          <p className="text-foreground">
            <span className="text-muted-foreground text-[11px]">Eng: </span>
            {job.designerName ? (
              <span className="font-medium">{job.designerName}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-500">
                Unassigned
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Head:{" "}
            <span className="text-foreground/80">
              {job.designHeadName ?? "—"}
            </span>
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Technical State",
      sort: "status",
      className: "min-w-[140px]",
      cell: (job) => <StatusBadge status={job.status} />,
    },
    {
      key: "deadline",
      label: "Design Timer",
      sort: "designDueAt",
      className: "min-w-[160px]",
      cell: (job) => <DesignDeadline job={job} compact />,
    },
    {
      key: "updated",
      label: "Last Change",
      sort: "updatedAt",
      className: "min-w-[155px] tabular-nums text-xs",
      cell: (job) => (
        <div className="space-y-0.5">
          <p className="font-mono text-[11px] text-foreground">
            {new Date(job.updatedAt).toLocaleDateString()} ·{" "}
            {new Date(job.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
            by {job.lastModifiedByName ?? job.authorizedByName ?? "System"}
          </p>
        </div>
      ),
    },
  ];

  const isTerminalSelected = Boolean(
    status && TERMINAL_STATUSES.includes(status),
  );

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Engineering
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Design Jobs
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground leading-relaxed">
          Assigned free-design jobs, 2-day submission clocks, site survey
          revisions, CAD/PDF approvals, and full revision audit trail.
        </p>
      </div>

      <div className="mt-6">
        <ListToolbar
          search={search}
          searchInputRef={searchInputRef}
          searchPlaceholder="Search by job title, lead #, customer name, or authorization notes…"
          onSearch={(value) => update({ search: value })}
          activeFilters={activeChips.length}
          activeChips={activeChips}
          onClear={clearAllFilters}
          quickFilters={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={!status && !deadlineState ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-[11px]"
                onClick={() =>
                  update({ status: undefined, deadlineState: undefined })
                }
              >
                All jobs
              </Button>
              {ACTIVE_QUICK_STATUSES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={status === item ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-[11px]"
                  onClick={() =>
                    update({ status: status === item ? undefined : item })
                  }
                >
                  {formatLabel(item)}
                </Button>
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={isTerminalSelected ? "secondary" : "ghost"}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    {isTerminalSelected
                      ? formatLabel(status!)
                      : "Closed / Hold"}
                    <ChevronDown className="size-3 ml-1 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  {TERMINAL_STATUSES.map((item) => (
                    <DropdownMenuItem
                      key={item}
                      onClick={() =>
                        update({ status: status === item ? undefined : item })
                      }
                    >
                      {formatLabel(item)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                size="sm"
                variant={
                  deadlineState === "overdue" ? "destructive" : "outline"
                }
                className="h-7 px-2.5 text-[11px] ml-auto"
                onClick={() =>
                  update({
                    deadlineState:
                      deadlineState === "overdue" ? undefined : "overdue",
                  })
                }
              >
                Overdue SLA
              </Button>
            </div>
          }
        >
          {/* Grouped 3-Section Filter Popover */}
          <div className="space-y-4">
            {/* Section 1: State & SLA */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                State & SLA
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Technical State
                  </Label>
                  <Select
                    value={status ?? "all"}
                    onValueChange={(value) => update({ status: value })}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      {ALL_STATUSES.map((value) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="text-xs"
                        >
                          {formatLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Deadline SLA State
                  </Label>
                  <Select
                    value={deadlineState ?? "all"}
                    onValueChange={(value) => update({ deadlineState: value })}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All SLA states</SelectItem>
                      {(Object.keys(DEADLINE_LABELS) as DeadlineState[]).map(
                        (key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {DEADLINE_LABELS[key]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Team & Survey */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Team & Survey
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Design Engineer
                  </Label>
                  <Select
                    value={designerUserId ?? "all"}
                    onValueChange={(value) => update({ designerUserId: value })}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All engineers</SelectItem>
                      <SelectItem value="unassigned" className="text-xs">
                        Unassigned (awaiting engineer)
                      </SelectItem>
                      {filterOptions.data?.users.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.name}
                          {u.isOnLeave ? " (On Leave)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Design Head / Reviewer
                  </Label>
                  <Select
                    value={designHeadUserId ?? "all"}
                    onValueChange={(value) =>
                      update({ designHeadUserId: value })
                    }
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All design heads</SelectItem>
                      {filterOptions.data?.users.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.name}
                          {u.isOnLeave ? " (On Leave)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Site Survey</Label>
                  <Select
                    value={surveyRequested ?? "all"}
                    onValueChange={(value) =>
                      update({ surveyRequested: value })
                    }
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="yes">Survey requested</SelectItem>
                      <SelectItem value="no">
                        Optional / not requested
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Last Modified By
                  </Label>
                  <Select
                    value={updatedByUserId ?? "all"}
                    onValueChange={(value) =>
                      update({ updatedByUserId: value })
                    }
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      {filterOptions.data?.users.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 3: Classification & Dates */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Classification & Dates
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Service Category
                  </Label>
                  <Select
                    value={serviceCategoryId ?? "all"}
                    onValueChange={(value) =>
                      update({ serviceCategoryId: value })
                    }
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All services</SelectItem>
                      {filterOptions.data?.serviceCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Market Sector</Label>
                  <Select
                    value={sectorId ?? "all"}
                    onValueChange={(value) => update({ sectorId: value })}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sectors</SelectItem>
                      {filterOptions.data?.sectors.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Authorized From
                  </Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={authorizedFrom ?? ""}
                    onChange={(e) => update({ authorizedFrom: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Authorized To</Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={authorizedTo ?? ""}
                    onChange={(e) => update({ authorizedTo: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Last Updated From
                  </Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={updatedFrom ?? ""}
                    onChange={(e) => update({ updatedFrom: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Last Updated To
                  </Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={updatedTo ?? ""}
                    onChange={(e) => update({ updatedTo: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </ListToolbar>
      </div>

      <Card className="mt-4 overflow-hidden shadow-xs">
        <CardHeader className="border-b bg-card/60 p-4 pb-3 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              Assigned Design Jobs
            </CardTitle>
            <CardDescription className="text-xs">
              {query.data
                ? `${query.data.total} visible job${query.data.total === 1 ? "" : "s"}`
                : "Loading design jobs…"}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[11px] font-mono">
            Page {page}
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          {query.isError ? (
            <Alert className="m-4" variant="destructive">
              <AlertDescription>
                {getApiErrorMessage(
                  query.error,
                  "Design jobs are unavailable or outside your assigned scope.",
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <ServerDataTable
              columns={columns}
              rows={query.data?.items ?? []}
              rowKey={(job) => job.id}
              loading={query.isPending}
              empty={
                <div className="grid min-h-48 place-items-center p-6 text-center">
                  <div>
                    <ClipboardPenLine className="mx-auto size-6 text-muted-foreground/40" />
                    <p className="mt-2 text-xs font-semibold text-foreground">
                      No assigned design jobs in this view
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Try clearing your active filters or search query.
                    </p>
                  </div>
                </div>
              }
              sort={sort}
              direction={direction}
              onSort={(nextSort, nextDirection) =>
                update({ sort: nextSort, direction: nextDirection })
              }
              page={page}
              pageSize={pageSize}
              total={query.data?.total ?? 0}
              onPageChange={(nextPage) => update({ page: nextPage })}
              onPageSizeChange={(nextSize) =>
                update({ pageSize: nextSize, page: 1 })
              }
              onRowClick={(job) =>
                navigate(`/engineering/design-jobs/${job.id}`)
              }
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
