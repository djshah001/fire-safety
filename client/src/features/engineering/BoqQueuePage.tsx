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
  designJobsQuery,
  type DesignJob,
  type DesignStatus,
} from "@/api/engineering";
import { ListToolbar } from "@/components/data-table/ListToolbar";
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

const statuses: DesignStatus[] = [
  "authorized",
  "draft",
  "under_review",
  "returned",
  "internally_approved",
  "sent_to_customer",
  "customer_approved",
  "changes_requested",
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
  const query = useQuery(
    designJobsQuery({
      search: search || undefined,
      status,
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
          <p className="font-medium">{job.title}</p>
          <p className="text-xs text-muted-foreground">{job.leadNumber}</p>
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
      cell: (job) =>
        job.designerUserId === user.id
          ? "Designer"
          : job.designHeadUserId === user.id
            ? "Design head"
            : "Assigned sales member",
    },
    {
      key: "updated",
      label: "Updated",
      sort: "updatedAt",
      className: "tabular-nums",
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
          Open BOQ <ExternalLink />
        </Button>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-sm font-semibold text-primary">Engineering</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          BOQ & estimates
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Open the technical BOQ and, where permitted, its separate internal
          cost estimate for your assigned design work.
        </p>
      </div>

      <Alert className="mt-6">
        <ClipboardList />
        <AlertTitle>BOQ starts after customer design approval</AlertTitle>
        <AlertDescription>
          Jobs that are still in design or customer review remain visible here,
          but a new BOQ revision can only be created for an exact
          customer-approved design revision.
        </AlertDescription>
      </Alert>

      <div className="mt-6">
        <ListToolbar
          search={search}
          onSearch={(value) => update({ search: value })}
          activeFilters={status ? 1 : 0}
          onClear={() => update({ status: undefined })}
        >
          <div className="space-y-2">
            <Label>Design status</Label>
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
