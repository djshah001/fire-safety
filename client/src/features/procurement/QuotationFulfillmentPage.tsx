import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Loader2,
  PackageCheck,
  ShoppingCart,
  Warehouse as WarehouseIcon,
} from "lucide-react";

import { currentUserQuery } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  acceptedQuotationsQuery,
  createMir,
  createRequisitionFromFulfillmentPlan,
  fulfillmentPlanQuery,
  fulfillmentPlanQueryKeys,
  inventoryQueryKeys,
  warehousesQuery,
  type FulfillmentPlanLine,
} from "@/api/inventory";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EditableLineState = {
  storeIssueQty: string;
  projectAllocationQty: string;
  storeReplenishmentQty: string;
  destinationType: "warehouse" | "direct_to_site";
};

function fmtQty(value: string | number) {
  const n = Number(value);
  return Number.isNaN(n)
    ? String(value)
    : n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

export function QuotationFulfillmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user } = useQuery(currentUserQuery);

  const permissions = user?.permissions ?? [];
  const isAdmin = permissions.includes("system.access.all");
  const canReadPlan =
    isAdmin ||
    permissions.includes("procurement.sourcing.read") ||
    permissions.includes("procurement.requisition.create") ||
    permissions.includes("inventory.request.create");
  const canCreateMir = isAdmin || permissions.includes("inventory.request.create");
  const canCreateRequisition =
    isAdmin || permissions.includes("procurement.requisition.create");

  const [quotationRevisionId, setQuotationRevisionId] = useState(
    searchParams.get("quotationRevisionId") ?? "",
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    searchParams.get("warehouseId") ?? "",
  );
  const [edits, setEdits] = useState<Record<string, EditableLineState>>({});

  const acceptedQuery = useQuery(acceptedQuotationsQuery(canReadPlan));
  const warehouses = useQuery(warehousesQuery(false));

  // Default first active central warehouse once loaded
  useEffect(() => {
    if (!selectedWarehouseId && warehouses.data && warehouses.data.length > 0) {
      const central =
        warehouses.data.find((w) => w.warehouseType === "central_warehouse") ??
        warehouses.data[0];
      if (central) {
        setSelectedWarehouseId(central.id);
      }
    }
  }, [selectedWarehouseId, warehouses.data]);

  const planQuery = useQuery(
    fulfillmentPlanQuery(
      canReadPlan ? quotationRevisionId || undefined : undefined,
      canReadPlan ? selectedWarehouseId || undefined : undefined,
    ),
  );

  // Initialize editable quantities whenever plan data loads or refreshes
  useEffect(() => {
    if (!planQuery.data) return;
    const next: Record<string, EditableLineState> = {};
    for (const line of planQuery.data.lines) {
      next[line.quotationLineId] = {
        storeIssueQty: line.suggestedStoreIssueQty,
        projectAllocationQty: line.projectShortageQty,
        storeReplenishmentQty: line.suggestedStoreReplenishmentQty,
        destinationType: "warehouse",
      };
    }
    setEdits(next);
  }, [planQuery.data]);

  const progressStats = useMemo(() => {
    const lines = planQuery.data?.lines ?? [];
    let quoted = 0;
    let verified = 0;
    let inTransit = 0;
    let reservedOnly = 0;
    for (const l of lines) {
      const q = Number(l.quotedQty);
      const req = Number(l.alreadyRequestedFromStoreQty);
      const disp = Number(l.alreadyDispatchedQty);
      const ver = Number(l.alreadyVerifiedAtSiteQty);
      const clampedVer = Math.min(q, ver);
      const clampedTransit = Math.max(0, Math.min(q - clampedVer, disp - ver));
      const clampedReserved = Math.max(
        0,
        Math.min(q - clampedVer - clampedTransit, req - disp),
      );
      quoted += q;
      verified += clampedVer;
      inTransit += clampedTransit;
      reservedOnly += clampedReserved;
    }
    const pending = Math.max(0, quoted - verified - inTransit - reservedOnly);
    const pct = (v: number) => (quoted > 0 ? Math.round((v / quoted) * 1000) / 10 : 0);
    return {
      quoted,
      verified,
      inTransit,
      reservedOnly,
      pending,
      verifiedPct: pct(verified),
      inTransitPct: pct(inTransit),
      reservedPct: pct(reservedOnly),
      pendingPct: Math.max(
        0,
        100 - pct(verified) - pct(inTransit) - pct(reservedOnly),
      ),
    };
  }, [planQuery.data]);

  const createMirMutation = useMutation({
    mutationFn: () => {
      const plan = planQuery.data!;
      const linesToIssue = plan.lines
        .map((line) => ({
          line,
          qty: Number(edits[line.quotationLineId]?.storeIssueQty ?? "0"),
          qtyStr: edits[line.quotationLineId]?.storeIssueQty ?? "0",
        }))
        .filter((entry) => entry.qty > 0);

      if (linesToIssue.length === 0) {
        throw new Error("Enter a positive Store Issue quantity for at least one line.");
      }

      return createMir({
        quotationRevisionId: plan.quotationRevisionId,
        projectId: plan.projectId,
        warehouseId: plan.warehouseId,
        notes: `Fulfillment MIR for ${plan.quotationNumber}`,
        lines: linesToIssue.map(({ line, qtyStr }) => ({
          quotationLineId: line.quotationLineId,
          itemId: line.itemId,
          brandOfferingId: line.brandOfferingId,
          unitId: line.unitId,
          requestedQty: qtyStr,
        })),
      });
    },
    onSuccess: (mir) => {
      toast.success(`Material Issue Request ${mir.mirNumber} submitted to Store!`);
      queryClient.invalidateQueries({
        queryKey: fulfillmentPlanQueryKeys.plan(quotationRevisionId, selectedWarehouseId),
      });
      queryClient.invalidateQueries({
        queryKey: inventoryQueryKeys.materialIssueRequests(),
      });
      queryClient.invalidateQueries({
        queryKey: inventoryQueryKeys.balances(),
      });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Failed to submit Material Issue Request."));
    },
  });

  const createReqMutation = useMutation({
    mutationFn: () => {
      const plan = planQuery.data!;
      const reqLines = plan.lines
        .map((line) => {
          const e = edits[line.quotationLineId];
          const proj = Number(e?.projectAllocationQty ?? "0");
          const store = Number(e?.storeReplenishmentQty ?? "0");
          if (proj + store <= 0) return null;
          return {
            quotationLineId: line.quotationLineId,
            projectAllocationQty: Number(e?.projectAllocationQty ?? "0").toFixed(4),
            storeReplenishmentQty: Number(e?.storeReplenishmentQty ?? "0").toFixed(4),
            destinationType: e?.destinationType ?? "warehouse",
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (reqLines.length === 0) {
        throw new Error(
          "Enter a positive Project Shortage or Store Replenishment quantity for at least one line.",
        );
      }

      return createRequisitionFromFulfillmentPlan({
        quotationRevisionId: plan.quotationRevisionId,
        projectId: plan.projectId,
        lines: reqLines,
      });
    },
    onSuccess: (res) => {
      toast.success(`Requisition ${res.requisitionNumber} created for Shortage + Max Stock!`);
      queryClient.invalidateQueries({
        queryKey: fulfillmentPlanQueryKeys.plan(quotationRevisionId, selectedWarehouseId),
      });
      queryClient.invalidateQueries({ queryKey: ["procurement", "requisitions"] });
      navigate(`/procurement/requisitions/${res.requisitionId}`);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Failed to create fulfillment requisition."));
    },
  });

  const updateLineEdit = (
    line: FulfillmentPlanLine,
    patch: Partial<EditableLineState>,
  ) => {
    setEdits((prev) => ({
      ...prev,
      [line.quotationLineId]: {
        storeIssueQty: prev[line.quotationLineId]?.storeIssueQty ?? line.suggestedStoreIssueQty,
        projectAllocationQty:
          prev[line.quotationLineId]?.projectAllocationQty ?? line.projectShortageQty,
        storeReplenishmentQty:
          prev[line.quotationLineId]?.storeReplenishmentQty ??
          line.suggestedStoreReplenishmentQty,
        destinationType: prev[line.quotationLineId]?.destinationType ?? "warehouse",
        ...patch,
      },
    }));
  };

  if (!canReadPlan) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            Quotation fulfillment planning requires Purchase or Administrator permissions.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Procurement · Store & PO Alignment
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Quotation Fulfillment Planner
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare Accepted Quotation requirements side-by-side against brand-exact Store free
            stock, incoming open POs, and Min/Max replenishment targets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory">
              <Boxes className="h-4 w-4 mr-1.5" />
              Store Stock & MIR Queue
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/procurement/requisitions">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Requisitions
            </Link>
          </Button>
        </div>
      </div>

      {/* Selector Bar */}
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Accepted Quotation Revision *</Label>
            <Select
              value={quotationRevisionId}
              onValueChange={(value) => {
                setQuotationRevisionId(value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("quotationRevisionId", value);
                  return next;
                }, { replace: true });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an accepted quotation & started project..." />
              </SelectTrigger>
              <SelectContent>
                {(acceptedQuery.data ?? []).length === 0 ? (
                  <SelectItem value="none" disabled>
                    No accepted quotations with started projects found
                  </SelectItem>
                ) : (
                  (acceptedQuery.data ?? []).map((q) => (
                    <SelectItem key={q.quotationRevisionId} value={q.quotationRevisionId}>
                      {q.quotationNumber} R{q.revisionNumber} · {q.projectNumber} ({q.projectTitle})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Source Warehouse *</Label>
            <Select
              value={selectedWarehouseId}
              onValueChange={(value) => {
                setSelectedWarehouseId(value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("warehouseId", value);
                  return next;
                }, { replace: true });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select store warehouse..." />
              </SelectTrigger>
              <SelectContent>
                {(warehouses.data ?? []).map((wh) => (
                  <SelectItem key={wh.id} value={wh.id}>
                    <WarehouseIcon className="h-3.5 w-3.5 inline mr-1.5" />
                    {wh.code} - {wh.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {planQuery.isError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load fulfillment plan</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(planQuery.error, "Check warehouse selection and quotation state.")}
          </AlertDescription>
        </Alert>
      )}

      {planQuery.isPending && quotationRevisionId && selectedWarehouseId && (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Computing brand-exact stock availability and Min/Max PO recommendations...
          </CardContent>
        </Card>
      )}

      {planQuery.data && (
        <>
          {/* Progress Tracker */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Project Fulfillment Tracker — {planQuery.data.projectNumber} ·{" "}
                    {planQuery.data.projectTitle}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Quotation {planQuery.data.quotationNumber} · Checking stock in{" "}
                    {planQuery.data.warehouseName}
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/projects/${planQuery.data.projectId}?tab=materials`}>
                    View Site POD Deliveries
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted flex">
                {progressStats.verifiedPct > 0 && (
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${progressStats.verifiedPct}%` }}
                    title={`Verified at Site: ${progressStats.verifiedPct}%`}
                  />
                )}
                {progressStats.inTransitPct > 0 && (
                  <div
                    className="bg-blue-500 transition-all"
                    style={{ width: `${progressStats.inTransitPct}%` }}
                    title={`Dispatched (In-Transit): ${progressStats.inTransitPct}%`}
                  />
                )}
                {progressStats.reservedPct > 0 && (
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${progressStats.reservedPct}%` }}
                    title={`Reserved in MIR: ${progressStats.reservedPct}%`}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-foreground/60" />
                  Quoted: <strong className="text-foreground font-mono">{fmtQty(progressStats.quoted)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-amber-500" />
                  Reserved: <strong className="text-foreground font-mono">{fmtQty(progressStats.reservedOnly)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-blue-500" />
                  Dispatched (In-Transit): <strong className="text-foreground font-mono">{fmtQty(progressStats.inTransit)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  Verified at Site: <strong className="text-foreground font-mono">{fmtQty(progressStats.verified)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-muted-foreground/40" />
                  Pending: <strong className="text-foreground font-mono">{fmtQty(progressStats.pending)}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Line-by-Line Matrix */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Item & Approved Make</TableHead>
                    <TableHead className="text-right">Quoted</TableHead>
                    <TableHead className="text-right">Free Store Stock</TableHead>
                    <TableHead className="text-right">Incoming Open PO</TableHead>
                    <TableHead className="text-right">Rem. Need</TableHead>
                    <TableHead className="min-w-[130px] text-right">Issue from Store (MIR)</TableHead>
                    <TableHead className="min-w-[130px] text-right">PO: Project Shortage</TableHead>
                    <TableHead className="min-w-[130px] text-right">PO: Store Max Replen.</TableHead>
                    <TableHead className="min-w-[130px]">Delivery Mode</TableHead>
                    <TableHead className="text-right">Total PO Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planQuery.data.lines.map((line) => {
                    const e = edits[line.quotationLineId];
                    const issueVal = e?.storeIssueQty ?? line.suggestedStoreIssueQty;
                    const projVal = e?.projectAllocationQty ?? line.projectShortageQty;
                    const replenVal =
                      e?.storeReplenishmentQty ?? line.suggestedStoreReplenishmentQty;
                    const dest = e?.destinationType ?? "warehouse";
                    const totalPo = Number(projVal) + Number(replenVal);
                    const isLowStock =
                      Number(line.minStock) > 0 &&
                      Number(line.freeAvailable) + Number(line.incomingStoreOpenPoQty) <
                        Number(line.minStock);

                    return (
                      <TableRow key={line.quotationLineId}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="font-mono text-xs font-semibold block">
                              {line.itemCode}
                            </span>
                            <span className="text-xs font-medium">{line.itemName}</span>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                {line.brandName ?? "Generic"}
                              </Badge>
                              {isLowStock && (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-[10px] gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  Below Min ({fmtQty(line.minStock)})
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <div>{fmtQty(line.quotedQty)} {line.unitSymbol}</div>
                          {Number(line.alreadyRequestedFromStoreQty) > 0 && (
                            <span className="text-[10px] text-muted-foreground block">
                              MIR: {fmtQty(line.alreadyRequestedFromStoreQty)}
                            </span>
                          )}
                          {Number(line.alreadyOrderedForProjectQty) > 0 && (
                            <span className="text-[10px] text-muted-foreground block">
                              PO: {fmtQty(line.alreadyOrderedForProjectQty)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400 block">
                            {fmtQty(line.freeAvailable)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            OH {fmtQty(line.warehouseOnHand)} / Res {fmtQty(line.warehouseReserved)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {fmtQty(line.incomingStoreOpenPoQty)}
                          {Number(line.maxStock) > 0 && (
                            <span className="block text-[10px]">
                              Max: {fmtQty(line.maxStock)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {fmtQty(line.remainingProjectNeed)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            max={line.freeAvailable}
                            step="0.0001"
                            className="h-8 text-right font-mono text-xs"
                            value={issueVal}
                            onChange={(ev) =>
                              updateLineEdit(line, { storeIssueQty: ev.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            className="h-8 text-right font-mono text-xs"
                            value={projVal}
                            onChange={(ev) =>
                              updateLineEdit(line, { projectAllocationQty: ev.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            className="h-8 text-right font-mono text-xs"
                            value={replenVal}
                            onChange={(ev) =>
                              updateLineEdit(line, { storeReplenishmentQty: ev.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={dest}
                            onValueChange={(v) =>
                              updateLineEdit(line, {
                                destinationType: v as "warehouse" | "direct_to_site",
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="warehouse">To Warehouse</SelectItem>
                              <SelectItem value="direct_to_site">Direct to Site</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold">
                          {fmtQty(totalPo)} {line.unitSymbol}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {canCreateMir && (
              <Button
                variant="outline"
                disabled={createMirMutation.isPending}
                onClick={() => createMirMutation.mutate()}
                className="gap-2"
              >
                {createMirMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="h-4 w-4 text-emerald-600" />
                )}
                Request Available from Store (MIR)
              </Button>
            )}
            {canCreateRequisition && (
              <Button
                disabled={createReqMutation.isPending}
                onClick={() => createReqMutation.mutate()}
                className="gap-2"
              >
                {createReqMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                Create Requisition / PO (Shortage + Max Stock)
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
