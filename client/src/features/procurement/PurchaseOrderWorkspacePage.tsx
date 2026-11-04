import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileEdit,
  History,
  PackageCheck,
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
  inspectGoodsReceipt,
  issuePurchaseOrder,
  purchaseOrderWorkspaceQuery,
  submitPoRevision,
  type GoodsReceipt,
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
                href={`/api/v1/documents/${currentRevision.issuedPdfStorageId}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="size-4" /> Download PDF
              </a>
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

      {/* Workspace Tabs */}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
          <TabsTrigger value="items" className="gap-2">
            <PackageCheck className="size-4" /> Line Items & Fulfillment (
            {lines.length})
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2">
            <Truck className="size-4" /> Goods Receipts / GRN (
            {goodsReceipts.length})
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
                            {(received > accepted || rejected > 0) && (
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                {received > accepted && (
                                  <span>Recd: {received}</span>
                                )}
                                {rejected > 0 && (
                                  <span className="text-destructive font-medium">
                                    Rej: {rejected}
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
                          <TableHead>Rejection Notes</TableHead>
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
                                {l.deliveredQuantity}
                              </TableCell>
                              <TableCell className="text-right text-emerald-600 font-semibold">
                                {l.acceptedQuantity}
                              </TableCell>
                              <TableCell className="text-right text-destructive font-semibold">
                                {l.rejectedQuantity}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {l.rejectionReason || "—"}
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

        {/* Tab 3: Revision History */}
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
    </main>
  );
}
