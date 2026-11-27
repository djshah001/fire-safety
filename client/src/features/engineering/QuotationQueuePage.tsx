import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "@/api/client";
import { designJobFilterOptionsQuery } from "@/api/engineering";
import {
  quotationQueueQuery,
  type QuotationQueueItem,
  type QuotationStatus,
} from "@/api/quotations";
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

const statuses: QuotationStatus[] = [
  "draft",
  "submitted",
  "returned",
  "approved",
  "issued",
  "accepted",
  "declined",
];
const commercialStates = [
  "unawarded",
  "quoted",
  "awarded",
  "lost",
  "on_hold",
] as const;
type CommercialState = (typeof commercialStates)[number];
type Sort = "quotationNumber" | "title" | "status" | "updatedAt" | "grandTotal";

export function QuotationQueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = statuses.includes(params.get("status") as QuotationStatus)
    ? (params.get("status") as QuotationStatus)
    : undefined;
  const commercialState = commercialStates.includes(
    params.get("commercialState") as CommercialState,
  )
    ? (params.get("commercialState") as CommercialState)
    : undefined;
  const sectorId = params.get("sectorId") || undefined;
  const assigneeUserId = params.get("assigneeUserId") || undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;
  const sort = (
    ["quotationNumber", "title", "status", "updatedAt", "grandTotal"].includes(
      params.get("sort") ?? "",
    )
      ? params.get("sort")
      : "updatedAt"
  ) as Sort;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const filterOptions = useQuery(designJobFilterOptionsQuery);
  const query = useQuery(
    quotationQueueQuery({
      search: search || undefined,
      status,
      commercialState,
      sectorId,
      assigneeUserId,
      page,
      pageSize,
      sort,
      direction,
    }),
  );

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

  const activeChips: ActiveFilterChip[] = [];
  if (status) {
    activeChips.push({
      key: "status",
      label: `Quote: ${status.replaceAll("_", " ")}`,
      onRemove: () => update({ status: undefined }),
    });
  }
  if (commercialState) {
    activeChips.push({
      key: "commercialState",
      label: `Commercial: ${commercialState.replaceAll("_", " ")}`,
      onRemove: () => update({ commercialState: undefined }),
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
  if (assigneeUserId) {
    const assigneeName =
      filterOptions.data?.users.find((u) => u.id === assigneeUserId)?.name ??
      "Assignee";
    activeChips.push({
      key: "assigneeUserId",
      label: `Assignee: ${assigneeName}`,
      onRemove: () => update({ assigneeUserId: undefined }),
    });
  }

  const columns: Array<ServerColumn<QuotationQueueItem, Sort>> = [
    {
      key: "number",
      label: "Quotation",
      sort: "quotationNumber",
      className: "min-w-44",
      cell: (row) =>
        row.quotationNumber ? (
          <div>
            <p className="font-mono text-xs font-semibold">
              {row.quotationNumber}
            </p>
            <p className="text-xs text-muted-foreground">
              Revision {row.revisionNumber}
            </p>
          </div>
        ) : (
          <Badge variant="outline">Not prepared</Badge>
        ),
    },
    {
      key: "job",
      label: "Design job / Customer",
      sort: "title",
      className: "min-w-64",
      cell: (row) => (
        <div>
          <p className="font-medium text-sm">{row.jobTitle}</p>
          <p className="text-xs text-muted-foreground">
            {row.leadNumber}
            {row.customerName ? ` · ${row.customerName}` : ""}
            {row.sectorName ? ` · ${row.sectorName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Quote status",
      sort: "status",
      cell: (row) =>
        row.status ? (
          <StatusBadge status={row.status} />
        ) : (
          <span className="text-xs text-muted-foreground">Pending</span>
        ),
    },
    {
      key: "commercial",
      label: "Commercial state",
      cell: (row) => <StatusBadge status={row.opportunityCommercialState} />,
    },
    {
      key: "total",
      label: "Total",
      sort: "grandTotal",
      className: "text-right tabular-nums font-mono text-xs",
      cell: (row) =>
        row.grandTotal
          ? `${row.currency} ${Number(row.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : "—",
    },
    {
      key: "updated",
      label: "Updated",
      sort: "updatedAt",
      className: "tabular-nums text-xs",
      cell: (row) =>
        row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—",
    },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Engineering · Commercial preparation
        </p>
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight">
          Quotations
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Versioned selling scope, approval, demo-labelled issue snapshots and
          customer decisions for assigned opportunities.
        </p>
      </div>

      <Alert className="mt-5">
        <FileText className="size-4" />
        <AlertTitle className="text-xs font-semibold">
          Demo document mode
        </AlertTitle>
        <AlertDescription className="text-xs">
          Production tax, rounding, numbering and company template settings are
          not confirmed. Issued PDFs are preserved but visibly labelled “DEMO /
          NOT FOR PRODUCTION”. Customer PDFs omit internal Supply, Markup, and
          Miscellaneous columns.
        </AlertDescription>
      </Alert>

      <div className="mt-5">
        <ListToolbar
          search={search}
          onSearch={(value) => update({ search: value })}
          searchPlaceholder="Search quotation #, job title, lead #, or customer…"
          activeChips={activeChips}
          activeFilters={activeChips.length}
          onClear={() =>
            update({
              status: undefined,
              commercialState: undefined,
              sectorId: undefined,
              assigneeUserId: undefined,
            })
          }
          quickFilters={
            <div className="flex flex-wrap items-center gap-1.5">
              {(["draft", "issued", "accepted"] as QuotationStatus[]).map(
                (quick) => (
                  <Button
                    key={quick}
                    size="sm"
                    variant={status === quick ? "default" : "outline"}
                    className="h-7 text-xs capitalize"
                    onClick={() =>
                      update({ status: status === quick ? undefined : quick })
                    }
                  >
                    {quick}
                  </Button>
                ),
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Quotation status</Label>
              <Select
                value={status ?? "all"}
                onValueChange={(value) => update({ status: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Commercial state</Label>
              <Select
                value={commercialState ?? "all"}
                onValueChange={(value) => update({ commercialState: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All commercial states</SelectItem>
                  {commercialStates.map((value) => (
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
              <Label className="text-xs font-semibold">
                Design engineer / head
              </Label>
              <Select
                value={assigneeUserId ?? "all"}
                onValueChange={(value) => update({ assigneeUserId: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
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
            <AlertTitle>Quotations unavailable</AlertTitle>
            <AlertDescription>
              {getApiErrorMessage(
                query.error,
                "Quotations are unavailable or outside your assignment.",
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <ServerDataTable
            columns={columns}
            rows={query.data?.items ?? []}
            rowKey={(row) => row.jobId}
            loading={query.isPending}
            empty={
              <div>
                <FileText className="mx-auto mb-2" />
                No assigned quotation workspaces in this view.
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
            onRowClick={(row) =>
              navigate(`/engineering/design-jobs/${row.jobId}/quotations`)
            }
          />
        )}
      </section>
    </main>
  );
}
