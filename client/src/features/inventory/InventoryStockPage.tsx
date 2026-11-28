import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  BookmarkCheck,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";

import {
  acceptSiteReturn,
  createReplenishmentRequest,
  createStockDocument,
  createStockTransfer,
  createWarehouse,
  deliveryChallanPdfUrl,
  deliveryChallanPodPhotoUrl,
  deliveryChallansQuery,
  dispatchMir,
  dispatchStockTransfer,
  inventoryQueryKeys,
  mirQuery,
  postGrnToStock,
  receiveStockTransfer,
  releaseStockReservation,
  replenishmentRequestsQuery,
  resolveDiscrepancy,
  siteReturnsQuery,
  stockBalancesQuery,
  stockLedgerQuery,
  stockReservationsQuery,
  stockTransfersQuery,
  thresholdsQuery,
  upsertThreshold,
  warehousesQuery,
  type DeliveryChallan,
  type MaterialIssueRequest,
  type StockTransfer,
} from "@/api/inventory";
import { currentUserQuery } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
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
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Semantic Status Badges ────────────────────────────────────────────────

const STATUS_BADGE_BASE = "text-[10px] font-medium capitalize border";

function MirStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
    partially_dispatched:
      "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
    dispatched:
      "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
    completed:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
    short_closed:
      "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400",
    cancelled:
      "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
  };
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_BADGE_BASE, map[status] ?? "")}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function DcStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    dispatched:
      "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
    verified:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
    discrepancy_pending:
      "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
    resolved:
      "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400",
    cancelled:
      "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400",
  };
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_BADGE_BASE, map[status] ?? "")}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

type ThresholdTarget = {
  warehouseId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  brandOfferingId: string | null;
  brandName: string | null;
  unitSymbol: string;
  minStock: string;
  maxStock: string;
};

const VALID_TABS = [
  "balances",
  "thresholds",
  "mir",
  "challans",
  "returns",
  "ledger",
  "transfers",
  "reservations",
  "warehouses",
] as const;

// ─── Set Min/Max Dialog ────────────────────────────────────────────────────

