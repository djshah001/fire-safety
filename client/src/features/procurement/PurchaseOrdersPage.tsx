import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  purchaseOrdersQuery,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/api/purchaseOrders";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import {
  ServerDataTable,
  type ServerColumn,
} from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
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

type Sort =
  | "poNumber"
  | "title"
  | "status"
  | "grandTotal"
  | "deliveryDueDate"
  | "createdAt"
  | "updatedAt";

const VALID_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "issued",
  "partially_delivered",
  "delivered",
  "closed",
  "cancelled",
];

function formatCurrency(currency: string, value: string) {
  const num = Number(value);
  if (Number.isNaN(num)) return `${currency} ${value}`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(num);
}

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const search = params.get("search") ?? "";
  const statusParam = params.get("status") as PurchaseOrderStatus | null;
  const status = VALID_STATUSES.includes(statusParam as PurchaseOrderStatus)
    ? (statusParam as PurchaseOrderStatus)
    : undefined;

  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;

  const sortParam = params.get("sort");
  const sort = (
    [
      "poNumber",
      "title",
      "status",
      "grandTotal",
      "deliveryDueDate",
      "createdAt",
      "updatedAt",
    ].includes(sortParam ?? "")
      ? sortParam
      : "updatedAt"
  ) as Sort;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const { data, isLoading } = useQuery(
    purchaseOrdersQuery({
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
      if (value === undefined || value === "" || value === "all") {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });
    if (!("page" in values)) {
      next.delete("page");
    }
    setParams(next, { replace: true });
  };

  const columns = useMemo<Array<ServerColumn<PurchaseOrder, Sort>>>(
    () => [
      {
        key: "poNumber",
        label: "PO Number",
        sort: "poNumber",
        className: "min-w-44",
        cell: (item) => (
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <span>{item.poNumber}</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                R{String(item.currentRevisionNumber).padStart(2, "0")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {item.title}
            </p>
          </div>
        ),
      },
      {
        key: "vendor",
        label: "Vendor",
        className: "min-w-48",
        cell: (item) => (
          <div>
            <p className="font-medium text-foreground">{item.vendorName}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {item.vendorCode}
            </p>
          </div>
        ),
      },
      {
        key: "project",
        label: "Project",
        className: "min-w-48",
        cell: (item) => (
          <div>
            <p className="text-sm font-medium">{item.projectTitle}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {item.projectNumber}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        sort: "status",
        cell: (item) => <StatusBadge status={item.status} />,
      },
      {
        key: "grandTotal",
        label: "Grand Total",
        sort: "grandTotal",
        className: "text-right tabular-nums whitespace-nowrap",
        cell: (item) => (
          <div className="text-right">
            <span className="font-medium">
              {formatCurrency(item.currency, item.grandTotal)}
            </span>
            <p className="text-[11px] text-muted-foreground">
              Tax: {formatCurrency(item.currency, item.taxAmount)}
            </p>
          </div>
        ),
      },
      {
        key: "deliveryDueDate",
        label: "Due Date",
        sort: "deliveryDueDate",
        className: "whitespace-nowrap tabular-nums text-xs",
        cell: (item) =>
          item.deliveryDueDate
            ? new Date(`${item.deliveryDueDate}T00:00:00`).toLocaleDateString(
                undefined,
                { dateStyle: "medium" },
              )
            : "—",
      },
      {
        key: "actions",
        label: "",
        className: "w-16 text-right",
        cell: (item) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/procurement/purchase-orders/${item.id}`);
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-primary">Procurement</p>
            <Badge variant="secondary" className="text-xs font-normal">
              Commercial & Fulfillment
            </Badge>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Purchase Orders (PO)
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Authoritative vendor commitments with immutable revisions,
            signed PDF issuance, and line-level goods receipt inspection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/procurement/requisitions">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Sourcing & Requisitions
            </Link>
          </Button>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="mt-6">
        <ListToolbar
          search={search}
          onSearch={(val) => update({ search: val })}
          activeFilters={Number(Boolean(status))}
          onClear={() => update({ status: undefined })}
        >
          <div className="space-y-2">
            <Label>Order Status</Label>
            <Select
              value={status ?? "all"}
              onValueChange={(val) => update({ status: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="partially_delivered">
                  Partially Delivered
                </SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ListToolbar>
      </div>

      {/* Data Table */}
      <div className="mt-4">
        <ServerDataTable<PurchaseOrder, Sort>
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(item) => item.id}
          loading={isLoading}
          sort={sort}
          direction={direction}
          onSort={(newSort, newDir) =>
            update({ sort: newSort, direction: newDir })
          }
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPageChange={(newPage) => update({ page: newPage })}
          onPageSizeChange={(newPageSize) => update({ pageSize: newPageSize })}
          onRowClick={(item) =>
            navigate(`/procurement/purchase-orders/${item.id}`)
          }
          empty={
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileCheck2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                No purchase orders found
              </h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Purchase orders are generated from approved vendor selections in
                Requisitions. Navigate to Requisitions to select an offer and create a PO.
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <Link to="/procurement/requisitions">
                  Go to Requisitions
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    </main>
  );
}

