import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, PackageCheck, Truck } from 'lucide-react';
import { getApiErrorMessage } from '@/api/client';
import {
  createGoodsReceipt,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '@/api/purchaseOrders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GoodsReceiptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder;
  lines: PurchaseOrderLine[];
}

export function GoodsReceiptSheet({
  open,
  onOpenChange,
  purchaseOrder,
  lines,
}: GoodsReceiptSheetProps) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0]!;

  const [challanNumber, setChallanNumber] = useState('');
  const [challanDate, setChallanDate] = useState(today);
  const [deliveryLocation, setDeliveryLocation] = useState(
    purchaseOrder.deliveryLocation || '',
  );
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [notes, setNotes] = useState('');

  // Initial remaining balances
  const [deliveredQtys, setDeliveredQtys] = useState<Record<string, string>>({});
  const [inspectNow, setInspectNow] = useState(true);
  const [rejectedQtys, setRejectedQtys] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      if (!challanNumber.trim()) throw new Error('Vendor challan reference is required.');

      const receiptLines = lines
        .map((line) => {
          const rem = Math.max(
            0,
            Number(line.quantity) - Number(line.receivedQuantity),
          );
          const del = deliveredQtys[line.id] !== undefined ? deliveredQtys[line.id] : String(rem);
          const delNum = Number(del);
          if (delNum <= 0) return null;

          const rej = inspectNow && rejectedQtys[line.id] ? Number(rejectedQtys[line.id]) : 0;
          const acc = inspectNow ? Math.max(0, delNum - rej) : 0;

          if (rej > 0 && !rejectionReasons[line.id]?.trim()) {
            throw new Error(`Rejection reason is required for line "${line.itemName}" with rejected quantity.`);
          }

          return {
            purchaseOrderLineId: line.id,
            deliveredQuantity: delNum.toFixed(4),
            acceptedQuantity: inspectNow ? acc.toFixed(4) : undefined,
            rejectedQuantity: inspectNow && rej > 0 ? rej.toFixed(4) : undefined,
            rejectionReason: inspectNow && rej > 0 ? rejectionReasons[line.id] : undefined,
          };
        })
        .filter(Boolean);

      if (receiptLines.length === 0) {
        throw new Error('At least one item must have a positive delivered quantity.');
      }

      return createGoodsReceipt(purchaseOrder.id, {
        vendorChallanNumber: challanNumber.trim(),
        vendorChallanDate: challanDate,
        deliveryLocation: deliveryLocation.trim() || purchaseOrder.deliveryLocation,
        vehicleNumber: vehicleNumber.trim() || undefined,
        transporterName: transporterName.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: receiptLines as never,
      });
    },
    onSuccess: (data) => {
      toast.success(`Goods Receipt ${data.grnNumber} recorded successfully!`);
      queryClient.invalidateQueries({
        queryKey: ['procurement', 'purchase-orders', purchaseOrder.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['procurement', 'purchase-orders'],
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const resetForm = () => {
    setChallanNumber('');
    setChallanDate(today);
    setVehicleNumber('');
    setTransporterName('');
    setNotes('');
    setDeliveredQtys({});
    setRejectedQtys({});
    setRejectionReasons({});
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b p-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Truck className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-xl">Record Goods Receipt (GRN)</SheetTitle>
              <SheetDescription className="text-xs">
                PO: <strong>{purchaseOrder.poNumber}</strong> · Vendor: {purchaseOrder.vendorName}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Challan & Logistics Information */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="challanNo">
                Vendor Challan / Delivery Doc # <span className="text-destructive">*</span>
              </Label>
              <Input
                id="challanNo"
                placeholder="e.g. DC-2026-9042"
                value={challanNumber}
                onChange={(e) => setChallanNumber(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="challanDate">
                Challan Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="challanDate"
                type="date"
                value={challanDate}
                onChange={(e) => setChallanDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="delLoc">Delivery Site / Location</Label>
              <Input
                id="delLoc"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                placeholder="Site address or warehouse location"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vehicle">Vehicle Number</Label>
              <Input
                id="vehicle"
                placeholder="e.g. GJ-01-AB-1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transporter">Transporter Name</Label>
              <Input
                id="transporter"
                placeholder="e.g. VRL Logistics"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Remarks / Delivery Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional delivery notes or package seal numbers"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Inspect on Arrival toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Immediate Inspection on Arrival</Label>
              <p className="text-xs text-muted-foreground">
                Accept delivered quantities now, or record delivery first and inspect later.
              </p>
            </div>
            <Button
              type="button"
              variant={inspectNow ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInspectNow(!inspectNow)}
            >
              {inspectNow ? (
                <>
                  <Check className="mr-1.5 size-3.5" /> Inspecting Now
                </>
              ) : (
                'Receive Only'
              )}
            </Button>
          </div>

          {/* Line Items List */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Shipment Line Items</Label>
            <div className="space-y-3">
              {lines.map((line) => {
                const ordered = Number(line.quantity);
                const received = Number(line.receivedQuantity);
                const remaining = Math.max(0, ordered - received);
                const currentDel =
                  deliveredQtys[line.id] !== undefined
                    ? deliveredQtys[line.id]
                    : String(remaining);
                const currentRej = rejectedQtys[line.id] ?? '0';

                return (
                  <Card key={line.id} className="border shadow-2xs">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-semibold">
                            {line.lineNumber}. {line.itemName}
                          </CardTitle>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>Code: {line.itemCode}</span>
                            <span>·</span>
                            <Badge variant="outline" className="text-[10px]">
                              Make: {line.brandOffered}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <span className="font-semibold text-foreground">
                            {remaining} {line.unitSymbol}
                          </span>
                          <span className="text-muted-foreground"> remaining</span>
                          <div className="text-[11px] text-muted-foreground">
                            (Ordered: {ordered} · Recd: {received})
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Delivered Quantity ({line.unitSymbol})</Label>
                          <Input
                            type="number"
                            step="0.0001"
                            min="0"
                            max={remaining}
                            value={currentDel}
                            onChange={(e) =>
                              setDeliveredQtys((prev) => ({
                                ...prev,
                                [line.id]: e.target.value,
                              }))
                            }
                          />
                        </div>

                        {inspectNow && (
                          <div className="space-y-1">
                            <Label className="text-xs">Rejected Quantity ({line.unitSymbol})</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              max={Number(currentDel) || remaining}
                              value={currentRej}
                              onChange={(e) =>
                                setRejectedQtys((prev) => ({
                                  ...prev,
                                  [line.id]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        )}

                        {inspectNow && Number(currentRej) > 0 && (
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs text-destructive">
                              Rejection Reason <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              placeholder="e.g. Physical damage in transit, specifications mismatch"
                              value={rejectionReasons[line.id] ?? ''}
                              onChange={(e) =>
                                setRejectionReasons((prev) => ({
                                  ...prev,
                                  [line.id]: e.target.value,
                                }))
                              }
                              required
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <SheetFooter className="border-t p-4 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="gap-2"
          >
            <PackageCheck className="size-4" />
            {mutation.isPending ? 'Recording Delivery…' : 'Confirm & Save GRN'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