function SetThresholdDialog({
  threshold,
  open,
  onOpenChange,
}: {
  threshold?: ThresholdTarget;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    minStock: threshold?.minStock ?? "0",
    maxStock: threshold?.maxStock ?? "0",
  });

  useEffect(() => {
    if (threshold && open) {
      setForm({
        minStock: threshold.minStock ?? "0",
        maxStock: threshold.maxStock ?? "0",
      });
    }
  }, [threshold, open]);

  const mutation = useMutation({
    mutationFn: upsertThreshold,
    onSuccess: () => {
      toast.success("Min/Max thresholds saved.");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["inventory", "thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "balances"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to save thresholds")),
  });

  if (!threshold) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Min/Max Stock</DialogTitle>
          <DialogDescription className="text-xs">
            {threshold.itemCode} · {threshold.itemName}
            {threshold.brandName && <> · {threshold.brandName}</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Min Stock ({threshold.unitSymbol})
            </Label>
            <Input
              type="number"
              min="0"
              step="0.0001"
              className="h-9 text-sm font-mono"
              value={form.minStock}
              onChange={(e) =>
                setForm((p) => ({ ...p, minStock: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Max Stock ({threshold.unitSymbol})
            </Label>
            <Input
              type="number"
              min="0"
              step="0.0001"
              className="h-9 text-sm font-mono"
              value={form.maxStock}
              onChange={(e) =>
                setForm((p) => ({ ...p, maxStock: e.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter className="border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                warehouseId: threshold.warehouseId,
                itemId: threshold.itemId,
                brandOfferingId: threshold.brandOfferingId,
                minStock: form.minStock,
                maxStock: form.maxStock,
              })
            }
          >
            {mutation.isPending && (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            )}
            Save Thresholds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dispatch MIR Sheet ────────────────────────────────────────────────────

function DispatchMirSheet({
  mir,
  open,
  onOpenChange,
}: {
  mir: MaterialIssueRequest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    transporterName: "",
    vehicleNumber: "",
    receiverName: "",
    lines: [] as Array<{ mirLineId: string; dispatchedQty: string }>,
  });

  useEffect(() => {
    if (mir && open) {
      setForm({
        transporterName: "",
        vehicleNumber: "",
        receiverName: "",
        lines: mir.lines.map((l) => ({
          mirLineId: l.id,
          dispatchedQty: String(
            Math.max(0, Number(l.requestedQty) - Number(l.dispatchedQty)),
          ),
        })),
      });
    }
  }, [mir, open]);

  const mutation = useMutation({
    mutationFn: () =>
      dispatchMir(mir!.id, {
        lines: form.lines.filter((l) => Number(l.dispatchedQty) > 0),
        transporterName: form.transporterName || undefined,
        vehicleNumber: form.vehicleNumber || undefined,
        receiverName: form.receiverName || undefined,
      }),
    onSuccess: (dc) => {
      toast.success(
        `Delivery Challan ${dc.dcNumber} generated and material dispatched.`,
      );
      onOpenChange(false);
      queryClient.invalidateQueries({
        queryKey: ["inventory", "material-issue-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "delivery-challans"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "thresholds"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Dispatch failed")),
  });

  if (!mir) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-2xl flex flex-col gap-0"
      >
        <SheetHeader className="border-b bg-card/60 px-6 py-4">
          <SheetTitle className="text-base">
            Dispatch MIR — <span className="font-mono">{mir.mirNumber}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {mir.projectTitle} · From {mir.warehouseName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Transporter Name</Label>
              <Input
                placeholder="Optional"
                className="h-9 text-sm"
                value={form.transporterName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, transporterName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Vehicle Number</Label>
              <Input
                placeholder="Optional"
                className="h-9 text-sm font-mono"
                value={form.vehicleNumber}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vehicleNumber: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Receiver Name at Site
            </Label>
            <Input
              placeholder="Optional"
              className="h-9 text-sm"
              value={form.receiverName}
              onChange={(e) =>
                setForm((p) => ({ ...p, receiverName: e.target.value }))
              }
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dispatch Quantities
            </p>
            {mir.lines.map((line, idx) => {
              const remaining = Math.max(
                0,
                Number(line.requestedQty) - Number(line.dispatchedQty),
              );
              return (
                <div
                  key={line.id}
                  className="rounded-lg border bg-muted/20 p-3 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-foreground">
                        {line.itemCode}
                      </p>
                      <p className="text-xs text-foreground">{line.itemName}</p>
                      {line.brandName && (
                        <p className="text-[11px] text-muted-foreground">
                          {line.brandName}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-[11px] font-mono text-muted-foreground shrink-0">
                      <p>
                        Req: {Number(line.requestedQty).toFixed(2)}{" "}
                        {line.unitSymbol}
                      </p>
                      <p>Sent: {Number(line.dispatchedQty).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">
                      Dispatch Qty
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max={remaining}
                      step="0.0001"
                      className="h-8 text-xs font-mono"
                      value={
                        form.lines[idx]?.dispatchedQty ?? String(remaining)
                      }
                      onChange={(e) =>
                        setForm((prev) => {
                          const lines = [...prev.lines];
                          lines[idx] = {
                            mirLineId: line.id,
                            dispatchedQty: e.target.value,
                          };
                          return { ...prev, lines };
                        })
                      }
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      {line.unitSymbol}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SheetFooter className="border-t bg-card px-6 py-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={
              mutation.isPending ||
              form.lines.every((l) => Number(l.dispatchedQty) <= 0)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            )}
            Generate Delivery Challan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export function InventoryStockPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: user } = useQuery(currentUserQuery);

  // URL-synced filters & tab state
  const rawTab = params.get("tab") ?? "balances";
  const activeTab = (
    VALID_TABS.includes(rawTab as (typeof VALID_TABS)[number])
      ? rawTab
      : "balances"
  ) as (typeof VALID_TABS)[number];
  const selectedWarehouseId = params.get("warehouseId") || "all";
  const searchQuery = params.get("search") ?? "";
  const lowStockOnly = params.get("lowStockOnly") === "true";
  const dcStatusFilter = params.get("dcStatus") || "all";

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === "all" || v === "false") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  // Dialog / Sheet states
  const [isWarehouseDialogOpen, setIsWarehouseDialogOpen] = useState(false);
  const [isPostGrnDialogOpen, setIsPostGrnDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] =
    useState<StockTransfer | null>(null);
  const [thresholdTarget, setThresholdTarget] = useState<
    ThresholdTarget | undefined
  >();
  const [isThresholdDialogOpen, setIsThresholdDialogOpen] = useState(false);
  const [dispatchMirTarget, setDispatchMirTarget] =
    useState<MaterialIssueRequest | null>(null);
  const [isDispatchSheetOpen, setIsDispatchSheetOpen] = useState(false);
  const [replenishTarget, setReplenishTarget] = useState<
    ThresholdTarget | undefined
  >();
  const [isReplenishDialogOpen, setIsReplenishDialogOpen] = useState(false);
  const [replenishQty, setReplenishQty] = useState("");
  const [replenishNotes, setReplenishNotes] = useState("");
  const [discrepancyDc, setDiscrepancyDc] = useState<DeliveryChallan | null>(
    null,
  );
  const [discrepancyResolution, setDiscrepancyResolution] = useState<
    "return_to_store" | "write_off_transit_loss" | "picking_error_restock"
  >("return_to_store");
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [releaseReservationId, setReleaseReservationId] = useState<
    string | null
  >(null);

  // Form states
  const [warehouseForm, setWarehouseForm] = useState({
    code: "",
    name: "",
    warehouseType: "central_warehouse" as
      | "central_warehouse"
      | "regional_depot"
      | "project_site_store",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
  });

  const [grnForm, setGrnForm] = useState({
    warehouseId: "",
    goodsReceiptLineId: "",
    notes: "",
  });

  const [transferForm, setTransferForm] = useState({
    sourceWarehouseId: "",
    destinationWarehouseId: "",
    challanNumber: "",
    vehicleNumber: "",
    transporterName: "",
    notes: "",
    lines: [{ itemId: "", dispatchedQuantity: "1", notes: "" }],
  });

  const [receiveForm, setReceiveForm] = useState<{
    lines: Array<{ transferLineId: string; receivedQuantity: string }>;
    notes: string;
  }>({ lines: [], notes: "" });

  const [documentForm, setDocumentForm] = useState({
    documentType: "opening_balance" as
      | "opening_balance"
      | "site_issue"
      | "site_return"
      | "adjustment",
    sourceWarehouseId: "",
    destinationWarehouseId: "",
    documentDate: new Date().toISOString().slice(0, 10),
    referenceNumber: "",
    notes: "",
    lines: [{ itemId: "", quantity: "1", unitRate: "", notes: "" }],
  });

  // Queries (Lazy-loaded by activeTab where appropriate)
  const filterWhId =
    selectedWarehouseId === "all" ? undefined : selectedWarehouseId;

  const { data: warehouses = [] } = useQuery(warehousesQuery(true));
  const { data: balances = [], isLoading: isLoadingBalances } = useQuery(
    stockBalancesQuery({
      warehouseId: filterWhId,
      search: searchQuery || undefined,
    }),
  );
  const { data: thresholds = [], isLoading: isLoadingThresholds } = useQuery(
    thresholdsQuery(filterWhId),
  );
  const { data: replenishmentRequests = [] } = useQuery({
    ...replenishmentRequestsQuery({ warehouseId: filterWhId }),
    enabled: activeTab === "thresholds",
  });
  const { data: mirRequests = [], isLoading: isLoadingMir } = useQuery({
    ...mirQuery({ warehouseId: filterWhId }),
    enabled: activeTab === "mir",
  });
  const { data: deliveryChallans = [], isLoading: isLoadingChallans } =
    useQuery({
      ...deliveryChallansQuery({
        status: dcStatusFilter !== "all" ? dcStatusFilter : undefined,
      }),
      enabled: activeTab === "challans",
    });
  const { data: siteReturns = [], isLoading: isLoadingSiteReturns } = useQuery({
    ...siteReturnsQuery(),
    enabled: activeTab === "returns",
  });
  const { data: ledger = [], isLoading: isLoadingLedger } = useQuery({
    ...stockLedgerQuery({ warehouseId: filterWhId }),
    enabled: activeTab === "ledger",
  });
  const { data: transfers = [], isLoading: isLoadingTransfers } = useQuery({
    ...stockTransfersQuery(),
    enabled: activeTab === "transfers",
  });
  const { data: reservations = [], isLoading: isLoadingReservations } =
    useQuery({
      ...stockReservationsQuery(),
      enabled: activeTab === "reservations",
    });

  // Derived
  const lowStockAlerts = thresholds.filter((t) => t.lowStockAlertActive);
  const pendingReturnsCount = siteReturns.filter(
    (r) => r.status === "submitted",
  ).length;

  // Mutations
  const createWarehouseMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: () => {
      toast.success("Warehouse created.");
      setIsWarehouseDialogOpen(false);
      setWarehouseForm({
        code: "",
        name: "",
        warehouseType: "central_warehouse",
        addressLine1: "",
        city: "",
        state: "",
        postalCode: "",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to create warehouse")),
  });

  const postGrnMutation = useMutation({
    mutationFn: postGrnToStock,
    onSuccess: (data) => {
      toast.success(
        `GRN posted to stock. Entry ${data.ledgerEntry.entryNumber} recorded.`,
      );
      setIsPostGrnDialogOpen(false);
      setGrnForm({ warehouseId: "", goodsReceiptLineId: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to post GRN to inventory")),
  });

  const createTransferMutation = useMutation({
    mutationFn: createStockTransfer,
    onSuccess: () => {
      toast.success("Stock transfer challan created.");
      setIsTransferDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to create transfer")),
  });

  const dispatchTransferMutation = useMutation({
    mutationFn: dispatchStockTransfer,
    onSuccess: () => {
      toast.success(
        "Transfer dispatched and material deducted from source warehouse.",
      );
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to dispatch transfer")),
  });

  const receiveTransferMutation = useMutation({
    mutationFn: ({
      transferId,
      payload,
    }: {
      transferId: string;
      payload: {
        lines: Array<{ transferLineId: string; receivedQuantity: string }>;
        notes: string;
      };
    }) => receiveStockTransfer(transferId, payload),
    onSuccess: () => {
      toast.success(
        "Material received and destination warehouse balance credited.",
      );
      setIsReceiveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to receive transfer")),
  });

  const releaseReservationMutation = useMutation({
    mutationFn: releaseStockReservation,
    onSuccess: () => {
      toast.success("Stock reservation released back to available balance.");
      setReleaseReservationId(null);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to release reservation")),
  });

  const createDocumentMutation = useMutation({
    mutationFn: createStockDocument,
    onSuccess: () => {
      toast.success("Stock movement document posted to ledger.");
      setIsDocumentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to post stock document")),
  });

  const replenishmentMutation = useMutation({
    mutationFn: createReplenishmentRequest,
    onSuccess: () => {
      toast.success("Replenishment request submitted to Purchase.");
      setIsReplenishDialogOpen(false);
      setReplenishQty("");
      setReplenishNotes("");
      queryClient.invalidateQueries({
        queryKey: inventoryQueryKeys.replenishmentRequests(),
      });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to submit request")),
  });

  const resolveDiscrepancyMutation = useMutation({
    mutationFn: () =>
      resolveDiscrepancy(discrepancyDc!.id, {
        rowVersion: discrepancyDc!.rowVersion,
        resolution: discrepancyResolution,
        resolutionNotes: discrepancyNotes,
      }),
    onSuccess: () => {
      toast.success("Discrepancy resolved and stock ledger updated.");
      setDiscrepancyDc(null);
      setDiscrepancyNotes("");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to resolve discrepancy")),
  });

  const acceptReturnMutation = useMutation({
    mutationFn: acceptSiteReturn,
    onSuccess: () => {
      toast.success("Site return accepted into warehouse MAIN stock.");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Failed to accept site return")),
  });

  // Permissions
  const p = user?.permissions ?? [];
  const isAdmin = p.includes("system.access.all");
  const canManageWarehouse =
    isAdmin || p.includes("inventory.warehouse.manage");
  const canPostReceipt = isAdmin || p.includes("inventory.receipt.post");
  const canTransfer = isAdmin || p.includes("inventory.transfer.create");
  const canAdjust = isAdmin || p.includes("inventory.adjustment.manage");
  const canManageThreshold =
    isAdmin || p.includes("inventory.threshold.manage");
  const canRequestReplenishment =
    isAdmin || p.includes("inventory.replenishment.request");
  const canDispatch = isAdmin || p.includes("inventory.dispatch.execute");
  const canResolveDiscrepancy =
    isAdmin || p.includes("inventory.discrepancy.resolve");

  const hasStockActions = canPostReceipt || canTransfer || canAdjust;

  // Summary Metrics
  const totalOnHand = balances.reduce(
    (sum, b) => sum + Number(b.quantityOnHand),
    0,
  );
  const totalReserved = balances.reduce(
    (sum, b) => sum + Number(b.quantityReserved),
    0,
  );
  const totalAvailable = totalOnHand - totalReserved;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      {/* Compact Actionable Low-Stock Banner */}
      {lowStockAlerts.length > 0 && (
        <Alert className="border-rose-500/30 bg-rose-500/5 py-2.5">
          <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-foreground">
              <strong className="font-semibold text-rose-600 dark:text-rose-400">
                {lowStockAlerts.length} item
                {lowStockAlerts.length === 1 ? "" : "s"}
              </strong>{" "}
              currently below minimum stock threshold.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              onClick={() =>
                updateParams({ tab: "thresholds", lowStockOnly: "true" })
              }
            >
              View Alerts
              <ArrowRight className="size-3 ml-1" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Inventory & Store
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Warehouse Ledger
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Perpetual stock balances, MIR dispatch, delivery challans, and BOQ
            reservations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasStockActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <ArrowRightLeft className="size-3.5 mr-1.5" />
                  Stock Actions
                  <ChevronDown className="size-3 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canPostReceipt && (
                  <DropdownMenuItem
                    onClick={() => setIsPostGrnDialogOpen(true)}
                  >
                    <PackageCheck className="size-3.5 mr-2 text-emerald-600" />
                    Post GRN to Stock
                  </DropdownMenuItem>
                )}
                {canTransfer && (
                  <DropdownMenuItem
                    onClick={() => setIsTransferDialogOpen(true)}
                  >
                    <ArrowRightLeft className="size-3.5 mr-2 text-blue-600" />
                    New Transfer Challan
                  </DropdownMenuItem>
                )}
                {canAdjust && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setIsDocumentDialogOpen(true)}
                    >
                      <Plus className="size-3.5 mr-2 text-amber-600" />
                      Stock Movement / Issue
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canManageWarehouse && (
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => setIsWarehouseDialogOpen(true)}
            >
              <WarehouseIcon className="size-3.5 mr-1.5" />
              Add Warehouse
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-2xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] uppercase font-medium tracking-wider">
              Warehouses & Depots
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {warehouses.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 text-[11px] text-muted-foreground">
            Central warehouses, depots & site stores
          </CardContent>
        </Card>

        <Card className="shadow-2xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] uppercase font-medium tracking-wider">
              Total Stock On Hand
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {totalOnHand.toLocaleString("en-IN", {
                maximumFractionDigits: 2,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 text-[11px] text-muted-foreground">
            Physical material in storage locations
          </CardContent>
        </Card>

        <Card className="shadow-2xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] uppercase font-medium tracking-wider">
              Reserved for Projects
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {totalReserved.toLocaleString("en-IN", {
                maximumFractionDigits: 2,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 text-[11px] text-muted-foreground">
            Allocated to active project BOQs
          </CardContent>
        </Card>

        <Card className="shadow-2xs">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] uppercase font-medium tracking-wider">
              Available to Issue
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {totalAvailable.toLocaleString("en-IN", {
                maximumFractionDigits: 2,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 text-[11px] text-muted-foreground">
            Unrestricted quantity ready for dispatch
          </CardContent>
        </Card>
      </div>

      {/* Global Search & Warehouse Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search item code, name…"
            value={searchQuery}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select
          value={selectedWarehouseId}
          onValueChange={(v) => updateParams({ warehouseId: v })}
        >
          <SelectTrigger className="h-9 w-56 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Warehouses & Sites
            </SelectItem>
            {warehouses.map((wh) => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">
                {wh.code} · {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Single-Row Scrollable Underline Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => updateParams({ tab: v })}
        className="space-y-4"
      >
        <div className="border-b overflow-x-auto">
          <TabsList className="h-10 w-max justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              value="balances"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <Boxes className="size-3.5" />
              Balances
            </TabsTrigger>
            <TabsTrigger
              value="thresholds"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <SlidersHorizontal className="size-3.5" />
              Min/Max & Alerts
              {lowStockAlerts.length > 0 && (
                <Badge
                  variant="destructive"
                  className="h-4 px-1 text-[10px] rounded-full"
                >
                  {lowStockAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="mir"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <ClipboardList className="size-3.5" />
              MIR Queue
            </TabsTrigger>
            <TabsTrigger
              value="challans"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <Truck className="size-3.5" />
              Delivery Challans
            </TabsTrigger>
            <TabsTrigger
              value="returns"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              Site Returns
              {pendingReturnsCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px] rounded-full"
                >
                  {pendingReturnsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="ledger"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <History className="size-3.5" />
              Ledger
            </TabsTrigger>
            <TabsTrigger
              value="transfers"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <ArrowRightLeft className="size-3.5" />
              Transfers
            </TabsTrigger>
            <TabsTrigger
              value="reservations"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <BookmarkCheck className="size-3.5" />
              Reservations
            </TabsTrigger>
            <TabsTrigger
              value="warehouses"
              className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
            >
              <WarehouseIcon className="size-3.5" />
              Warehouses
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {warehouses.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: STOCK BALANCES (Streamlined 7-Column Table) */}
        <TabsContent value="balances" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Item & Make</TableHead>
                    <TableHead className="text-xs">Warehouse & Loc</TableHead>
                    <TableHead className="text-right text-xs">
                      On Hand / Reserved
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      Available / Transit
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      Min / Max
                    </TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs w-12">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingBalances ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-10 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1.5" />
                        Loading stock balances…
                      </TableCell>
                    </TableRow>
                  ) : balances.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-10 text-xs text-muted-foreground"
                      >
                        No inventory stock balances found matching criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    balances.map((row) => {
                      const onHand = Number(row.quantityOnHand);
                      const reserved = Number(row.quantityReserved);
                      const avail = Number(row.quantityAvailable);
                      const inTransit = Number(row.inTransitQty ?? 0);
                      const isMain = row.locationType === "main";
                      const isLow = Boolean(row.lowStockAlertActive);

                      return (
                        <TableRow
                          key={row.id}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <TableCell className="py-2.5 max-w-[280px]">
                            <p className="text-xs font-medium text-foreground truncate">
                              {row.itemName}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="font-mono font-medium text-foreground/80">
                                {row.itemCode}
                              </span>
                              <span>·</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 font-normal"
                              >
                                {row.brandName ?? "Generic"}
                              </Badge>
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5">
                            <p className="text-xs font-medium text-foreground">
                              {row.warehouseName}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {row.warehouseCode} · {row.locationCode}
                            </p>
                          </TableCell>

                          <TableCell className="py-2.5 text-right tabular-nums">
                            <p className="font-mono text-xs font-semibold text-foreground">
                              {onHand.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {row.unitSymbol}
                              </span>
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              Res:{" "}
                              {reserved.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </p>
                          </TableCell>

                          <TableCell className="py-2.5 text-right tabular-nums">
                            <p className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {avail.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {row.unitSymbol}
                              </span>
                            </p>
                            {inTransit > 0 && (
                              <p className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                                Transit:{" "}
                                {inTransit.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                            {row.minStock !== null
                              ? `${Number(row.minStock).toFixed(0)} / ${Number(row.maxStock ?? 0).toFixed(0)}`
                              : "—"}
                          </TableCell>

                          <TableCell className="py-2.5">
                            <div className="flex flex-col gap-1 items-start">
                              {onHand === 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400"
                                >
                                  Out of Stock
                                </Badge>
                              ) : avail <= 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                                >
                                  Fully Reserved
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                                >
                                  Available
                                </Badge>
                              )}
                              {isMain && isLow && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400"
                                >
                                  <AlertCircle className="size-2.5" />
                                  Low Stock
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5 text-right">
                            {isMain &&
                              (canManageThreshold ||
                                (canRequestReplenishment && isLow)) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="size-7"
                                      aria-label={`Actions for ${row.itemCode}`}
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                  >
                                    {canManageThreshold && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setThresholdTarget({
                                            warehouseId: row.warehouseId,
                                            itemId: row.itemId,
                                            itemCode: row.itemCode,
                                            itemName: row.itemName,
                                            brandOfferingId:
                                              row.brandOfferingId,
                                            brandName: row.brandName,
                                            unitSymbol: row.unitSymbol,
                                            minStock: row.minStock ?? "0",
                                            maxStock: row.maxStock ?? "0",
                                          });
                                          setIsThresholdDialogOpen(true);
                                        }}
                                      >
                                        <SlidersHorizontal className="size-3.5 mr-2" />
                                        Set Min/Max
                                      </DropdownMenuItem>
                                    )}
                                    {canRequestReplenishment && isLow && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          const suggested = Math.max(
                                            1,
                                            Number(row.maxStock ?? 0) - avail,
                                          );
                                          setReplenishTarget({
                                            warehouseId: row.warehouseId,
                                            itemId: row.itemId,
                                            itemCode: row.itemCode,
                                            itemName: row.itemName,
                                            brandOfferingId:
                                              row.brandOfferingId,
                                            brandName: row.brandName,
                                            unitSymbol: row.unitSymbol,
                                            minStock: row.minStock ?? "0",
                                            maxStock: row.maxStock ?? "0",
                                          });
                                          setReplenishQty(String(suggested));
                                          setIsReplenishDialogOpen(true);
                                        }}
                                      >
                                        <RefreshCw className="size-3.5 mr-2 text-amber-600" />
                                        Request Replenishment
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: MIN/MAX & LOW-STOCK ALERTS */}
        <TabsContent value="thresholds" className="mt-0 space-y-4">
          <Card className="shadow-xs overflow-hidden">
            <CardHeader className="border-b bg-card/60 p-4 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <SlidersHorizontal className="size-4 text-primary" />
                    Min/Max Stock Thresholds & Alerts
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Alerts trigger when Free Available + Incoming Open PO &lt;
                    Min Stock.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant={lowStockOnly ? "destructive" : "outline"}
                  onClick={() =>
                    updateParams({
                      lowStockOnly: lowStockOnly ? undefined : "true",
                    })
                  }
                  className="h-8 gap-1.5 text-xs"
                >
                  <AlertTriangle className="size-3.5" />
                  {lowStockOnly
                    ? "Low Stock Only"
                    : `Low Stock (${lowStockAlerts.length})`}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Warehouse</TableHead>
                    <TableHead className="text-xs">Item & Make</TableHead>
                    <TableHead className="text-right text-xs">
                      Min / Max
                    </TableHead>
                    <TableHead className="text-xs">Alert</TableHead>
                    <TableHead className="text-xs">Updated</TableHead>
                    <TableHead className="text-right text-xs">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingThresholds ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading thresholds…
                      </TableCell>
                    </TableRow>
                  ) : (lowStockOnly ? lowStockAlerts : thresholds).length ===
                    0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        {lowStockOnly
                          ? "No active low-stock alerts."
                          : "No thresholds configured yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (lowStockOnly ? lowStockAlerts : thresholds).map((t) => (
                      <TableRow
                        key={t.id}
                        className={
                          t.lowStockAlertActive
                            ? "bg-rose-500/5"
                            : "hover:bg-muted/30"
                        }
                      >
                        <TableCell className="py-2.5 text-xs font-medium">
                          {t.warehouseName}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-mono text-xs font-semibold block">
                            {t.itemCode}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t.itemName}
                            {t.brandName ? ` · ${t.brandName}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums">
                          {Number(t.minStock).toFixed(2)} /{" "}
                          {Number(t.maxStock).toFixed(2)} {t.unitSymbol}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {t.lowStockAlertActive ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400"
                            >
                              <AlertCircle className="size-2.5" />
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="size-2.5" />
                              OK
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                          {new Date(t.updatedAt).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canManageThreshold && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setThresholdTarget(t);
                                  setIsThresholdDialogOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            )}
                            {canRequestReplenishment &&
                              t.lowStockAlertActive && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-amber-600 border-amber-500/30"
                                  onClick={() => {
                                    setReplenishTarget(t);
                                    setReplenishQty(
                                      String(
                                        Math.max(
                                          1,
                                          Number(t.maxStock) -
                                            Number(t.minStock),
                                        ),
                                      ),
                                    );
                                    setIsReplenishDialogOpen(true);
                                  }}
                                >
                                  Replenish
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {replenishmentRequests.length > 0 && (
            <Card className="shadow-xs overflow-hidden">
              <CardHeader className="border-b bg-card/60 p-4 pb-3">
                <CardTitle className="text-sm font-semibold">
                  Recent Replenishment Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs">SRR #</TableHead>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-right text-xs">
                        Requested / Free
                      </TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Requested By</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replenishmentRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="py-2.5 font-mono text-xs font-semibold">
                          {r.srrNumber}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          <span className="font-mono font-medium block">
                            {r.itemCode}
                          </span>
                          <span className="text-muted-foreground">
                            {r.itemName}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums">
                          <span className="font-semibold">
                            {Number(r.requestedQty).toFixed(2)}
                          </span>{" "}
                          / {Number(r.currentFreeQty).toFixed(2)} {r.unitSymbol}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {r.requestedByUserName}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString("en-IN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 3: MIR QUEUE */}
        <TabsContent value="mir" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardHeader className="border-b bg-card/60 p-4 pb-3">
              <CardTitle className="text-sm font-semibold">
                Material Issue Request Queue
              </CardTitle>
              <CardDescription className="text-xs">
                MIRs raised against accepted quotations. Storekeepers dispatch
                and generate delivery challans.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">MIR #</TableHead>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-xs">Warehouse</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Requested By</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingMir ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading MIR queue…
                      </TableCell>
                    </TableRow>
                  ) : mirRequests.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        No material issue requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mirRequests.map((mir) => (
                      <TableRow key={mir.id}>
                        <TableCell className="py-2.5 font-mono text-xs font-semibold">
                          {mir.mirNumber}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-medium max-w-[200px] truncate">
                          {mir.projectTitle}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {mir.warehouseName}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <MirStatusBadge status={mir.status} />
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {mir.requestedByUserName}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                          {new Date(mir.createdAt).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {canDispatch &&
                            (mir.status === "open" ||
                              mir.status === "partially_dispatched") && (
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setDispatchMirTarget(mir);
                                  setIsDispatchSheetOpen(true);
                                }}
                              >
                                <Truck className="size-3" />
                                Dispatch
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: DELIVERY CHALLANS */}
        <TabsContent value="challans" className="mt-0 space-y-3">
          <div className="flex items-center gap-3">
            <Select
              value={dcStatusFilter}
              onValueChange={(v) => updateParams({ dcStatus: v })}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Statuses
                </SelectItem>
                <SelectItem value="dispatched" className="text-xs">
                  Dispatched (In Transit)
                </SelectItem>
                <SelectItem value="verified" className="text-xs">
                  Verified
                </SelectItem>
                <SelectItem value="discrepancy_pending" className="text-xs">
                  Discrepancy Pending
                </SelectItem>
                <SelectItem value="resolved" className="text-xs">
                  Resolved
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">DC / MIR #</TableHead>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-xs">Warehouse</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Dispatched</TableHead>
                    <TableHead className="text-xs">Verified</TableHead>
                    <TableHead className="text-right text-xs">
                      Documents / Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingChallans ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading delivery challans…
                      </TableCell>
                    </TableRow>
                  ) : deliveryChallans.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        No delivery challans found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    deliveryChallans.map((dc) => (
                      <TableRow
                        key={dc.id}
                        className={
                          dc.status === "discrepancy_pending"
                            ? "bg-rose-500/5"
                            : "hover:bg-muted/30"
                        }
                      >
                        <TableCell className="py-2.5">
                          <span className="font-mono text-xs font-semibold block">
                            {dc.dcNumber}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {dc.mirNumber}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-medium max-w-[180px] truncate">
                          {dc.projectTitle}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {dc.warehouseName}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <DcStatusBadge status={dc.status} />
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          <span className="font-mono block">
                            {new Date(dc.dispatchedAt).toLocaleDateString(
                              "en-IN",
                            )}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {dc.dispatchedByUserName}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                          {dc.verifiedAt
                            ? new Date(dc.verifiedAt).toLocaleDateString(
                                "en-IN",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {dc.hasPdf && (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                              >
                                <a
                                  href={deliveryChallanPdfUrl(dc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileText className="size-3 mr-1" />
                                  PDF
                                </a>
                              </Button>
                            )}
                            {dc.hasPodPhoto && (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                              >
                                <a
                                  href={deliveryChallanPodPhotoUrl(dc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ImageIcon className="size-3 mr-1" />
                                  POD
                                </a>
                              </Button>
                            )}
                            {canResolveDiscrepancy &&
                              dc.status === "discrepancy_pending" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs px-2 gap-1"
                                  onClick={() => {
                                    setDiscrepancyDc(dc);
                                    setDiscrepancyResolution("return_to_store");
                                    setDiscrepancyNotes("");
                                  }}
                                >
                                  <ShieldAlert className="size-3" />
                                  Resolve
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: SITE RETURNS */}
        <TabsContent value="returns" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Return #</TableHead>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-xs">Warehouse</TableHead>
                    <TableHead className="text-xs">Reason & Items</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Submitted By</TableHead>
                    <TableHead className="text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSiteReturns ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading site returns…
                      </TableCell>
                    </TableRow>
                  ) : siteReturns.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        No site return challans submitted.
                      </TableCell>
                    </TableRow>
                  ) : (
                    siteReturns.map((sr) => (
                      <TableRow key={sr.id}>
                        <TableCell className="py-2.5 font-mono text-xs font-semibold">
                          {sr.returnNumber}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-medium">
                          {sr.projectTitle}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {sr.warehouseName}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs max-w-[260px]">
                          <p className="truncate font-medium">{sr.reason}</p>
                          <p className="text-[11px] font-mono text-muted-foreground truncate">
                            {sr.lines
                              .map(
                                (l) =>
                                  `${l.itemCode} (${Number(l.quantity).toFixed(2)} ${l.unitSymbol})`,
                              )
                              .join(", ")}
                          </p>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {sr.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {sr.submittedByUserName}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {canDispatch && sr.status === "submitted" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={acceptReturnMutation.isPending}
                              onClick={() => acceptReturnMutation.mutate(sr.id)}
                            >
                              <PackageCheck className="size-3" />
                              Accept Return
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 6: STOCK LEDGER */}
        <TabsContent value="ledger" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Entry #</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Source & Ref</TableHead>
                    <TableHead className="text-xs">Warehouse</TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-center text-xs">Dir</TableHead>
                    <TableHead className="text-right text-xs">Qty</TableHead>
                    <TableHead className="text-right text-xs">
                      Balance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLedger ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading stock ledger…
                      </TableCell>
                    </TableRow>
                  ) : ledger.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        No ledger entries recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="py-2.5 font-mono text-xs font-semibold">
                          {entry.entryNumber}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-[11px] text-muted-foreground">
                          {new Date(entry.postingDate).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell className="py-2.5 max-w-[200px]">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize mb-0.5"
                          >
                            {entry.sourceType.replace(/_/g, " ")}
                          </Badge>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {entry.sourceReference}
                          </p>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {entry.warehouseName}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          <span className="font-mono font-medium block">
                            {entry.itemCode}
                          </span>
                          <span className="text-muted-foreground truncate block max-w-[180px]">
                            {entry.itemName}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          {entry.direction === "in" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                            >
                              <ArrowDownLeft className="size-2.5" /> IN
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                            >
                              <ArrowUpRight className="size-2.5" /> OUT
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-xs font-semibold tabular-nums">
                          {Number(entry.quantity).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {entry.unitSymbol}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                          {entry.balanceBefore} →{" "}
                          <span className="font-semibold text-foreground">
                            {entry.balanceAfter}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 7: TRANSFERS */}
        <TabsContent value="transfers" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Transfer #</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Source → Dest</TableHead>
                    <TableHead className="text-xs">Challan / Vehicle</TableHead>
                    <TableHead className="text-xs">Dispatched</TableHead>
                    <TableHead className="text-xs">Received</TableHead>
                    <TableHead className="text-right text-xs">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTransfers ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading transfers…
                      </TableCell>
                    </TableRow>
                  ) : transfers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        No stock transfers recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transfers.map((trf) => (
                      <TableRow key={trf.id}>
                        <TableCell className="py-2.5 font-mono text-xs font-semibold">
                          {trf.transferNumber}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {trf.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          <span>
                            {trf.sourceWarehouseName} →{" "}
                            <strong>{trf.destinationWarehouseName}</strong>
                          </span>
                          {trf.projectTitle && (
                            <span className="block text-[11px] text-muted-foreground">
                              Proj: {trf.projectTitle}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {trf.challanNumber
                            ? `CH: ${trf.challanNumber}`
                            : "No challan"}
                          {trf.vehicleNumber && ` (${trf.vehicleNumber})`}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                          {trf.dispatchedAt
                            ? new Date(trf.dispatchedAt).toLocaleDateString(
                                "en-IN",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                          {trf.receivedAt
                            ? new Date(trf.receivedAt).toLocaleDateString(
                                "en-IN",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {trf.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                dispatchTransferMutation.mutate(trf.id)
                              }
                              disabled={dispatchTransferMutation.isPending}
                              className="gap-1 h-7 text-xs"
                            >
                              <Send className="size-3" /> Dispatch
                            </Button>
                          )}
                          {trf.status === "dispatched" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedTransfer(trf);
                                setReceiveForm({
                                  lines: (trf.lines || []).map((l) => ({
                                    transferLineId: l.id,
                                    receivedQuantity: l.dispatchedQuantity,
                                  })),
                                  notes: "",
                                });
                                setIsReceiveDialogOpen(true);
                              }}
                              className="gap-1 h-7 text-xs"
                            >
                              <PackageCheck className="size-3" /> Receive
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 8: BOQ RESERVATIONS */}
        <TabsContent value="reservations" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Reservation #</TableHead>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-xs">Warehouse</TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-right text-xs">
                      Reserved Qty
                    </TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingReservations ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                        Loading reservations…
                      </TableCell>
                    </TableRow>
                  ) : reservations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-xs text-muted-foreground"
                      >
                        No active stock reservations.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reservations.map((res) => (
                      <TableRow key={res.id}>
                        <TableCell className="py-2.5 font-mono text-xs font-semibold">
                          {res.reservationNumber}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs font-medium">
                          {res.projectTitle}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {res.warehouseName}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs max-w-[220px]">
                          <span className="font-mono font-medium block">
                            {res.itemCode}
                          </span>
                          <span className="text-muted-foreground truncate block">
                            {res.itemName}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                          {Number(res.quantityReserved).toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2 },
                          )}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {res.unitSymbol}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {res.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {res.status === "active" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => setReleaseReservationId(res.id)}
                              disabled={releaseReservationMutation.isPending}
                            >
                              Release
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 9: WAREHOUSES */}
        <TabsContent value="warehouses" className="mt-0">
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Project</TableHead>
                    <TableHead className="text-xs">Location</TableHead>
                    <TableHead className="text-xs">In-Charge</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((wh) => (
                    <TableRow key={wh.id}>
                      <TableCell className="py-2.5 font-mono text-xs font-semibold">
                        {wh.code}
                      </TableCell>
                      <TableCell className="py-2.5 font-medium text-xs">
                        {wh.name}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {wh.warehouseType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {wh.projectTitle ?? "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {wh.addressLine1}, {wh.city}, {wh.state}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {wh.inChargeUserName ?? "—"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        {wh.isActive === 1 ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400"
                          >
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs & Sheets ── */}

      <SetThresholdDialog
        threshold={thresholdTarget}
        open={isThresholdDialogOpen}
        onOpenChange={setIsThresholdDialogOpen}
      />

      <DispatchMirSheet
        mir={dispatchMirTarget}
        open={isDispatchSheetOpen}
        onOpenChange={setIsDispatchSheetOpen}
      />

      {/* Release Reservation Confirmation Dialog (Replaces window.confirm) */}
      <Dialog
        open={Boolean(releaseReservationId)}
        onOpenChange={(open) => !open && setReleaseReservationId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Release Stock Reservation?</DialogTitle>
            <DialogDescription className="text-xs">
              This will return the reserved quantity back to free available
              warehouse stock.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReleaseReservationId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={releaseReservationMutation.isPending}
              onClick={() => {
                if (releaseReservationId) {
                  releaseReservationMutation.mutate(releaseReservationId);
                }
              }}
            >
              {releaseReservationMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Release Reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replenishment Request Dialog */}
      <Dialog
        open={isReplenishDialogOpen}
        onOpenChange={setIsReplenishDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Replenishment</DialogTitle>
            <DialogDescription className="text-xs">
              {replenishTarget?.itemCode} · {replenishTarget?.itemName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Requested Quantity ({replenishTarget?.unitSymbol})
              </Label>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                className="h-9 text-sm font-mono"
                value={replenishQty}
                onChange={(e) => setReplenishQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Textarea
                rows={2}
                className="text-sm"
                value={replenishNotes}
                onChange={(e) => setReplenishNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReplenishDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!replenishQty || replenishmentMutation.isPending}
              onClick={() =>
                replenishmentMutation.mutate({
                  warehouseId: replenishTarget!.warehouseId,
                  itemId: replenishTarget!.itemId,
                  brandOfferingId: replenishTarget!.brandOfferingId,
                  requestedQty: replenishQty,
                  notes: replenishNotes || undefined,
                })
              }
            >
              {replenishmentMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Submit to Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Warehouse Dialog */}
      <Dialog
        open={isWarehouseDialogOpen}
        onOpenChange={setIsWarehouseDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Warehouse</DialogTitle>
            <DialogDescription className="text-xs">
              Create a new storage location for inventory management.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Code *</Label>
                <Input
                  className="h-9 text-sm font-mono"
                  value={warehouseForm.code}
                  onChange={(e) =>
                    setWarehouseForm((p) => ({ ...p, code: e.target.value }))
                  }
                  placeholder="WH-01"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Name *</Label>
                <Input
                  className="h-9 text-sm"
                  value={warehouseForm.name}
                  onChange={(e) =>
                    setWarehouseForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Main Warehouse"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Type *</Label>
              <Select
                value={warehouseForm.warehouseType}
                onValueChange={(v) =>
                  setWarehouseForm((p) => ({
                    ...p,
                    warehouseType: v as typeof warehouseForm.warehouseType,
                  }))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="central_warehouse" className="text-xs">
                    Central Warehouse
                  </SelectItem>
                  <SelectItem value="regional_depot" className="text-xs">
                    Regional Depot
                  </SelectItem>
                  <SelectItem value="project_site_store" className="text-xs">
                    Project Site Store
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Address Line 1 *</Label>
              <Input
                className="h-9 text-sm"
                value={warehouseForm.addressLine1}
                onChange={(e) =>
                  setWarehouseForm((p) => ({
                    ...p,
                    addressLine1: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">City *</Label>
                <Input
                  className="h-9 text-sm"
                  value={warehouseForm.city}
                  onChange={(e) =>
                    setWarehouseForm((p) => ({ ...p, city: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">State *</Label>
                <Input
                  className="h-9 text-sm"
                  value={warehouseForm.state}
                  onChange={(e) =>
                    setWarehouseForm((p) => ({ ...p, state: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsWarehouseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                createWarehouseMutation.isPending ||
                !warehouseForm.code ||
                !warehouseForm.name
              }
              onClick={() => createWarehouseMutation.mutate(warehouseForm)}
            >
              {createWarehouseMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Create Warehouse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post GRN Dialog */}
      <Dialog open={isPostGrnDialogOpen} onOpenChange={setIsPostGrnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post GRN to Stock</DialogTitle>
            <DialogDescription className="text-xs">
              Post an inspected and accepted goods receipt line into warehouse
              stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Warehouse *</Label>
              <Select
                value={grnForm.warehouseId}
                onValueChange={(v) =>
                  setGrnForm((p) => ({ ...p, warehouseId: v }))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id} className="text-xs">
                      {wh.code} · {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Goods Receipt Line ID *
              </Label>
              <Input
                value={grnForm.goodsReceiptLineId}
                onChange={(e) =>
                  setGrnForm((p) => ({
                    ...p,
                    goodsReceiptLineId: e.target.value,
                  }))
                }
                placeholder="UUID of the GRN line"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                rows={2}
                className="text-sm"
                value={grnForm.notes}
                onChange={(e) =>
                  setGrnForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPostGrnDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                postGrnMutation.isPending ||
                !grnForm.warehouseId ||
                !grnForm.goodsReceiptLineId
              }
              onClick={() => postGrnMutation.mutate(grnForm)}
            >
              {postGrnMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Post to Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Transfer Dialog */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Receive Transfer — {selectedTransfer?.transferNumber}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Confirm quantities received at destination warehouse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {receiveForm.lines.map((line, idx) => (
              <div
                key={line.transferLineId}
                className="flex items-center gap-3"
              >
                <span className="text-xs font-mono text-muted-foreground w-6">
                  {idx + 1}.
                </span>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Received Quantity
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    className="h-9 text-sm font-mono"
                    value={line.receivedQuantity}
                    onChange={(e) =>
                      setReceiveForm((prev) => ({
                        ...prev,
                        lines: prev.lines.map((l, i) =>
                          i === idx
                            ? { ...l, receivedQuantity: e.target.value }
                            : l,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                rows={2}
                className="text-sm"
                value={receiveForm.notes}
                onChange={(e) =>
                  setReceiveForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReceiveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={receiveTransferMutation.isPending}
              onClick={() =>
                receiveTransferMutation.mutate({
                  transferId: selectedTransfer!.id,
                  payload: receiveForm,
                })
              }
            >
              {receiveTransferMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Transfer Challan Dialog */}
      <Dialog
        open={isTransferDialogOpen}
        onOpenChange={setIsTransferDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Stock Transfer Challan</DialogTitle>
            <DialogDescription className="text-xs">
              Transfer material from a source warehouse to a destination depot
              or site store.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Source Warehouse *
                </Label>
                <Select
                  value={transferForm.sourceWarehouseId}
                  onValueChange={(v) =>
                    setTransferForm((p) => ({ ...p, sourceWarehouseId: v }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">
                        {wh.code} · {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Destination Warehouse *
                </Label>
                <Select
                  value={transferForm.destinationWarehouseId}
                  onValueChange={(v) =>
                    setTransferForm((p) => ({
                      ...p,
                      destinationWarehouseId: v,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">
                        {wh.code} · {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Item ID *</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  placeholder="UUID of inventory item"
                  value={transferForm.lines[0]?.itemId ?? ""}
                  onChange={(e) =>
                    setTransferForm((p) => ({
                      ...p,
                      lines: [
                        {
                          itemId: e.target.value,
                          dispatchedQuantity:
                            p.lines[0]?.dispatchedQuantity ?? "1",
                          notes: p.lines[0]?.notes ?? "",
                        },
                      ],
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Dispatch Qty *</Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  className="h-9 text-sm font-mono"
                  value={transferForm.lines[0]?.dispatchedQuantity ?? "1"}
                  onChange={(e) =>
                    setTransferForm((p) => ({
                      ...p,
                      lines: [
                        {
                          itemId: p.lines[0]?.itemId ?? "",
                          dispatchedQuantity: e.target.value,
                          notes: p.lines[0]?.notes ?? "",
                        },
                      ],
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Vehicle Number</Label>
                <Input
                  className="h-9 text-sm font-mono"
                  value={transferForm.vehicleNumber}
                  onChange={(e) =>
                    setTransferForm((p) => ({
                      ...p,
                      vehicleNumber: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Transporter</Label>
                <Input
                  className="h-9 text-sm"
                  value={transferForm.transporterName}
                  onChange={(e) =>
                    setTransferForm((p) => ({
                      ...p,
                      transporterName: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                rows={2}
                className="text-sm"
                value={transferForm.notes}
                onChange={(e) =>
                  setTransferForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTransferDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                createTransferMutation.isPending ||
                !transferForm.sourceWarehouseId ||
                !transferForm.destinationWarehouseId ||
                !transferForm.lines[0]?.itemId
              }
              onClick={() =>
                createTransferMutation.mutate({
                  sourceWarehouseId: transferForm.sourceWarehouseId,
                  destinationWarehouseId: transferForm.destinationWarehouseId,
                  challanNumber: transferForm.challanNumber || undefined,
                  vehicleNumber: transferForm.vehicleNumber || undefined,
                  transporterName: transferForm.transporterName || undefined,
                  notes: transferForm.notes || undefined,
                  lines: transferForm.lines,
                })
              }
            >
              {createTransferMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Create Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Movement / Document Dialog */}
      <Dialog
        open={isDocumentDialogOpen}
        onOpenChange={setIsDocumentDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Post Stock Movement Document</DialogTitle>
            <DialogDescription className="text-xs">
              Record an opening balance, site issue/return, or audited inventory
              adjustment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Document Type *</Label>
                <Select
                  value={documentForm.documentType}
                  onValueChange={(v) =>
                    setDocumentForm((p) => ({
                      ...p,
                      documentType: v as typeof documentForm.documentType,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opening_balance" className="text-xs">
                      Opening Balance
                    </SelectItem>
                    <SelectItem value="site_issue" className="text-xs">
                      Site Issue
                    </SelectItem>
                    <SelectItem value="site_return" className="text-xs">
                      Site Return
                    </SelectItem>
                    <SelectItem value="adjustment" className="text-xs">
                      Adjustment
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Document Date *</Label>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={documentForm.documentDate}
                  onChange={(e) =>
                    setDocumentForm((p) => ({
                      ...p,
                      documentDate: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Source Warehouse
                </Label>
                <Select
                  value={documentForm.sourceWarehouseId || "none"}
                  onValueChange={(v) =>
                    setDocumentForm((p) => ({
                      ...p,
                      sourceWarehouseId: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      None
                    </SelectItem>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">
                        {wh.code} · {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Destination Warehouse
                </Label>
                <Select
                  value={documentForm.destinationWarehouseId || "none"}
                  onValueChange={(v) =>
                    setDocumentForm((p) => ({
                      ...p,
                      destinationWarehouseId: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      None
                    </SelectItem>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">
                        {wh.code} · {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Item ID *</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  placeholder="UUID of inventory item"
                  value={documentForm.lines[0]?.itemId ?? ""}
                  onChange={(e) =>
                    setDocumentForm((p) => ({
                      ...p,
                      lines: [
                        {
                          itemId: e.target.value,
                          quantity: p.lines[0]?.quantity ?? "1",
                          unitRate: p.lines[0]?.unitRate ?? "",
                          notes: p.lines[0]?.notes ?? "",
                        },
                      ],
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Quantity *</Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  className="h-9 text-sm font-mono"
                  value={documentForm.lines[0]?.quantity ?? "1"}
                  onChange={(e) =>
                    setDocumentForm((p) => ({
                      ...p,
                      lines: [
                        {
                          itemId: p.lines[0]?.itemId ?? "",
                          quantity: e.target.value,
                          unitRate: p.lines[0]?.unitRate ?? "",
                          notes: p.lines[0]?.notes ?? "",
                        },
                      ],
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes / Reason *</Label>
              <Textarea
                rows={2}
                className="text-sm"
                value={documentForm.notes}
                onChange={(e) =>
                  setDocumentForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDocumentDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                createDocumentMutation.isPending ||
                !documentForm.lines[0]?.itemId ||
                !documentForm.notes.trim()
              }
              onClick={() =>
                createDocumentMutation.mutate({
                  documentType: documentForm.documentType,
                  sourceWarehouseId:
                    documentForm.sourceWarehouseId || undefined,
                  destinationWarehouseId:
                    documentForm.destinationWarehouseId || undefined,
                  documentDate: documentForm.documentDate,
                  referenceNumber: documentForm.referenceNumber || undefined,
                  notes: documentForm.notes.trim(),
                  lines: documentForm.lines.map((l) => ({
                    itemId: l.itemId,
                    quantity: l.quantity,
                    unitRate: l.unitRate || undefined,
                    notes: l.notes || undefined,
                  })),
                })
              }
            >
              {createDocumentMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Post Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Discrepancy Dialog */}
      <Dialog
        open={Boolean(discrepancyDc)}
        onOpenChange={(open) => {
          if (!open) setDiscrepancyDc(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Resolve Discrepancy — {discrepancyDc?.dcNumber}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Reconcile damaged or short-delivered in-transit quantities back to
              Store or audited transit write-off.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Resolution Action *
              </Label>
              <Select
                value={discrepancyResolution}
                onValueChange={(v) =>
                  setDiscrepancyResolution(v as typeof discrepancyResolution)
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="return_to_store" className="text-xs">
                    Return Damaged/Short to Store
                  </SelectItem>
                  <SelectItem value="picking_error_restock" className="text-xs">
                    Picking Error Restock to Store
                  </SelectItem>
                  <SelectItem
                    value="write_off_transit_loss"
                    className="text-xs"
                  >
                    Write Off Transit Loss
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Resolution Remarks *
              </Label>
              <Textarea
                rows={3}
                className="text-sm"
                placeholder="Explain discrepancy root cause and recovery decision…"
                value={discrepancyNotes}
                onChange={(e) => setDiscrepancyNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDiscrepancyDc(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                discrepancyNotes.trim().length < 3 ||
                resolveDiscrepancyMutation.isPending
              }
              onClick={() => resolveDiscrepancyMutation.mutate()}
            >
              {resolveDiscrepancyMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              )}
              Confirm Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
