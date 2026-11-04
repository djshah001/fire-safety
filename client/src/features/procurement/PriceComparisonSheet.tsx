import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Clock,
  Send,
  Copy,
  ExternalLink,
  MessageSquare,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  priceInquiryDetailQuery,
  useInviteVendor,
  useSendMsg91,
  type InquiryItem,
  type PriceInquiryResponse,
} from "@/api/priceInquiry";
import { vendorLookupsQuery, type Vendor } from "@/api/masters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  inquiryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(
  val: string | number | null | undefined,
  currency = "INR",
) {
  if (val == null || val === "") return "—";
  const num = Number(val);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function DeltaBadge({
  current,
  previous,
}: {
  current: string;
  previous?: string;
}) {
  if (!previous)
    return (
      <Badge variant="outline" className="text-xs">
        New
      </Badge>
    );
  const curr = Number(current);
  const prev = Number(previous);
  if (isNaN(curr) || isNaN(prev) || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? "+" : "";
  if (Math.abs(pct) < 0.01) {
    return (
      <Badge variant="secondary" className="text-xs font-mono">
        <Minus className="h-3 w-3 mr-0.5" />
        0%
      </Badge>
    );
  }
  return (
    <Badge
      variant={pct > 0 ? "destructive" : "default"}
      className={`text-xs font-mono ${pct < 0 ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
    >
      {pct > 0 ? (
        <TrendingUp className="h-3 w-3 mr-0.5" />
      ) : (
        <TrendingDown className="h-3 w-3 mr-0.5" />
      )}
      {sign}
      {pct.toFixed(1)}%
    </Badge>
  );
}

export function PriceComparisonSheet({ inquiryId, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    ...priceInquiryDetailQuery(inquiryId ?? ""),
    enabled: open && Boolean(inquiryId),
  });

  const invitations = data?.invitations ?? [];
  const responses = data?.responses ?? [];
  const priceListData = data?.priceListData ?? [];
  const inquiryItems = (data?.inquiry?.items as InquiryItem[] | undefined) ?? [];

  const [showInviteCard, setShowInviteCard] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [sendMsg91, setSendMsg91] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const vendorsQuery = useQuery(vendorLookupsQuery());
  const vendorList = (vendorsQuery.data?.items as Vendor[] | undefined) ?? [];

  const inviteMutation = useInviteVendor(inquiryId ?? "");
  const sendMsg91Mutation = useSendMsg91(inquiryId ?? "");

  async function handleInvite() {
    if (!selectedVendorId || !inquiryId) return;
    try {
      const res = await inviteMutation.mutateAsync({
        vendorId: selectedVendorId,
        whatsappNumber: whatsappNumber.trim() || undefined,
        sendMsg91,
      });
      toast.success("Vendor invited successfully!");
      if (res.msg91Result?.success) {
        toast.success("WhatsApp sent via MSG91.");
      }
      setSelectedVendorId("");
      setWhatsappNumber("");
      setSendMsg91(false);
      setShowInviteCard(false);
    } catch {
      toast.error("Failed to invite vendor.");
    }
  }

  async function copyLink(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedToken(null), 2500);
    } catch {
      toast.error("Failed to copy link.");
    }
  }

  function openWhatsApp(
    vendorName: string,
    phone: string | null | undefined,
    token: string,
  ) {
    const url = `${window.location.origin}/vendor-price/${token}`;
    const text = encodeURIComponent(
      `Hello ${vendorName}, please provide your best prices for our inquiry: ${url}`,
    );
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const href = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  if (!inquiryId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-5xl h-full flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-4 border-b bg-card shrink-0 pr-14">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold tracking-tight">
              Vendor Price Comparison
              {data?.inquiry ? ` — ${data.inquiry.inquiryCode}` : ""}
            </SheetTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInviteCard((prev) => !prev)}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              Invite Vendor
            </Button>
          </div>
          {data?.inquiry && (
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              {data.inquiry.title}
              {data.inquiry.responseDueDate && (
                <span className="ml-2 font-medium text-foreground">
                  · Due by{" "}
                  {new Date(
                    `${data.inquiry.responseDueDate}T00:00:00`,
                  ).toLocaleDateString()}
                </span>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

        {showInviteCard && (
          <div className="mt-4 rounded-lg border p-4 bg-muted/30 space-y-3">
            <Label className="text-sm font-semibold">
              Invite Vendor to Quote
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                value={selectedVendorId}
                onValueChange={setSelectedVendorId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose vendor…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {vendorList.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.displayName} ({v.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="WhatsApp Number (e.g. +91 98765 43210)"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="send-msg91-comp"
                  checked={sendMsg91}
                  onCheckedChange={(checked) => setSendMsg91(!!checked)}
                />
                <Label
                  htmlFor="send-msg91-comp"
                  className="text-xs font-normal cursor-pointer leading-tight text-foreground"
                >
                  Send via MSG91 WhatsApp automatically
                </Label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInviteCard(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleInvite}
                  disabled={inviteMutation.isPending || !selectedVendorId}
                >
                  {inviteMutation.isPending ? "Inviting…" : "Send Invitation"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {data && (
          <div className="mt-5 space-y-6">
            {/* Vendor invitations status summary bar */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Invited Vendors ({invitations.length})
              </Label>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">
                  No vendors invited yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  {invitations.map(({ vendor, invitation }) => {
                    const submissionUrl = `${window.location.origin}/vendor-price/${invitation.token}`;
                    return (
                      <div
                        key={vendor.id}
                        className="rounded-lg border p-2.5 bg-card text-xs space-y-1.5 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 truncate">
                            {invitation.status === "responded" ? (
                              <span className="relative flex h-2 w-2 mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                              </span>
                            ) : invitation.status === "sent" ? (
                              <span className="relative flex h-2 w-2 mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full h-2 w-2 mr-1 bg-muted-foreground/50" />
                            )}
                            <p className="font-semibold text-foreground truncate">
                              {vendor.displayName}
                            </p>
                          </div>
                          <Badge
                            variant={
                              invitation.status === "responded"
                                ? "default"
                                : invitation.status === "sent"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-[10px] h-5"
                          >
                            {invitation.status === "responded" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                            ) : (
                              <Clock className="h-3 w-3 mr-1" />
                            )}
                            {invitation.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>{invitation.whatsappNumber || "No phone"}</span>
                          <div className="flex items-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    aria-label="Copy self-fill link"
                                    onClick={() =>
                                      copyLink(submissionUrl, invitation.token)
                                    }
                                  >
                                    {copiedToken === invitation.token ? (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy link</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
                                    aria-label="Open WhatsApp chat with link"
                                    onClick={() =>
                                      openWhatsApp(
                                        vendor.displayName,
                                        invitation.whatsappNumber,
                                        invitation.token,
                                      )
                                    }
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open WhatsApp Web</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    aria-label="Preview link"
                                    onClick={() =>
                                      window.open(submissionUrl, "_blank")
                                    }
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Preview vendor link</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {invitation.whatsappNumber && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      aria-label="Re-send MSG91 WhatsApp"
                                      onClick={async () => {
                                        const res =
                                          await sendMsg91Mutation.mutateAsync(
                                            invitation.id,
                                          );
                                        if (res.success)
                                          toast.success("MSG91 WhatsApp sent.");
                                        else toast.error(res.error || "Failed.");
                                      }}
                                    >
                                      <Send className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Retry MSG91 send</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Price comparison matrix */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Price Comparison Matrix (Old vs New Quotes)
              </Label>

              {invitations.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Invite vendors above to start comparing prices.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border shadow-sm">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="min-w-48 font-semibold">
                          Item & Details
                        </TableHead>
                        {invitations.map(({ vendor, invitation }) => (
                          <TableHead key={vendor.id} className="min-w-44">
                            <div className="font-semibold text-foreground">
                              {vendor.displayName}
                            </div>
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {vendor.code} · {invitation.status}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inquiryItems.map(
                        (item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="align-top">
                              <p className="font-medium text-foreground">
                                {item.itemName}
                              </p>
                              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground mt-0.5">
                                {item.quantity && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {item.quantity} {item.unit}
                                  </Badge>
                                )}
                                {item.itemCode && (
                                  <span>Code: {item.itemCode}</span>
                                )}
                              </div>
                              {item.specification && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {item.specification}
                                </p>
                              )}
                            </TableCell>

                            {invitations.map(({ vendor, invitation }) => {
                              // Find matching response for this vendor + item
                              const resp = responses.find(
                                (r: PriceInquiryResponse) =>
                                  r.vendorId === vendor.id &&
                                  (r.itemRef as InquiryItem).itemName ===
                                    item.itemName,
                              );

                              // Find previous rate on file in vendorPriceLists
                              const prevPrice = item.itemId
                                ? priceListData.find(
                                    (p) =>
                                      p.vendorId === vendor.id &&
                                      p.itemId === item.itemId,
                                  )
                                : undefined;

                              return (
                                <TableCell
                                  key={vendor.id}
                                  className="align-top"
                                >
                                  {resp ? (
                                    <div className="space-y-1.5">
                                      <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <span className="text-base font-semibold text-foreground">
                                          {formatCurrency(
                                            resp.unitRate,
                                            resp.currency,
                                          )}
                                        </span>
                                        <DeltaBadge
                                          current={resp.unitRate}
                                          previous={prevPrice?.unitRate}
                                        />
                                      </div>

                                      {prevPrice && (
                                        <p className="text-xs text-muted-foreground">
                                          Old price:{" "}
                                          {formatCurrency(
                                            prevPrice.unitRate,
                                            prevPrice.currency,
                                          )}
                                        </p>
                                      )}

                                      <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                                        {resp.leadTimeDays != null && (
                                          <span className="rounded bg-muted px-1.5 py-0.5">
                                            {resp.leadTimeDays}d lead
                                          </span>
                                        )}
                                        {resp.moq && (
                                          <span className="rounded bg-muted px-1.5 py-0.5">
                                            MOQ: {resp.moq}
                                          </span>
                                        )}
                                      </div>

                                      {resp.notes && (
                                        <p className="text-xs text-muted-foreground italic border-l-2 pl-2 mt-1">
                                          "{resp.notes}"
                                        </p>
                                      )}
                                    </div>
                                  ) : invitation.status === "responded" ? (
                                    <span className="text-xs text-muted-foreground italic">
                                      Not quoted for this item
                                    </span>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">
                                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 mr-1.5" />
                                      Pending quote
                                      {prevPrice && (
                                        <p className="mt-1 text-muted-foreground">
                                          Old rate:{" "}
                                          {formatCurrency(
                                            prevPrice.unitRate,
                                            prevPrice.currency,
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        <SheetFooter className="px-6 py-3 border-t bg-card shrink-0 flex flex-row items-center justify-between sm:justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {data?.inquiry && (
              <span>
                {data.inquiry.inquiryCode} •{" "}
                {
                  invitations.filter(
                    (i) => i.invitation?.status === "responded",
                  ).length
                }{" "}
                of {invitations.length} vendor(s) responded
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
