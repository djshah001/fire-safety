import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ExternalLink } from "lucide-react";
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";

import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  designJobFilterOptionsQuery,
  designJobsQuery,
  type DesignJob,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const statuses: DesignStatus[] = [
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

type Sort = "title" | "status" | "updatedAt";

function readiness(status: DesignStatus) {
  return status === "customer_approved"
    ? { label: "Ready for BOQ", variant: "default" as const }
    : { label: "Waiting for approved design", variant: "secondary" as const };
}

export function BoqQueuePage() {
  const user = useOutletContext<{ user: CurrentUser }>().user;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = statuses.includes(params.get("status") as DesignStatus)
    ? (params.get("status") as DesignStatus)
    : undefined;
  const sectorId = params.get("sectorId") || undefined;
  const designerUserId = params.get("designerUserId") || undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;
  const sort = (
    ["title", "status", "updatedAt"].includes(params.get("sort") ?? "")
      ? params.get("sort")
      : "updatedAt"
  ) as Sort;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const filterOptions = useQuery(designJobFilterOptionsQuery);
  const query = useQuery(
    designJobsQuery({
      search: search || undefined,
      status,
      sectorId,
      designerUserId,
      page,
      pageSize,
      sort,
      direction,
    }),
  );

  const update = (values: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === "all")
        next.delete(key);
      else next.set(key, String(value));
    });
    if (!("page" in values)) next.delete("page");
    setParams(next, { replace: true });
  };

  const activeChips: ActiveFilterChip[] = [];
  if (status) {
    activeChips.push({
      key: "status",
      label: `Design: ${status.replaceAll("_", " ")}`,
      onRemove: () => update({ status: undefined }),
    });
  }
  if (sectorId) {
    const sectorName =
      filterOptions.data?.sectors.find((s) => s.id === sectorId)?.name ??
      "Sector";
    activeChips.push({
      key: "sectorId",
      label: `Sector: ${sectorName}`,
      onRemove: () => update({ sectorId: undefined }),
    });
  }
  if (designerUserId) {
    const designerName =
      designerUserId === "unassigned"
        ? "Unassigned"
        : (filterOptions.data?.users.find((u) => u.id === designerUserId)
            ?.name ?? "Assignee");
    activeChips.push({
      key: "designerUserId",
      label: `Designer: ${designerName}`,
      onRemove: () => update({ designerUserId: undefined }),
    });
  }

  const openWorkspace = (job: DesignJob) =>
    navigate(`/engineering/design-jobs/${job.id}/boq`);

  const columns: Array<ServerColumn<DesignJob, Sort>> = [
    {
      key: "title",
      label: "Design job",
      sort: "title",
      className: "min-w-64",
      cell: (job) => (
        <div>
          <p className="font-medium text-sm">{job.title}</p>
          <p className="text-xs text-muted-foreground">
            {job.leadNumber}
            {job.customerName ? ` · ${job.customerName}` : ""}
            {job.sectorName ? ` · ${job.sectorName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "designStatus",
      label: "Design status",
      sort: "status",
      cell: (job) => <StatusBadge status={job.status} />,
    },
    {
      key: "readiness",
      label: "BOQ readiness",
      cell: (job) => {
        const state = readiness(job.status);
        return <Badge variant={state.variant}>{state.label}</Badge>;
      },
    },
    {
      key: "assignment",
      label: "Your assignment",
      cell: (job) => (
        <div className="text-xs">
          <p className="font-medium">
            {job.designerUserId === user.id
              ? "Designer"
              : job.designHeadUserId === user.id
                ? "Design head"
                : "Assigned member"}
          </p>
          {job.designerName && (
            <p className="text-muted-foreground">Eng: {job.designerName}</p>
          )}
        </div>
      ),
    },
    {
      key: "updated",
      label: "Updated",
      sort: "updatedAt",
      className: "tabular-nums text-xs",
      cell: (job) => new Date(job.updatedAt).toLocaleDateString(),
    },
    {
      key: "action",
      label: "",
      className: "w-36 text-right",
      cell: (job) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            openWorkspace(job);
          }}
        >
          Open BOQ <ExternalLink className="ml-1.5 size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Engineering
        </p>
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight">
          BOQ & estimates
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Open the technical BOQ and, where permitted, its separate internal
          cost estimate for your assigned design work.
        </p>
      </div>

      <Alert className="mt-5">
        <ClipboardList className="size-4" />
        <AlertTitle className="text-xs font-semibold">
          BOQ starts after customer design approval
        </AlertTitle>
        <AlertDescription className="text-xs">
          Jobs that are still in design or customer review remain visible here,
          but a new BOQ revision can only be created for an exact
          customer-approved design revision.
        </AlertDescription>
      </Alert>

      <div className="mt-5">
        <ListToolbar
          search={search}
          onSearch={(value) => update({ search: value })}
          searchPlaceholder="Search job title, lead #, or customer…"
          activeChips={activeChips}
          activeFilters={activeChips.length}
          onClear={() =>
            update({
              status: undefined,
              sectorId: undefined,
              designerUserId: undefined,
            })
          }
          quickFilters={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={status === "customer_approved" ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() =>
                  update({
                    status:
                      status === "customer_approved"
                        ? undefined
                        : "customer_approved",
                  })
                }
              >
                Ready for BOQ
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Design status</Label>
              <Select
                value={status ?? "all"}
                onValueChange={(value) => update({ status: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All design states</SelectItem>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Market sector</Label>
              <Select
                value={sectorId ?? "all"}
                onValueChange={(value) => update({ sectorId: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors</SelectItem>
                  {(filterOptions.data?.sectors ?? []).map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Assigned engineer</Label>
              <Select
                value={designerUserId ?? "all"}
                onValueChange={(value) => update({ designerUserId: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All engineers</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(filterOptions.data?.users ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </ListToolbar>
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
        {query.isError ? (
          <Alert className="m-4" variant="destructive">
            <AlertTitle>BOQ workspaces unavailable</AlertTitle>
            <AlertDescription>
              {getApiErrorMessage(
                query.error,
                "These BOQ workspaces are unavailable or outside your assignment.",
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
              <div>
                <ClipboardList className="mx-auto mb-2" />
                No assigned BOQ workspaces in this view.
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
            onRowClick={openWorkspace}
          />
        )}
      </section>
    </main>
  );
}
