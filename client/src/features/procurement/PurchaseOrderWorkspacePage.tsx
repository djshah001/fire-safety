import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  FileCheck2,
  FileEdit,
  History,
  Mail,
  MessageSquare,
  PackageCheck,
  RotateCcw,
  Send,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { getApiErrorMessage } from "@/api/client";
import {
  amendPurchaseOrder,
  approvePoRevision,
  cancelPurchaseOrder,
  createSupplierReturn,
  dispatchPurchaseOrderToVendor,
  dispatchSupplierReturn,
  inspectGoodsReceipt,
  issuePurchaseOrder,
  poPdfUrl,
  purchaseOrderWorkspaceQuery,
  recordSupplierReturnReplacement,
  settleSupplierReturnCredit,
  shortClosePurchaseOrder,
  submitPoRevision,
  supplierReturnPdfUrl,
  type GoodsReceipt,
  type SupplierReturn,
} from "@/api/purchaseOrders";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GoodsReceiptSheet } from "./GoodsReceiptSheet";

function formatInr(val: string) {
  const n = Number(val);
  return Number.isNaN(n)
    ? val
    : n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        >
          Draft
        </Badge>
      );
    case "pending_approval":
      return (
        <Badge
          variant="outline"
          className="border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400"
        >
          Pending Approval
        </Badge>
      );
    case "approved":
      return (
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        >
          Approved
        </Badge>
      );
    case "issued":
      return (
        <Badge className="bg-purple-600 text-white hover:bg-purple-700">
          Issued
        </Badge>
      );
    case "partially_delivered":
      return (
        <Badge className="bg-indigo-600 text-white hover:bg-indigo-700">
          Partially Delivered
        </Badge>
      );
    case "delivered":
      return (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
          Delivered
        </Badge>
      );
    case "short_closed":
      return (
        <Badge
          variant="outline"
          className="border-amber-600/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
        >
          Short Closed
        </Badge>
      );
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function PurchaseOrderWorkspacePage() {
  const { poId } = useParams();
  const queryClient = useQueryClient();
  const workspace = useQuery(purchaseOrderWorkspaceQuery(poId));

  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [inspectModalGrn, setInspectModalGrn] = useState<GoodsReceipt | null>(
    null,
  );
  const [inspectionQtys, setInspectionQtys] = useState<
    Record<string, { accepted: string; rejected: string; reason: string }>
  >({});

  const [shortCloseOpen, setShortCloseOpen] = useState(false);
  const [shortCloseReason, setShortCloseReason] = useState("");

  const [dispatchSheetOpen, setDispatchSheetOpen] = useState(false);
  const [dispatchChannel, setDispatchChannel] = useState<
    "email" | "whatsapp_msg91" | "whatsapp_manual"
  >("email");
  const [dispatchRecipientName, setDispatchRecipientName] = useState("");
  const [dispatchRecipientContact, setDispatchRecipientContact] = useState("");
  const [dispatchCustomMessage, setDispatchCustomMessage] = useState("");

  const [rtvCreateGrn, setRtvCreateGrn] = useState<GoodsReceipt | null>(null);
  const [rtvResolutionType, setRtvResolutionType] = useState<
    "replacement" | "credit_note" | "deduction"
  >("replacement");
  const [rtvReason, setRtvReason] = useState("");
  const [rtvLineQtys, setRtvLineQtys] = useState<
    Record<string, { qty: string; remarks: string }>
  >({});

  const [rtvDispatchTarget, setRtvDispatchTarget] =
    useState<SupplierReturn | null>(null);
  const [rtvCarrier, setRtvCarrier] = useState("");
  const [rtvVehicle, setRtvVehicle] = useState("");
  const [rtvDispatchDate, setRtvDispatchDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [rtvReplacementTarget, setRtvReplacementTarget] =
    useState<SupplierReturn | null>(null);
  const [rtvReplacementQtys, setRtvReplacementQtys] = useState<
    Record<string, string>
  >({});

  const [rtvCreditTarget, setRtvCreditTarget] =
    useState<SupplierReturn | null>(null);
  const [rtvCreditRef, setRtvCreditRef] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["procurement", "purchase-orders", poId],
    });
    queryClient.invalidateQueries({
      queryKey: ["procurement", "purchase-orders"],
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !workspace.data) {
        throw new Error("Workspace not ready");
      }
      return submitPoRevision(poId, workspace.data.currentRevision.rowVersion);
    },
    onSuccess: () => {
      toast.success("Purchase Order revision submitted for approval.");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !workspace.data) {
        throw new Error("Workspace not ready");
      }
      return approvePoRevision(
        poId,
        workspace.data.currentRevision.rowVersion,
        approvalNotes.trim() || undefined,
      );
    },
    onSuccess: () => {
      toast.success("Purchase Order revision approved!");
      setApproveDialogOpen(false);
      setApprovalNotes("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !workspace.data) {
        throw new Error("Workspace not ready");
      }
      return issuePurchaseOrder(
        poId,
        workspace.data.currentRevision.rowVersion,
      );
    },
    onSuccess: () => {
      toast.success(
        "Purchase Order issued with immutable PDF snapshot generated.",
      );
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const amendMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !workspace.data) {
        throw new Error("Workspace not ready");
      }
      if (!amendReason.trim() || amendReason.trim().length < 5) {
        throw new Error(
          "Please enter a clear amendment reason of at least 5 characters.",
        );
      }
      return amendPurchaseOrder(
        poId,
        workspace.data.purchaseOrder.rowVersion,
        amendReason.trim(),
      );
    },
    onSuccess: (data) => {
      toast.success(
        `Amendment revision R${data?.revisionNumber ?? ""} created.`,
      );
      setAmendDialogOpen(false);
      setAmendReason("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !workspace.data) {
        throw new Error("Workspace not ready");
      }
      if (!cancelReason.trim() || cancelReason.trim().length < 5) {
        throw new Error(
          "Please enter a cancellation reason of at least 5 characters.",
        );
      }
      return cancelPurchaseOrder(
        poId,
        workspace.data.purchaseOrder.rowVersion,
        cancelReason.trim(),
      );
    },
    onSuccess: () => {
      toast.success("Purchase Order cancelled.");
      setCancelDialogOpen(false);
      setCancelReason("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const inspectMutation = useMutation({
    mutationFn: async () => {
      if (!inspectModalGrn) {
        throw new Error("Goods receipt not selected");
      }
      const lines = inspectModalGrn.lines.map((l) => {
        const itemState = inspectionQtys[l.id] ?? {
          accepted: l.deliveredQuantity,
          rejected: "0",
          reason: "",
        };
        return {
          goodsReceiptLineId: l.id,
          acceptedQuantity: itemState.accepted,
          rejectedQuantity: itemState.rejected,
          rejectionReason: itemState.reason.trim() || undefined,
        };
      });
      return inspectGoodsReceipt(
        inspectModalGrn.id,
        inspectModalGrn.rowVersion,
        lines,
      );
    },
    onSuccess: () => {
      toast.success("Goods receipt inspection saved.");
      setInspectModalGrn(null);
      setInspectionQtys({});
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const shortCloseMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !workspace.data) throw new Error("Workspace not ready");
      return shortClosePurchaseOrder(
        poId,
        workspace.data.purchaseOrder.rowVersion,
        shortCloseReason.trim(),
      );
    },
    onSuccess: () => {
      toast.success("Purchase Order short-closed.");
      setShortCloseOpen(false);
      setShortCloseReason("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const dispatchVendorMutation = useMutation({
    mutationFn: async () => {
      if (!poId) throw new Error("PO missing");
      return dispatchPurchaseOrderToVendor(poId, {
        channel: dispatchChannel,
        recipientName: dispatchRecipientName.trim(),
        recipientContact: dispatchRecipientContact.trim(),
        customMessage: dispatchCustomMessage.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      if (res.manualWhatsAppUrl) {
        window.open(res.manualWhatsAppUrl, "_blank", "noopener,noreferrer");
      }
      toast.success(
        res.fallbackToManual
          ? "MSG91 unavailable — opened WhatsApp Web fallback and logged dispatch."
          : res.dispatch.status === "manual_opened"
            ? "Opened WhatsApp Web and logged vendor dispatch."
            : "Purchase Order sent to vendor.",
      );
      setDispatchSheetOpen(false);
      setDispatchCustomMessage("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const createRtvMutation = useMutation({
    mutationFn: async () => {
      if (!poId || !rtvCreateGrn) throw new Error("GRN not selected");
      const rtvLines = rtvCreateGrn.lines
        .map((l) => {
          const entry = rtvLineQtys[l.id];
          const qty = Number(entry?.qty ?? 0);
          if (qty <= 0) return null;
          return {
            goodsReceiptLineId: l.id,
            returnQuantity: qty.toFixed(4),
            remarks: entry?.remarks.trim() || undefined,
          };
        })
        .filter(
          (x): x is { goodsReceiptLineId: string; returnQuantity: string; remarks: string | undefined } =>
            Boolean(x),
        );
      if (rtvLines.length === 0) {
        throw new Error("Enter at least one positive return quantity.");
      }
      return createSupplierReturn({
        purchaseOrderId: poId,
        goodsReceiptId: rtvCreateGrn.id,
        resolutionType: rtvResolutionType,
        reason: rtvReason.trim(),
        lines: rtvLines,
      });
    },
    onSuccess: (rtv) => {
      toast.success(`Supplier Return ${rtv.rtvNumber} drafted.`);
      setRtvCreateGrn(null);
      setRtvReason("");
      setRtvLineQtys({});
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const dispatchRtvMutation = useMutation({
    mutationFn: async () => {
      if (!rtvDispatchTarget) throw new Error("RTV not selected");
      return dispatchSupplierReturn(rtvDispatchTarget.id, {
        expectedVersion: rtvDispatchTarget.rowVersion,
        transporterName: rtvCarrier.trim() || undefined,
        vehicleNumber: rtvVehicle.trim() || undefined,
        dispatchDate: rtvDispatchDate,
      });
    },
    onSuccess: (rtv) => {
      toast.success(`RTV ${rtv.rtvNumber} dispatched & Challan PDF ready.`);
      setRtvDispatchTarget(null);
      setRtvCarrier("");
      setRtvVehicle("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const replacementRtvMutation = useMutation({
    mutationFn: async () => {
      if (!rtvReplacementTarget) throw new Error("RTV not selected");
      const repLines = rtvReplacementTarget.lines
        .map((l) => {
          const qty = Number(rtvReplacementQtys[l.id] ?? 0);
          if (qty <= 0) return null;
          return {
            supplierReturnLineId: l.id,
            receivedQuantity: qty.toFixed(4),
          };
        })
        .filter(
          (x): x is { supplierReturnLineId: string; receivedQuantity: string } =>
            Boolean(x),
        );
      if (repLines.length === 0) {
        throw new Error("Enter at least one replacement quantity received.");
      }
      return recordSupplierReturnReplacement(rtvReplacementTarget.id, {
        expectedVersion: rtvReplacementTarget.rowVersion,
        lines: repLines,
      });
    },
    onSuccess: () => {
      toast.success("Vendor replacement receipt recorded.");
      setRtvReplacementTarget(null);
      setRtvReplacementQtys({});
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const settleCreditRtvMutation = useMutation({
    mutationFn: async () => {
      if (!rtvCreditTarget) throw new Error("RTV not selected");
      return settleSupplierReturnCredit(rtvCreditTarget.id, {
        expectedVersion: rtvCreditTarget.rowVersion,
        creditNoteReference: rtvCreditRef.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Credit note / deduction settlement recorded.");
      setRtvCreditTarget(null);
      setRtvCreditRef("");
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  if (workspace.isPending) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }

  if (workspace.isError || !workspace.data) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost">
          <Link to="/procurement/purchase-orders">
            <ArrowLeft className="mr-2 size-4" /> Back to Purchase Orders
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Purchase Order unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              workspace.error,
              "The requested PO is not available.",
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const {
    purchaseOrder,
    currentRevision,
    revisions,
    lines,
    goodsReceipts,
    vendorContact,
    dispatches,
    supplierReturns,
    capabilities,
  } = workspace.data;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 px-2"
            >
              <Link to="/procurement/purchase-orders">
                <ArrowLeft className="mr-1.5 size-4" /> Purchase Orders
              </Link>
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono text-sm font-semibold">
              {purchaseOrder.poNumber}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {purchaseOrder.title}
            </h1>
            <StatusBadge status={purchaseOrder.status} />
            <Badge variant="outline" className="font-mono">
              Rev R{currentRevision.revisionNumber}
            </Badge>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {capabilities.canSubmit && (
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="gap-2"
            >
              <Send className="size-4" />
              {submitMutation.isPending ? "Submitting…" : "Submit for Approval"}
            </Button>
          )}

          {capabilities.canApprove && (
            <Button
              onClick={() => setApproveDialogOpen(true)}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="size-4" /> Approve PO
            </Button>
          )}

          {capabilities.canIssue && (
            <Button
              onClick={() => issueMutation.mutate()}
              disabled={issueMutation.isPending}
              className="gap-2 bg-purple-600 text-white hover:bg-purple-700"
            >
              <FileCheck2 className="size-4" />
              {issueMutation.isPending ? "Issuing PDF…" : "Issue PO"}
            </Button>
          )}

          {currentRevision.issuedPdfStorageId && (
            <Button asChild variant="outline" className="gap-2">
              <a
                href={poPdfUrl(purchaseOrder.id)}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="size-4" /> Download PDF
              </a>
            </Button>
          )}

          {capabilities.canDispatchVendor && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setDispatchRecipientName(
                  vendorContact?.name || purchaseOrder.vendorName,
                );
                const preferredChannel = vendorContact?.email
                  ? "email"
                  : "whatsapp_msg91";
                setDispatchChannel(preferredChannel);
                setDispatchRecipientContact(
                  preferredChannel === "email"
                    ? vendorContact?.email ?? ""
                    : vendorContact?.phone ?? "",
                );
                setDispatchSheetOpen(true);
              }}
            >
              <Mail className="size-4" /> Send to Vendor
            </Button>
          )}

          {capabilities.canReceive && (
            <Button
              onClick={() => setReceiptSheetOpen(true)}
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Truck className="size-4" /> Record Delivery (GRN)
            </Button>
          )}

          {capabilities.canShortClose && (
            <Button
              onClick={() => setShortCloseOpen(true)}
              variant="outline"
              className="gap-2 border-amber-600/40 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
            >
              <Ban className="size-4" /> Short-Close PO
            </Button>
          )}

          {capabilities.canAmend && (
            <Button
              onClick={() => setAmendDialogOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <FileEdit className="size-4" /> Amend PO
            </Button>
          )}

          {capabilities.canCancel && (
            <Button
              onClick={() => setCancelDialogOpen(true)}
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
            >
              <XCircle className="size-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">
              Vendor / Supplier
            </CardDescription>
            <CardTitle className="text-base font-semibold">
              {purchaseOrder.vendorName}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Code: {purchaseOrder.vendorCode}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Project</CardDescription>
            <CardTitle className="text-base font-semibold">
              {purchaseOrder.projectTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Project #: {purchaseOrder.projectNumber}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">
              Delivery Location
            </CardDescription>
            <CardTitle className="text-sm font-semibold truncate">
              {purchaseOrder.deliveryLocation}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Due: {purchaseOrder.deliveryDueDate || "Standard delivery"}
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium text-primary">
              Grand Total ({purchaseOrder.currency})
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-primary">
              {purchaseOrder.currency} {formatInr(purchaseOrder.grandTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Subtotal: {formatInr(purchaseOrder.subtotal)} + GST:{" "}
            {formatInr(purchaseOrder.taxAmount)}
          </CardContent>
        </Card>
      </div>

      {purchaseOrder.status === "short_closed" && purchaseOrder.shortCloseReason && (
        <Alert>
          <Ban className="size-4" />
          <AlertTitle>Purchase Order Short-Closed</AlertTitle>
          <AlertDescription>
            Remaining unreceived balance was formally closed out:{" "}
            <strong>{purchaseOrder.shortCloseReason}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Workspace Tabs */}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid sm:grid-cols-5">
          <TabsTrigger value="items" className="gap-2">
            <PackageCheck className="size-4" /> Line Items ({lines.length})
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2">
            <Truck className="size-4" /> GRNs ({goodsReceipts.length})
          </TabsTrigger>
          <TabsTrigger value="dispatches" className="gap-2">
            <Send className="size-4" /> Dispatches ({dispatches.length})
          </TabsTrigger>
          <TabsTrigger value="returns" className="gap-2">
            <RotateCcw className="size-4" /> Returns / RTV ({supplierReturns.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="size-4" /> Revisions ({revisions.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Line Items & Fulfillment */}
        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Item & Description</TableHead>
                    <TableHead>Brand / Make</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Unit Rate</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-48">Fulfillment Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const ordered = Number(line.quantity) || 0;
                    const accepted = Number(line.acceptedQuantity) || 0;
                    const received = Number(line.receivedQuantity) || 0;
                    const rejected = Number(line.rejectedQuantity) || 0;
                    const pct =
                      ordered > 0
                        ? Math.min(100, Math.round((accepted / ordered) * 100))
                        : 0;

                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {line.lineNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-sm">
                            {line.itemName}
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {line.specification}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            Code: {line.itemCode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="font-normal text-xs"
                          >
                            {line.brandOffered}
                          </Badge>
                          {line.model && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {line.model}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatInr(line.quantity)}{" "}
                          <span className="text-xs text-muted-foreground">
                            {line.unitSymbol}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatInr(line.unitRate)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {line.taxPercent}%
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatInr(line.lineTotal)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">
                                {pct}% Accepted
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {accepted} / {ordered} {line.unitSymbol}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {(received > accepted ||
                              rejected > 0 ||
                              Number(line.shortClosedQuantity) > 0) && (
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                {received > accepted && (
                                  <span>Recd: {received}</span>
                                )}
                                {rejected > 0 && (
                                  <span className="text-destructive font-medium">
                                    Rej: {rejected}
                                  </span>
                                )}
                                {Number(line.shortClosedQuantity) > 0 && (
                                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                                    Short-closed: {line.shortClosedQuantity}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Terms & Conditions Box */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">
                Commercial Terms & Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2 text-xs">
              <div>
                <strong>Payment Terms:</strong> {purchaseOrder.paymentTerms}
              </div>
              <div>
                <strong>Delivery Terms:</strong> {purchaseOrder.deliveryTerms}
              </div>
              {purchaseOrder.notes && (
                <div>
                  <strong>Special Instructions:</strong> {purchaseOrder.notes}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Goods Receipts & Inspection */}
        <TabsContent value="receipts" className="space-y-4">
          {goodsReceipts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-muted">
                  <Truck className="size-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  No Goods Receipts Recorded
                </h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Shipments delivered by {purchaseOrder.vendorName} against this
                  purchase order will appear here once recorded.
                </p>
                {capabilities.canReceive && (
                  <Button
                    onClick={() => setReceiptSheetOpen(true)}
                    className="mt-4 gap-2"
                    size="sm"
                  >
                    <Truck className="size-4" /> Record First Delivery
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {goodsReceipts.map((grn) => (
                <Card key={grn.id}>
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold font-mono">
                          {grn.grnNumber}
                        </CardTitle>
                        <Badge
                          variant={
                            grn.status === "accepted"
                              ? "default"
                              : grn.status === "partially_rejected"
                                ? "destructive"
                                : "outline"
                          }
                          className="capitalize text-xs"
                        >
                          {grn.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        Challan: <strong>{grn.vendorChallanNumber}</strong> ·
                        Date: {grn.vendorChallanDate} · Received by:{" "}
                        {grn.receivedByName}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      {grn.status === "draft" && capabilities.canInspect && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInspectModalGrn(grn);
                            const initial: Record<
                              string,
                              {
                                accepted: string;
                                rejected: string;
                                reason: string;
                              }
                            > = {};
                            grn.lines.forEach((l) => {
                              initial[l.id] = {
                                accepted: l.deliveredQuantity,
                                rejected: "0",
                                reason: "",
                              };
                            });
                            setInspectionQtys(initial);
                          }}
                          className="gap-1.5"
                        >
                          <ShieldCheck className="size-4 text-primary" /> Inspect
                          Shipment
                        </Button>
                      )}
                      {capabilities.canCreateRtv &&
                        grn.lines.some((l) => Number(l.rejectedQuantity) > 0) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => {
                              const defaults: Record<
                                string,
                                { qty: string; remarks: string }
                              > = {};
                              grn.lines.forEach((l) => {
                                if (Number(l.rejectedQuantity) > 0) {
                                  defaults[l.id] = {
                                    qty: l.rejectedQuantity,
                                    remarks: l.rejectionReason ?? "",
                                  };
                                }
                              });
                              setRtvLineQtys(defaults);
                              setRtvResolutionType("replacement");
                              setRtvReason("");
                              setRtvCreateGrn(grn);
                            }}
                          >
                            <RotateCcw className="size-4 text-destructive" />{" "}
                            Return Rejected (RTV)
                          </Button>
                        )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          <TableHead>PO Line Item</TableHead>
                          <TableHead className="text-right">
                            Delivered
                          </TableHead>
                          <TableHead className="text-right">Accepted</TableHead>
                          <TableHead className="text-right">Rejected</TableHead>
                          <TableHead>Notes & Exceptions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grn.lines.map((l) => {
                          const poLine = lines.find(
                            (pl) => pl.id === l.purchaseOrderLineId,
                          );
                          return (
                            <TableRow key={l.id}>
                              <TableCell className="text-center font-mono text-xs">
                                {l.lineNumber}
                              </TableCell>
                              <TableCell>
                                <span className="font-semibold text-xs">
                                  {poLine?.itemName || "Item"}
                                </span>
                                {poLine?.brandOffered && (
                                  <span className="text-[11px] text-muted-foreground ml-2">
                                    ({poLine.brandOffered})
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <div>{l.deliveredQuantity}</div>
                                {Number(l.excessQuantity) > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="mt-0.5 text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  >
                                    +{l.excessQuantity} Excess
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-emerald-600 font-semibold">
                                {l.acceptedQuantity}
                              </TableCell>
                              <TableCell className="text-right text-destructive font-semibold">
                                {l.rejectedQuantity}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground space-y-1">
                                {l.rejectionReason && (
                                  <div>Rejection: {l.rejectionReason}</div>
                                )}
                                {l.excessApprovalReason && (
                                  <div className="text-amber-700 dark:text-amber-300">
                                    Overdelivery: {l.excessApprovalReason}
                                  </div>
                                )}
                                {!l.rejectionReason &&
                                  !l.excessApprovalReason &&
                                  "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Vendor Dispatches */}
        <TabsContent value="dispatches" className="space-y-4">
          {dispatches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Send className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">No vendor dispatches logged yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Dispatch the issued PO PDF directly to the vendor via Email or WhatsApp to maintain a complete delivery audit trail.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Timestamp / Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatches.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {d.channel === "email"
                              ? "Email (PDF)"
                              : d.channel === "whatsapp_msg91"
                                ? "WhatsApp (MSG91)"
                                : "WhatsApp (Manual)"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-xs">{d.recipientName}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {d.recipientContact}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              d.status === "failed"
                                ? "destructive"
                                : d.status === "sent"
                                  ? "default"
                                  : "outline"
                            }
                          >
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{d.sentByName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>
                            {new Date(d.sentAt || d.createdAt).toLocaleString()}
                          </div>
                          {d.errorMessage && (
                            <div className="text-destructive">{d.errorMessage}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 4: Supplier Returns (RTV) */}
        <TabsContent value="returns" className="space-y-4">
          {supplierReturns.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <RotateCcw className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">No supplier returns (RTV) recorded</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Rejected quantities on a Goods Receipt can be returned via RTV for replacement or credit note settlement.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {supplierReturns.map((rtv) => (
                <Card key={rtv.id}>
                  <CardHeader className="p-4 pb-2 flex flex-row flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base font-mono">
                          {rtv.rtvNumber}
                        </CardTitle>
                        <Badge variant="outline">{rtv.status}</Badge>
                        <Badge variant="secondary">{rtv.resolutionType}</Badge>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        GRN: <strong>{rtv.grnNumber}</strong> · Reason: {rtv.reason}
                        {rtv.creditNoteReference && (
                          <> · Credit Note: <strong>{rtv.creditNoteReference}</strong></>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {rtv.hasPdf && (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={supplierReturnPdfUrl(rtv.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download className="size-3.5 mr-1.5" /> Challan PDF
                          </a>
                        </Button>
                      )}
                      {rtv.status === "draft" && capabilities.canCreateRtv && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setRtvCarrier("");
                            setRtvVehicle("");
                            setRtvDispatchDate(new Date().toISOString().slice(0, 10));
                            setRtvDispatchTarget(rtv);
                          }}
                        >
                          <Truck className="size-3.5 mr-1.5" /> Dispatch RTV
                        </Button>
                      )}
                      {rtv.status === "dispatched" &&
                        rtv.resolutionType === "replacement" &&
                        capabilities.canCreateRtv && (
                          <Button
                            size="sm"
                            onClick={() => {
                              const defaults: Record<string, string> = {};
                              rtv.lines.forEach((l) => {
                                const rem = Math.max(
                                  0,
                                  Number(l.returnQuantity) -
                                    Number(l.replacementReceivedQuantity),
                                );
                                defaults[l.id] = rem > 0 ? String(rem) : "0";
                              });
                              setRtvReplacementQtys(defaults);
                              setRtvReplacementTarget(rtv);
                            }}
                          >
                            <PackageCheck className="size-3.5 mr-1.5" /> Record Replacement
                          </Button>
                        )}
                      {rtv.status === "dispatched" &&
                        (rtv.resolutionType === "credit_note" ||
                          rtv.resolutionType === "deduction") &&
                        capabilities.canCreateRtv && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setRtvCreditRef("");
                              setRtvCreditTarget(rtv);
                            }}
                          >
                            <CheckCircle2 className="size-3.5 mr-1.5" /> Settle Credit
                          </Button>
                        )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Brand / Make</TableHead>
                          <TableHead className="text-right">Return Qty</TableHead>
                          <TableHead className="text-right">Replacement Recd</TableHead>
                          <TableHead>Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rtv.lines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="text-xs font-medium">
                              {l.itemName}
                              <span className="ml-1.5 font-mono text-muted-foreground">
                                ({l.itemCode})
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">{l.brandOffered}</TableCell>
                            <TableCell className="text-right text-xs font-semibold">
                              {l.returnQuantity} {l.unitSymbol}
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold text-emerald-600">
                              {l.replacementReceivedQuantity} {l.unitSymbol}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {l.remarks || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 5: Revision History */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">
                Document Revisions Timeline
              </CardTitle>
              <CardDescription className="text-xs">
                Immutable audit history of all amendments and approval
                decisions.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="divide-y">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="py-4 first:pt-2 last:pb-0 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          Revision R{rev.revisionNumber}
                        </Badge>
                        <Badge
                          variant={
                            rev.status === "issued" ? "default" : "secondary"
                          }
                          className="capitalize text-xs"
                        >
                          {rev.status}
                        </Badge>
                        {rev.revisionNumber ===
                          currentRevision.revisionNumber && (
                          <span className="text-xs text-primary font-medium">
                            (Current)
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-sm font-semibold">
                        {purchaseOrder.currency} {formatInr(rev.grandTotal)}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
                      <span>Prepared by: {rev.preparedByName}</span>
                      {rev.submittedAt && (
                        <span>
                          Submitted:{" "}
                          {new Date(rev.submittedAt).toLocaleString()}
                        </span>
                      )}
                      {rev.approvedAt && (
                        <span className="text-emerald-600">
                          Approved: {new Date(rev.approvedAt).toLocaleString()}
                        </span>
                      )}
                      {rev.issuedAt && (
                        <span className="text-purple-600 font-medium">
                          Issued: {new Date(rev.issuedAt).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {rev.changeReason && (
                      <div className="rounded bg-muted/40 p-2 text-xs">
                        <strong>Amendment Reason:</strong> {rev.changeReason}
                      </div>
                    )}

                    {rev.approvalNotes && (
                      <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 p-2 text-xs text-emerald-800 dark:text-emerald-300">
                        <strong>Approval Notes:</strong> {rev.approvalNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Goods Receipt Sheet */}
      <GoodsReceiptSheet
        open={receiptSheetOpen}
        onOpenChange={setReceiptSheetOpen}
        purchaseOrder={purchaseOrder}
        lines={lines}
        canApproveOverdelivery={capabilities.canApproveOverdelivery}
      />

      {/* Approval Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Purchase Order</DialogTitle>
            <DialogDescription>
              Authorize revision R{currentRevision.revisionNumber} of{" "}
              {purchaseOrder.poNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="appNotes">
              Approval Notes / Audit Remarks (Optional)
            </Label>
            <Textarea
              id="appNotes"
              placeholder="e.g. Terms negotiated and approved for immediate procurement"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {approveMutation.isPending ? "Approving…" : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amendment Dialog */}
      <Dialog open={amendDialogOpen} onOpenChange={setAmendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Purchase Order Amendment</DialogTitle>
            <DialogDescription>
              Spawns Revision R{purchaseOrder.currentRevisionNumber + 1} with an
              immutable audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="amendR">
              Reason for Amendment <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="amendR"
              placeholder="e.g. Quantity adjusted as per site engineering change order #12"
              value={amendReason}
              onChange={(e) => setAmendReason(e.target.value)}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAmendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => amendMutation.mutate()}
              disabled={amendMutation.isPending}
            >
              {amendMutation.isPending ? "Creating…" : "Create Amendment Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Purchase Order</DialogTitle>
            <DialogDescription>
              Cancelling is permitted only when no accepted deliveries exist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="cancR">
              Cancellation Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancR"
              placeholder="e.g. Project scope revised; material no longer required"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending
                ? "Cancelling…"
                : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspection Modal */}
      {inspectModalGrn && (
        <Dialog
          open={Boolean(inspectModalGrn)}
          onOpenChange={() => setInspectModalGrn(null)}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Shipment Inspection: {inspectModalGrn.grnNumber}
              </DialogTitle>
              <DialogDescription>
                Challan {inspectModalGrn.vendorChallanNumber} · Verify accepted
                vs. rejected quantities.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              {inspectModalGrn.lines.map((l) => {
                const poLine = lines.find(
                  (pl) => pl.id === l.purchaseOrderLineId,
                );
                const current = inspectionQtys[l.id] ?? {
                  accepted: l.deliveredQuantity,
                  rejected: "0",
                  reason: "",
                };

                return (
                  <div key={l.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">{poLine?.itemName}</span>
                      <span className="text-muted-foreground">
                        Delivered: {l.deliveredQuantity}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Accepted Qty</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          value={current.accepted}
                          onChange={(e) =>
                            setInspectionQtys((prev) => ({
                              ...prev,
                              [l.id]: { ...current, accepted: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rejected Qty</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          value={current.rejected}
                          onChange={(e) =>
                            setInspectionQtys((prev) => ({
                              ...prev,
                              [l.id]: { ...current, rejected: e.target.value },
                            }))
                          }
                        />
                      </div>
                      {Number(current.rejected) > 0 && (
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-destructive">
                            Rejection Reason{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            placeholder="Reason for rejection"
                            value={current.reason}
                            onChange={(e) =>
                              setInspectionQtys((prev) => ({
                                ...prev,
                                [l.id]: { ...current, reason: e.target.value },
                              }))
                            }
                            required
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setInspectModalGrn(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => inspectMutation.mutate()}
                disabled={inspectMutation.isPending}
              >
                {inspectMutation.isPending ? "Saving…" : "Save Inspection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Short-Close PO Dialog */}
      <Dialog open={shortCloseOpen} onOpenChange={setShortCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Short-Close Purchase Order</DialogTitle>
            <DialogDescription>
              Close out remaining undelivered quantities on {purchaseOrder.poNumber}. Already accepted quantities remain intact and future GRNs will be blocked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="shortCloseR">
              Short-Close Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="shortCloseR"
              placeholder="e.g. Vendor unable to supply remaining stock; sourced balance elsewhere"
              value={shortCloseReason}
              onChange={(e) => setShortCloseReason(e.target.value)}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShortCloseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => shortCloseMutation.mutate()}
              disabled={
                shortCloseMutation.isPending ||
                shortCloseReason.trim().length < 3
              }
            >
              {shortCloseMutation.isPending
                ? "Short-Closing…"
                : "Confirm Short-Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send PO to Vendor Sheet */}
      <Sheet open={dispatchSheetOpen} onOpenChange={setDispatchSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Send PO to Vendor</SheetTitle>
            <SheetDescription>
              Dispatch {purchaseOrder.poNumber} (R{currentRevision.revisionNumber}) with recipient preview and full audit logging.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Delivery Channel</Label>
              <Select
                value={dispatchChannel}
                onValueChange={(val) => {
                  const nextChannel = val as
                    | "email"
                    | "whatsapp_msg91"
                    | "whatsapp_manual";
                  setDispatchChannel(nextChannel);
                  if (nextChannel === "email" && vendorContact?.email) {
                    setDispatchRecipientContact(vendorContact.email);
                  } else if (
                    nextChannel !== "email" &&
                    vendorContact?.phone
                  ) {
                    setDispatchRecipientContact(vendorContact.phone);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">
                    <span className="flex items-center gap-2">
                      <Mail className="size-3.5" /> Email with PO PDF Attachment
                    </span>
                  </SelectItem>
                  <SelectItem value="whatsapp_msg91">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="size-3.5" /> WhatsApp via MSG91 (Auto-Fallback)
                    </span>
                  </SelectItem>
                  <SelectItem value="whatsapp_manual">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="size-3.5" /> WhatsApp Web (Manual Open)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispName">Recipient Name</Label>
              <Input
                id="dispName"
                value={dispatchRecipientName}
                onChange={(e) => setDispatchRecipientName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispContact">
                {dispatchChannel === "email" ? "Email Address" : "WhatsApp Number"}
              </Label>
              <Input
                id="dispContact"
                placeholder={
                  dispatchChannel === "email"
                    ? "vendor@example.com"
                    : "+91 98XXXXXXXX"
                }
                value={dispatchRecipientContact}
                onChange={(e) => setDispatchRecipientContact(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispMsg">Custom Message Note (Optional)</Label>
              <Textarea
                id="dispMsg"
                rows={3}
                placeholder="Include delivery schedule reminders or dock instructions..."
                value={dispatchCustomMessage}
                onChange={(e) => setDispatchCustomMessage(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter className="border-t pt-4">
            <Button
              variant="ghost"
              onClick={() => setDispatchSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => dispatchVendorMutation.mutate()}
              disabled={
                dispatchVendorMutation.isPending ||
                !dispatchRecipientName.trim() ||
                !dispatchRecipientContact.trim()
              }
            >
              <Send className="size-4 mr-1.5" />
              {dispatchVendorMutation.isPending ? "Sending…" : "Send PO Now"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Create Supplier Return (RTV) Dialog */}
      {rtvCreateGrn && (
        <Dialog
          open={Boolean(rtvCreateGrn)}
          onOpenChange={(open) => {
            if (!open) setRtvCreateGrn(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Supplier Return (RTV)</DialogTitle>
              <DialogDescription>
                Return rejected material from {rtvCreateGrn.grnNumber} back to{" "}
                {purchaseOrder.vendorName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Resolution Type</Label>
                  <Select
                    value={rtvResolutionType}
                    onValueChange={(v) =>
                      setRtvResolutionType(
                        v as "replacement" | "credit_note" | "deduction",
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="replacement">Vendor Replacement</SelectItem>
                      <SelectItem value="credit_note">Credit Note</SelectItem>
                      <SelectItem value="deduction">Invoice Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rtvReason">
                    Return Reason <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="rtvReason"
                    placeholder="e.g. Damaged valves / wrong spec"
                    value={rtvReason}
                    onChange={(e) => setRtvReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                {rtvCreateGrn.lines
                  .filter((l) => Number(l.rejectedQuantity) > 0)
                  .map((l) => {
                    const poLine = lines.find(
                      (pl) => pl.id === l.purchaseOrderLineId,
                    );
                    const state = rtvLineQtys[l.id] ?? {
                      qty: l.rejectedQuantity,
                      remarks: "",
                    };
                    return (
                      <div key={l.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">
                            {poLine?.itemName ?? "Item"}
                          </span>
                          <span className="text-destructive font-mono">
                            Max Rejected: {l.rejectedQuantity}
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Return Qty</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              max={l.rejectedQuantity}
                              value={state.qty}
                              onChange={(e) =>
                                setRtvLineQtys((prev) => ({
                                  ...prev,
                                  [l.id]: { ...state, qty: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Line Remarks</Label>
                            <Input
                              value={state.remarks}
                              onChange={(e) =>
                                setRtvLineQtys((prev) => ({
                                  ...prev,
                                  [l.id]: { ...state, remarks: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRtvCreateGrn(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => createRtvMutation.mutate()}
                disabled={
                  createRtvMutation.isPending || rtvReason.trim().length < 3
                }
              >
                {createRtvMutation.isPending ? "Creating…" : "Create RTV Draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dispatch RTV Dialog */}
      {rtvDispatchTarget && (
        <Dialog
          open={Boolean(rtvDispatchTarget)}
          onOpenChange={(open) => {
            if (!open) setRtvDispatchTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Dispatch RTV {rtvDispatchTarget.rtvNumber}
              </DialogTitle>
              <DialogDescription>
                Generates the Return Challan PDF and marks the shipment in transit to the vendor.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Dispatch Date</Label>
                <Input
                  type="date"
                  value={rtvDispatchDate}
                  onChange={(e) => setRtvDispatchDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Transporter / Courier (Optional)</Label>
                <Input
                  value={rtvCarrier}
                  onChange={(e) => setRtvCarrier(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle Number (Optional)</Label>
                <Input
                  value={rtvVehicle}
                  onChange={(e) => setRtvVehicle(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setRtvDispatchTarget(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => dispatchRtvMutation.mutate()}
                disabled={dispatchRtvMutation.isPending || !rtvDispatchDate}
              >
                {dispatchRtvMutation.isPending
                  ? "Dispatching…"
                  : "Dispatch & Generate Challan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Record RTV Replacement Dialog */}
      {rtvReplacementTarget && (
        <Dialog
          open={Boolean(rtvReplacementTarget)}
          onOpenChange={(open) => {
            if (!open) setRtvReplacementTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Record Replacement: {rtvReplacementTarget.rtvNumber}
              </DialogTitle>
              <DialogDescription>
                Accept vendor replacement units against returned quantities.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 max-h-[55vh] overflow-y-auto">
              {rtvReplacementTarget.lines.map((l) => (
                <div key={l.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{l.itemName}</span>
                    <span className="text-muted-foreground">
                      Returned: {l.returnQuantity} · Recd:{" "}
                      {l.replacementReceivedQuantity}
                    </span>
                  </div>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={rtvReplacementQtys[l.id] ?? "0"}
                    onChange={(e) =>
                      setRtvReplacementQtys((prev) => ({
                        ...prev,
                        [l.id]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setRtvReplacementTarget(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => replacementRtvMutation.mutate()}
                disabled={replacementRtvMutation.isPending}
              >
                {replacementRtvMutation.isPending
                  ? "Saving…"
                  : "Confirm Replacement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Settle RTV Credit Note Dialog */}
      {rtvCreditTarget && (
        <Dialog
          open={Boolean(rtvCreditTarget)}
          onOpenChange={(open) => {
            if (!open) setRtvCreditTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Settle Credit / Deduction: {rtvCreditTarget.rtvNumber}
              </DialogTitle>
              <DialogDescription>
                Record the vendor credit note or invoice deduction reference to close this RTV.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="creditRef">
                Credit Note / Deduction Reference{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="creditRef"
                placeholder="e.g. CN-2026-0891"
                value={rtvCreditRef}
                onChange={(e) => setRtvCreditRef(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRtvCreditTarget(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => settleCreditRtvMutation.mutate()}
                disabled={
                  settleCreditRtvMutation.isPending ||
                  rtvCreditRef.trim().length < 2
                }
              >
                {settleCreditRtvMutation.isPending
                  ? "Settling…"
                  : "Confirm Settlement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
