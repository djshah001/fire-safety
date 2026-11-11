import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Boxes,
  ArrowRightLeft,
  History,
  BookmarkCheck,
  Warehouse as WarehouseIcon,
  Plus,
  Send,
  PackageCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  Search,
} from "lucide-react";

import {
  stockBalancesQuery,
  stockLedgerQuery,
  stockTransfersQuery,
  stockReservationsQuery,
  warehousesQuery,
  createWarehouse,
  postGrnToStock,
  createStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  releaseStockReservation,
  createStockDocument,
  type StockTransfer,
} from "@/api/inventory";
import { currentUserQuery } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function InventoryStockPage() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery(currentUserQuery);

  const [activeTab, setActiveTab] = useState("balances");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [isWarehouseDialogOpen, setIsWarehouseDialogOpen] = useState(false);
  const [isPostGrnDialogOpen, setIsPostGrnDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);

  // Form states
  const [warehouseForm, setWarehouseForm] = useState({
    code: "",
    name: "",
    warehouseType: "central_warehouse" as "central_warehouse" | "regional_depot" | "project_site_store",
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
    documentType: "opening_balance" as "opening_balance" | "site_issue" | "site_return" | "adjustment",
    sourceWarehouseId: "",
    destinationWarehouseId: "",
    documentDate: new Date().toISOString().slice(0, 10),
    referenceNumber: "",
    notes: "",
    lines: [{ itemId: "", quantity: "1", unitRate: "", notes: "" }],
  });

  // Queries
  const { data: warehouses = [] } = useQuery(warehousesQuery(true));

  const filterWhId = selectedWarehouseId === "all" ? undefined : selectedWarehouseId;
  const { data: balances = [], isLoading: isLoadingBalances } = useQuery(
    stockBalancesQuery({ warehouseId: filterWhId, search: searchQuery || undefined })
  );

  const { data: ledger = [], isLoading: isLoadingLedger } = useQuery(
    stockLedgerQuery({ warehouseId: filterWhId })
  );

  const { data: transfers = [], isLoading: isLoadingTransfers } = useQuery(
    stockTransfersQuery()
  );

  const { data: reservations = [], isLoading: isLoadingReservations } = useQuery(
    stockReservationsQuery()
  );

  // Mutations
  const createWarehouseMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: () => {
      toast.success("Warehouse created successfully");
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
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to create warehouse");
    },
  });

  const postGrnMutation = useMutation({
    mutationFn: postGrnToStock,
    onSuccess: (data) => {
      toast.success(`GRN posted to stock! Entry ${data.ledgerEntry.entryNumber} recorded.`);
      setIsPostGrnDialogOpen(false);
      setGrnForm({ warehouseId: "", goodsReceiptLineId: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to post GRN to inventory");
    },
  });

  const createTransferMutation = useMutation({
    mutationFn: createStockTransfer,
    onSuccess: () => {
      toast.success("Stock transfer challan created");
      setIsTransferDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to create transfer");
    },
  });

  const dispatchTransferMutation = useMutation({
    mutationFn: dispatchStockTransfer,
    onSuccess: () => {
      toast.success("Transfer dispatched and material deducted from source warehouse");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to dispatch transfer");
    },
  });

  const receiveTransferMutation = useMutation({
    mutationFn: ({ transferId, payload }: { transferId: string; payload: any }) =>
      receiveStockTransfer(transferId, payload),
    onSuccess: () => {
      toast.success("Material received and destination warehouse balance credited");
      setIsReceiveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to receive transfer");
    },
  });

  const releaseReservationMutation = useMutation({
    mutationFn: releaseStockReservation,
    onSuccess: () => {
      toast.success("Stock reservation released back to available balance");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to release reservation");
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: createStockDocument,
    onSuccess: () => {
      toast.success("Stock movement document posted to ledger");
      setIsDocumentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to post stock document");
    },
  });

  // Permissions
  const canManageWarehouse =
    user?.permissions.includes("system.access.all") ||
    user?.permissions.includes("inventory.warehouse.manage");
  const canPostReceipt =
    user?.permissions.includes("system.access.all") ||
    user?.permissions.includes("inventory.receipt.post");
  const canTransfer =
    user?.permissions.includes("system.access.all") ||
    user?.permissions.includes("inventory.transfer.create");
  const canAdjust =
    user?.permissions.includes("system.access.all") ||
    user?.permissions.includes("inventory.adjustment.manage");

  // Summary Metrics
  const totalOnHand = balances.reduce((sum, b) => sum + Number(b.quantityOnHand), 0);
  const totalReserved = balances.reduce((sum, b) => sum + Number(b.quantityReserved), 0);
  const totalAvailable = totalOnHand - totalReserved;

  return (
    <div className="space-y-6 p-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Boxes className="h-7 w-7 text-primary" />
            Inventory & Warehouse Ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Multi-location perpetual stock ledger, site challans, in-transit tracking, and BOQ reservations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPostReceipt && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPostGrnDialogOpen(true)}
              className="gap-1.5"
            >
              <PackageCheck className="h-4 w-4 text-emerald-600" />
              Post GRN to Stock
            </Button>
          )}

          {canTransfer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTransferDialogOpen(true)}
              className="gap-1.5"
            >
              <ArrowRightLeft className="h-4 w-4 text-blue-600" />
              New Transfer Challan
            </Button>
          )}

          {canAdjust && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDocumentDialogOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4 text-amber-600" />
              Stock Movement / Issue
            </Button>
          )}

          {canManageWarehouse && (
            <Button
              size="sm"
              onClick={() => setIsWarehouseDialogOpen(true)}
              className="gap-1.5"
            >
              <WarehouseIcon className="h-4 w-4" />
              Add Warehouse
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium tracking-wider">
              Warehouses & Depots
            </CardDescription>
            <CardTitle className="text-2xl font-bold">{warehouses.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Central warehouses, depots, and project stores
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium tracking-wider">
              Total Stock On Hand
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {totalOnHand.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Physical material in storage locations
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium tracking-wider">
              Reserved for Projects
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {totalReserved.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Allocated to active project BOQs
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium tracking-wider">
              Available to Issue
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {totalAvailable.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Unrestricted quantity ready for dispatch
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="balances" className="gap-2">
            <Boxes className="h-4 w-4" />
            Stock Balances
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <History className="h-4 w-4" />
            Stock Ledger
          </TabsTrigger>
          <TabsTrigger value="transfers" className="gap-2">
            <Truck className="h-4 w-4" />
            Site & Inter-WH Transfers
          </TabsTrigger>
          <TabsTrigger value="reservations" className="gap-2">
            <BookmarkCheck className="h-4 w-4" />
            BOQ Reservations
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-2">
            <WarehouseIcon className="h-4 w-4" />
            Warehouses ({warehouses.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: STOCK BALANCES */}
        <TabsContent value="balances" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-lg border border-border">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search item code, name, or warehouse..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="w-64">
                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Warehouses & Sites</SelectItem>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.code} - {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Card className="border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Description</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingBalances ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Loading stock balances...
                      </TableCell>
                    </TableRow>
                  ) : balances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No inventory stock balances found matching criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    balances.map((row) => {
                      const onHand = Number(row.quantityOnHand);
                      const avail = Number(row.quantityAvailable);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            <span className="font-mono text-xs text-muted-foreground block">
                              {row.warehouseCode}
                            </span>
                            {row.warehouseName}
                          </TableCell>
                          <TableCell className="font-mono font-medium text-xs">
                            {row.itemCode}
                          </TableCell>
                          <TableCell className="max-w-md truncate">{row.itemName}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {onHand.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {Number(row.quantityReserved).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {avail.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.unitSymbol}
                          </TableCell>
                          <TableCell>
                            {onHand === 0 ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : avail <= 0 ? (
                              <Badge variant="outline" className="border-amber-500 text-amber-600">
                                Fully Reserved
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                Available
                              </Badge>
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

        {/* TAB 2: STOCK LEDGER */}
        <TabsContent value="ledger" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Chronological Stock Transaction Log
              </CardTitle>
              <CardDescription className="text-xs">
                Authoritative append-only movement history verifying before and after stock balances.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry #</TableHead>
                    <TableHead>Posting Date</TableHead>
                    <TableHead>Source Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Direction</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Posted By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLedger ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        Loading stock ledger...
                      </TableCell>
                    </TableRow>
                  ) : ledger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No ledger entries recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {entry.entryNumber}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(entry.postingDate).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {entry.sourceType.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium max-w-[200px] truncate">
                          {entry.sourceReference}
                        </TableCell>
                        <TableCell className="text-xs">{entry.warehouseName}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono font-medium block">{entry.itemCode}</span>
                          <span className="text-muted-foreground truncate block max-w-[180px]">
                            {entry.itemName}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.direction === "in" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1">
                              <ArrowDownLeft className="h-3 w-3" /> IN
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 gap-1">
                              <ArrowUpRight className="h-3 w-3" /> OUT
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {Number(entry.quantity).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {entry.unitSymbol}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {entry.balanceBefore} →{" "}
                          <span className="font-semibold text-foreground">
                            {entry.balanceAfter}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.postedByUserName}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: TRANSFERS */}
        <TabsContent value="transfers" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Inter-Warehouse & Project Site Transfers
              </CardTitle>
              <CardDescription className="text-xs">
                Track material transit between warehouses and project sites with dispatch and receiving challans.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source Warehouse</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Challan / Vehicle</TableHead>
                    <TableHead>Dispatched At</TableHead>
                    <TableHead>Received At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingTransfers ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Loading transfers...
                      </TableCell>
                    </TableRow>
                  ) : transfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No stock transfers recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transfers.map((trf) => (
                      <TableRow key={trf.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {trf.transferNumber}
                        </TableCell>
                        <TableCell>
                          {trf.status === "draft" && <Badge variant="secondary">Draft</Badge>}
                          {trf.status === "dispatched" && (
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              In Transit
                            </Badge>
                          )}
                          {trf.status === "received" && (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Received
                            </Badge>
                          )}
                          {trf.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{trf.sourceWarehouseName}</TableCell>
                        <TableCell className="text-xs">
                          {trf.destinationWarehouseName}
                          {trf.projectTitle && (
                            <span className="block text-muted-foreground text-[11px]">
                              Proj: {trf.projectTitle}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {trf.challanNumber ? `CH: ${trf.challanNumber}` : "No challan"}
                          {trf.vehicleNumber && ` (${trf.vehicleNumber})`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {trf.dispatchedAt
                            ? new Date(trf.dispatchedAt).toLocaleDateString("en-IN")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {trf.receivedAt
                            ? new Date(trf.receivedAt).toLocaleDateString("en-IN")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {trf.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dispatchTransferMutation.mutate(trf.id)}
                              disabled={dispatchTransferMutation.isPending}
                              className="gap-1 h-7 text-xs"
                            >
                              <Send className="h-3 w-3" /> Dispatch
                            </Button>
                          )}
                          {trf.status === "dispatched" && (
                            <Button
                              size="sm"
                              onClick={async () => {
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
                              <PackageCheck className="h-3 w-3" /> Receive Stock
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

        {/* TAB 4: BOQ RESERVATIONS */}
        <TabsContent value="reservations" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Project BOQ Stock Reservations
              </CardTitle>
              <CardDescription className="text-xs">
                Reserved material allocations protecting critical project components from unassigned consumption.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reservation #</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Reserved Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reserved By</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingReservations ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Loading reservations...
                      </TableCell>
                    </TableRow>
                  ) : reservations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No active stock reservations.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reservations.map((res) => (
                      <TableRow key={res.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {res.reservationNumber}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{res.projectTitle}</TableCell>
                        <TableCell className="text-xs">{res.warehouseName}</TableCell>
                        <TableCell className="font-mono text-xs">{res.itemCode}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{res.itemName}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {Number(res.quantityReserved).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {res.unitSymbol}
                          </span>
                        </TableCell>
                        <TableCell>
                          {res.status === "active" && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              Active
                            </Badge>
                          )}
                          {res.status === "fulfilled" && (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Fulfilled
                            </Badge>
                          )}
                          {res.status === "released" && <Badge variant="secondary">Released</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {res.reservedByUserName}
                        </TableCell>
                        <TableCell className="text-right">
                          {res.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => releaseReservationMutation.mutate(res.id)}
                              disabled={releaseReservationMutation.isPending}
                              className="text-xs h-7"
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

        {/* TAB 5: WAREHOUSES DIRECTORY */}
        <TabsContent value="warehouses" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold">
                  Warehouses, Depots & Site Stores
                </CardTitle>
                <CardDescription className="text-xs">
                  Physical storage facilities registered for stock custody and logistics.
                </CardDescription>
              </div>
              {canManageWarehouse && (
                <Button size="sm" onClick={() => setIsWarehouseDialogOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> New Warehouse
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Facility Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>In-Charge</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No warehouses registered yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    warehouses.map((wh) => (
                      <TableRow key={wh.id}>
                        <TableCell className="font-mono font-semibold text-xs">{wh.code}</TableCell>
                        <TableCell className="font-medium text-sm">{wh.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {wh.warehouseType.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {wh.addressLine1}, {wh.city}, {wh.state} {wh.postalCode}
                        </TableCell>
                        <TableCell className="text-xs">
                          {wh.inChargeUserName || <span className="text-muted-foreground">Unassigned</span>}
                        </TableCell>
                        <TableCell>
                          {wh.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
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
      </Tabs>

      {/* DIALOG 1: ADD WAREHOUSE */}
      <Dialog open={isWarehouseDialogOpen} onOpenChange={setIsWarehouseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Storage Warehouse</DialogTitle>
            <DialogDescription>
              Register a new central warehouse, regional depot, or project site store.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wh-code">Code *</Label>
                <Input
                  id="wh-code"
                  placeholder="WH-AHMEDABAD"
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-type">Type *</Label>
                <Select
                  value={warehouseForm.warehouseType}
                  onValueChange={(val) => setWarehouseForm({ ...warehouseForm, warehouseType: val as any })}
                >
                  <SelectTrigger id="wh-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="central_warehouse">Central Warehouse</SelectItem>
                    <SelectItem value="regional_depot">Regional Depot</SelectItem>
                    <SelectItem value="project_site_store">Project Site Store</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Warehouse Name *</Label>
              <Input
                id="wh-name"
                placeholder="Ahmedabad Central Depot"
                value={warehouseForm.name}
                onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-address">Address Line 1 *</Label>
              <Input
                id="wh-address"
                placeholder="Plot 42, GIDC Industrial Estate"
                value={warehouseForm.addressLine1}
                onChange={(e) => setWarehouseForm({ ...warehouseForm, addressLine1: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wh-city">City *</Label>
                <Input
                  id="wh-city"
                  placeholder="Ahmedabad"
                  value={warehouseForm.city}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, city: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-state">State *</Label>
                <Input
                  id="wh-state"
                  placeholder="Gujarat"
                  value={warehouseForm.state}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, state: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-pincode">PIN</Label>
                <Input
                  id="wh-pincode"
                  placeholder="380001"
                  value={warehouseForm.postalCode}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, postalCode: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWarehouseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createWarehouseMutation.mutate(warehouseForm)}
              disabled={createWarehouseMutation.isPending || !warehouseForm.code || !warehouseForm.name}
            >
              Save Warehouse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: POST GRN TO STOCK */}
      <Dialog open={isPostGrnDialogOpen} onOpenChange={setIsPostGrnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post Inspected GRN to Inventory</DialogTitle>
            <DialogDescription>
              Takes accepted goods receipt items and creates an authoritative inbound stock ledger entry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="grn-wh">Destination Warehouse *</Label>
              <Select
                value={grnForm.warehouseId}
                onValueChange={(val) => setGrnForm({ ...grnForm, warehouseId: val })}
              >
                <SelectTrigger id="grn-wh">
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.code} - {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grn-line-id">Goods Receipt Line UUID *</Label>
              <Input
                id="grn-line-id"
                placeholder="Enter goods receipt line ID..."
                value={grnForm.goodsReceiptLineId}
                onChange={(e) => setGrnForm({ ...grnForm, goodsReceiptLineId: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Line must have an inspected accepted quantity &gt; 0 and not already posted.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grn-notes">Notes / Inspection Reference</Label>
              <Textarea
                id="grn-notes"
                placeholder="Optional receiving notes..."
                value={grnForm.notes}
                onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPostGrnDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => postGrnMutation.mutate(grnForm)}
              disabled={postGrnMutation.isPending || !grnForm.warehouseId || !grnForm.goodsReceiptLineId}
            >
              Post to Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: CREATE STOCK TRANSFER */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Stock Transfer Challan</DialogTitle>
            <DialogDescription>
              Initiate a transit challan between warehouses or to a project site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source Warehouse *</Label>
                <Select
                  value={transferForm.sourceWarehouseId}
                  onValueChange={(val) => setTransferForm({ ...transferForm, sourceWarehouseId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Origin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.code} - {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Destination Warehouse *</Label>
                <Select
                  value={transferForm.destinationWarehouseId}
                  onValueChange={(val) => setTransferForm({ ...transferForm, destinationWarehouseId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Destination..." />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((wh) => wh.id !== transferForm.sourceWarehouseId)
                      .map((wh) => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.code} - {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Challan Number</Label>
                <Input
                  placeholder="CH-2026-0042"
                  value={transferForm.challanNumber}
                  onChange={(e) => setTransferForm({ ...transferForm, challanNumber: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Vehicle Number</Label>
                <Input
                  placeholder="GJ-01-AB-1234"
                  value={transferForm.vehicleNumber}
                  onChange={(e) => setTransferForm({ ...transferForm, vehicleNumber: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Item ID *</Label>
              <Input
                placeholder="UUID of catalogue item..."
                value={transferForm.lines[0]?.itemId || ""}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    lines: [
                      {
                        itemId: e.target.value,
                        dispatchedQuantity: transferForm.lines[0]?.dispatchedQuantity || "1",
                        notes: transferForm.lines[0]?.notes || "",
                      },
                    ],
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Dispatched Quantity *</Label>
              <Input
                placeholder="10.0000"
                value={transferForm.lines[0]?.dispatchedQuantity || ""}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    lines: [
                      {
                        itemId: transferForm.lines[0]?.itemId || "",
                        dispatchedQuantity: e.target.value,
                        notes: transferForm.lines[0]?.notes || "",
                      },
                    ],
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Transit details / instructions..."
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTransferMutation.mutate(transferForm)}
              disabled={
                createTransferMutation.isPending ||
                !transferForm.sourceWarehouseId ||
                !transferForm.destinationWarehouseId ||
                !transferForm.lines[0]?.itemId
              }
            >
              Create Challan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: STOCK MOVEMENT / ADJUSTMENT */}
      <Dialog open={isDocumentDialogOpen} onOpenChange={setIsDocumentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stock Movement & Adjustment</DialogTitle>
            <DialogDescription>
              Record cutover opening balance, site consumption issue, site return, or audited stocktake adjustment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Movement Type *</Label>
              <Select
                value={documentForm.documentType}
                onValueChange={(val) => setDocumentForm({ ...documentForm, documentType: val as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opening_balance">Opening Balance (Cutover)</SelectItem>
                  <SelectItem value="site_issue">Site Issue (Consumption)</SelectItem>
                  <SelectItem value="site_return">Site Return (Back to WH)</SelectItem>
                  <SelectItem value="adjustment">Stock Adjustment (Audit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {documentForm.documentType === "site_issue" ? "Source Warehouse *" : "Destination Warehouse *"}
              </Label>
              <Select
                value={
                  documentForm.documentType === "site_issue"
                    ? documentForm.sourceWarehouseId
                    : documentForm.destinationWarehouseId
                }
                onValueChange={(val) =>
                  documentForm.documentType === "site_issue"
                    ? setDocumentForm({ ...documentForm, sourceWarehouseId: val })
                    : setDocumentForm({ ...documentForm, destinationWarehouseId: val })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.code} - {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Item UUID *</Label>
                <Input
                  placeholder="Catalogue item ID"
                  value={documentForm.lines[0]?.itemId || ""}
                  onChange={(e) =>
                    setDocumentForm({
                      ...documentForm,
                      lines: [
                        {
                          itemId: e.target.value,
                          quantity: documentForm.lines[0]?.quantity || "1",
                          unitRate: documentForm.lines[0]?.unitRate || "",
                          notes: documentForm.lines[0]?.notes || "",
                        },
                      ],
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Quantity *</Label>
                <Input
                  placeholder="Positive decimal"
                  value={documentForm.lines[0]?.quantity || ""}
                  onChange={(e) =>
                    setDocumentForm({
                      ...documentForm,
                      lines: [
                        {
                          itemId: documentForm.lines[0]?.itemId || "",
                          quantity: e.target.value,
                          unitRate: documentForm.lines[0]?.unitRate || "",
                          notes: documentForm.lines[0]?.notes || "",
                        },
                      ],
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Business Reason / Justification *</Label>
              <Textarea
                placeholder="Mandatory reason for audit trail..."
                value={documentForm.notes}
                onChange={(e) => setDocumentForm({ ...documentForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDocumentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createDocumentMutation.mutate(documentForm)}
              disabled={
                createDocumentMutation.isPending ||
                !documentForm.lines[0]?.itemId ||
                !documentForm.notes ||
                (documentForm.documentType === "site_issue"
                  ? !documentForm.sourceWarehouseId
                  : !documentForm.destinationWarehouseId)
              }
            >
              Post Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 5: RECEIVE STOCK TRANSFER */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receive Inbound Transfer</DialogTitle>
            <DialogDescription>
              Verify arrived materials and confirm received quantities into destination warehouse.
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 p-3 rounded-md text-xs space-y-1">
                <div className="font-semibold text-foreground">
                  Transfer #{selectedTransfer.transferNumber}
                </div>
                <div className="text-muted-foreground">
                  From: {selectedTransfer.sourceWarehouseName} → To: {selectedTransfer.destinationWarehouseName}
                </div>
                {selectedTransfer.challanNumber && (
                  <div className="text-muted-foreground">
                    Challan: {selectedTransfer.challanNumber}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Receiving Notes</Label>
                <Textarea
                  placeholder="Carrier / condition notes..."
                  value={receiveForm.notes}
                  onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedTransfer) {
                  receiveTransferMutation.mutate({
                    transferId: selectedTransfer.id,
                    payload: receiveForm,
                  });
                }
              }}
              disabled={receiveTransferMutation.isPending || !selectedTransfer}
            >
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
