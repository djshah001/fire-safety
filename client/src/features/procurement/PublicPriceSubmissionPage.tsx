import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, AlertCircle, Calendar, Package, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { publicPriceInquiryQuery, useSubmitPublicPriceResponse, type InquiryItem } from '@/api/priceInquiry';

type ResponseRow = {
  itemRef: InquiryItem;
  unitRate: string;
  brandOffered: string;
  isCustomBrand: boolean;
  currency: string;
  leadTimeDays: string;
  notes: string;
  moq: string;
  validUntil: string;
};

export function PublicPriceSubmissionPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery(publicPriceInquiryQuery(token ?? ''));
  const submitMutation = useSubmitPublicPriceResponse(token ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.inquiry?.items) {
      setRows(
        (data.inquiry.items as InquiryItem[]).map((item) => {
          const defaultBrand =
            item.eligibleBrands?.find((b) => b.isPreferred)?.name ??
            item.eligibleBrands?.[0]?.name ??
            item.brandOffered ??
            "";
          return {
            itemRef: item,
            unitRate: "",
            brandOffered: defaultBrand,
            isCustomBrand: false,
            currency: "INR",
            leadTimeDays: "",
            notes: "",
            moq: "",
            validUntil: "",
          };
        }),
      );
    }
  }, [data]);

  function updateRow(idx: number, field: keyof Omit<ResponseRow, 'itemRef'>, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    if (validationError) setValidationError(null);
  }

  async function handleSubmit() {
    const validRows = rows.filter((r) => r.unitRate.trim() && !isNaN(Number(r.unitRate)));

    if (validRows.length === 0) {
      setValidationError('Please enter a valid quoted unit rate for at least one item.');
      return;
    }

    const responses = validRows.map((r) => {
      const brand = r.brandOffered?.trim();
      const combinedNotes = [
        brand ? `Brand: ${brand}` : null,
        r.notes.trim() || null,
      ]
        .filter(Boolean)
        .join(' · ');

      return {
        itemRef: {
          ...r.itemRef,
          brandOffered: brand || undefined,
        },
        unitRate: r.unitRate.trim(),
        currency: r.currency || 'INR',
        leadTimeDays: r.leadTimeDays ? parseInt(r.leadTimeDays, 10) : undefined,
        notes: combinedNotes || undefined,
        moq: r.moq.trim() || undefined,
        validUntil: r.validUntil || undefined,
      };
    });

    try {
      await submitMutation.mutateAsync({ responses, saveToPriceList: true });
      setSubmitted(true);
    } catch {
      setValidationError('Failed to submit prices. Please check your network and try again.');
    }
  }

  if (!token) return null;

  if (isLoading) {
    return (
      <main className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Loading price inquiry details…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center pb-2">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Invitation Link Invalid or Expired</CardTitle>
            <CardDescription>
              This price inquiry link is no longer valid or has reached its expiration date.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Please contact our procurement team to receive an updated link.
          </CardContent>
        </Card>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-xl border-emerald-500/30 text-center">
          <CardHeader className="space-y-3 pb-4">
            <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-950/60 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <CardTitle className="text-2xl">Quotation Submitted Successfully!</CardTitle>
            <CardDescription className="text-base text-foreground/80">
              Thank you, <strong>{data.vendor.displayName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Your prices for <strong>{data.inquiry.title}</strong> have been recorded in our system.
              Our purchase department will review your quotes and contact you regarding the purchase order.
            </p>
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Reference Code: {data.inquiry.inquiryCode}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (data.invitationStatus === 'responded') {
    return (
      <main className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-2" />
            <CardTitle>Prices Already Submitted</CardTitle>
            <CardDescription>
              You have already submitted prices for <strong>{data.inquiry.inquiryCode}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            If you need to revise your rates or terms, please get in touch with our purchase representative directly.
          </CardContent>
        </Card>
      </main>
    );
  }

  const items = (data.inquiry.items as InquiryItem[]) || [];

  return (
    <main className="min-h-screen bg-muted/20 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header banner */}
        <div className="text-center space-y-2">
          <Badge variant="outline" className="px-3 py-1 text-xs uppercase tracking-wider">
            Vendor Self-Service Price Portal
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Price Quotation Submission
          </h1>
          <p className="text-sm text-muted-foreground">
            Invited Vendor: <strong className="text-foreground">{data.vendor.displayName}</strong>
            {data.vendor.code && ` (${data.vendor.code})`}
          </p>
        </div>

        {/* Inquiry Information Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="text-xs font-mono font-medium text-primary uppercase">
                  {data.inquiry.inquiryCode}
                </span>
                <CardTitle className="text-xl mt-0.5">{data.inquiry.title}</CardTitle>
              </div>
              {data.inquiry.responseDueDate && (
                <div className="flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  Due: {new Date(`${data.inquiry.responseDueDate}T00:00:00`).toLocaleDateString()}
                </div>
              )}
            </div>
            {data.inquiry.description && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {data.inquiry.description}
              </p>
            )}
          </CardHeader>
        </Card>

        {validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Notice</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {/* Price Entry List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Requested Items ({items.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Enter rates for items you can supply
            </p>
          </div>

          {rows.map((row, idx) => {
            const item = items[idx] ?? row.itemRef;
            return (
              <Card key={idx} className="shadow-xs border-muted-foreground/20">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Item header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {idx + 1}
                        </span>
                        <h3 className="font-semibold text-base text-foreground">{item.itemName}</h3>
                      </div>
                      {item.specification && (
                        <p className="text-xs text-muted-foreground pl-7">{item.specification}</p>
                      )}
                    </div>

                    <div className="flex gap-1.5 self-start pl-7 sm:pl-0">
                      {item.quantity && (
                        <Badge variant="secondary" className="text-xs font-medium">
                          Qty: {item.quantity} {item.unit || ''}
                        </Badge>
                      )}
                      {item.itemCode && (
                        <Badge variant="outline" className="text-xs">
                          {item.itemCode}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                    {/* Brand / Make Selection */}
                    {row.itemRef.eligibleBrands && row.itemRef.eligibleBrands.length > 0 ? (
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-xs font-medium">
                          Brand / Make <span className="text-muted-foreground text-[11px]">(from catalogue)</span>
                        </Label>
                        <Select
                          value={row.isCustomBrand ? "__other__" : (row.brandOffered || row.itemRef.eligibleBrands[0]?.name || "")}
                          onValueChange={(val) => {
                            if (val === "__other__") {
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, isCustomBrand: true, brandOffered: "" } : r,
                                ),
                              );
                            } else {
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, isCustomBrand: false, brandOffered: val } : r,
                                ),
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Select Brand / Make" />
                          </SelectTrigger>
                          <SelectContent>
                            {row.itemRef.eligibleBrands.map((b) => (
                              <SelectItem key={b.id} value={b.name} className="text-xs">
                                {b.name} {b.model ? `· ${b.model}` : ""} {b.isPreferred ? "★ (Preferred)" : ""}
                              </SelectItem>
                            ))}
                            <SelectItem value="__other__" className="text-xs">
                              Other / Alternative Make…
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {row.isCustomBrand && (
                          <Input
                            placeholder="Type alternative brand / manufacturer…"
                            value={row.brandOffered}
                            onChange={(e) => updateRow(idx, "brandOffered", e.target.value)}
                            className="text-xs mt-1.5"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-xs font-medium">Brand / Make</Label>
                        <Input
                          placeholder="e.g. Manufacturer / Make"
                          value={row.brandOffered}
                          onChange={(e) => updateRow(idx, "brandOffered", e.target.value)}
                          className="text-xs"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">
                        Unit Rate (₹) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row.unitRate}
                        onChange={(e) => updateRow(idx, 'unitRate', e.target.value)}
                        className="font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Lead Time (days)</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 5"
                        value={row.leadTimeDays}
                        onChange={(e) => updateRow(idx, 'leadTimeDays', e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Min Order Qty (MOQ)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 1"
                        value={row.moq}
                        onChange={(e) => updateRow(idx, 'moq', e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Rate Valid Until</Label>
                      <Input
                        type="date"
                        value={row.validUntil}
                        onChange={(e) => updateRow(idx, 'validUntil', e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2 md:col-span-4 space-y-1">
                      <Label className="text-xs font-medium">
                        Warranty & Commercial Notes (optional)
                      </Label>
                      <Textarea
                        placeholder="Specify warranty terms, exclusions, delivery conditions…"
                        value={row.notes}
                        onChange={(e) => updateRow(idx, 'notes', e.target.value)}
                        rows={1}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Submission button */}
          <div className="pt-2">
            <Button
              className="w-full h-12 text-base font-semibold shadow-md"
              size="lg"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Submitting Your Rates…
                </>
              ) : (
                <>
                  Submit Quotation Rates <ArrowRight className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-2">
              By submitting, you confirm that these prices are valid and applicable as quoted.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

