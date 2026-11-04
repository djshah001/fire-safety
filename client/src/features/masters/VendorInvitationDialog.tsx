import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  createVendorInvitation,
  sendVendorInvitationMsg91,
  type VendorInvitation,
} from "@/api/masters";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export function VendorInvitationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [validDays, setValidDays] = useState(14);
  const [sendViaMsg91, setSendViaMsg91] = useState(true);
  const [createdInvitation, setCreatedInvitation] =
    useState<VendorInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg91Status, setMsg91Status] = useState<{
    status: "sent" | "unconfigured" | "failed" | "idle";
    messageId?: string;
    error?: string;
  }>({ status: "idle" });

  useEffect(() => {
    if (!open) {
      setCreatedInvitation(null);
      setWhatsappNumber("");
      setContactName("");
      setCompanyName("");
      setValidDays(14);
      setMsg91Status({ status: "idle" });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      createVendorInvitation({
        whatsappNumber,
        contactName,
        companyName: companyName || undefined,
        validDays,
        sendViaMsg91,
      }),
    onSuccess: (invitation) => {
      setCreatedInvitation(invitation);
      if (invitation.msg91Delivery) {
        setMsg91Status(invitation.msg91Delivery);
        if (invitation.msg91Delivery.status === "sent") {
          toast.success("WhatsApp invitation sent via MSG91!");
        } else if (invitation.msg91Delivery.status === "unconfigured") {
          toast.info("MSG91 is unconfigured. Direct WhatsApp link ready.");
        } else {
          toast.warning(
            `MSG91 dispatch: ${invitation.msg91Delivery.error || "Failed"}`,
          );
        }
      } else {
        toast.success("WhatsApp registration link generated!");
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate invitation.",
      );
    },
  });

  const sendMsg91Mutation = useMutation({
    mutationFn: () => sendVendorInvitationMsg91(createdInvitation!.id),
    onSuccess: (result) => {
      setMsg91Status(result);
      if (result.success) {
        toast.success(
          `WhatsApp message sent via MSG91! ID: ${result.messageId}`,
        );
      } else if (result.status === "unconfigured") {
        toast.info(
          "MSG91 is unconfigured in .env. Open WhatsApp directly below.",
        );
      } else {
        toast.error(`MSG91 Error: ${result.error}`);
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to deliver message via MSG91.",
      );
    },
  });

  const handleCopy = () => {
    if (!createdInvitation) return;
    navigator.clipboard.writeText(createdInvitation.registrationUrl);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setCreatedInvitation(null);
    setWhatsappNumber("");
    setContactName("");
    setCompanyName("");
    setValidDays(14);
    setMsg91Status({ status: "idle" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5 text-emerald-600" />
            Invite Vendor via WhatsApp (MSG91)
          </DialogTitle>
          <DialogDescription>
            Enter the vendor&apos;s WhatsApp mobile number. A personalized
            registration link will be generated and dispatched via MSG91
            WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {createdInvitation ? (
          <div className="space-y-4 py-2">
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
              <AlertDescription className="text-sm space-y-1">
                <div>
                  Registration link generated for{" "}
                  <strong>{createdInvitation.contactName}</strong> (
                  {createdInvitation.whatsappNumber}). The link is valid for{" "}
                  {validDays} days.
                </div>
                {msg91Status.status === "sent" && (
                  <div className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="size-3.5" />
                    Delivered via MSG91 WhatsApp (ID: {msg91Status.messageId})
                  </div>
                )}
                {msg91Status.status === "unconfigured" && (
                  <div className="text-xs text-muted-foreground pt-1">
                    MSG91 not configured in environment. You can open WhatsApp
                    directly with the button below.
                  </div>
                )}
                {msg91Status.status === "failed" && (
                  <div className="text-xs text-destructive pt-1">
                    MSG91 error: {msg91Status.error}. You can retry or open
                    WhatsApp manually.
                  </div>
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Vendor Self-Registration Link
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdInvitation.registrationUrl}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                WhatsApp Message Content
              </Label>
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                {createdInvitation.messageText}
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() =>
                    window.open(createdInvitation.whatsappUrl, "_blank")
                  }
                >
                  <ExternalLink className="mr-2 size-4" />
                  Open WhatsApp Web / App
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className="flex-1"
                >
                  {copied ? (
                    <Check className="mr-2 size-4" />
                  ) : (
                    <Copy className="mr-2 size-4" />
                  )}
                  Copy Link
                </Button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-xs"
                disabled={sendMsg91Mutation.isPending}
                onClick={() => sendMsg91Mutation.mutate()}
              >
                <Send className="mr-1.5 size-3.5" />
                {sendMsg91Mutation.isPending
                  ? "Sending via MSG91..."
                  : "Send / Retry via MSG91 WhatsApp"}
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber">
                Vendor WhatsApp Number{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="whatsappNumber"
                placeholder="+91 98765 43210"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Include country code (e.g. +91 for India).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactName">
                Contact Person Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactName"
                placeholder="e.g. Rajesh Kumar"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="companyName">
                Company / Trade Name (Optional)
              </Label>
              <Input
                id="companyName"
                placeholder="e.g. SafeGuard Industries"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="validDays">Link Validity (Days)</Label>
                <Input
                  id="validDays"
                  type="number"
                  min={1}
                  max={60}
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Checkbox
                  id="sendViaMsg91"
                  checked={sendViaMsg91}
                  onCheckedChange={(checked) =>
                    setSendViaMsg91(checked === true)
                  }
                />
                <Label
                  htmlFor="sendViaMsg91"
                  className="text-xs font-normal cursor-pointer"
                >
                  Send via MSG91 automatically
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  mutation.isPending ||
                  !whatsappNumber.trim() ||
                  !contactName.trim()
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="mr-2 size-4" />
                {mutation.isPending
                  ? "Generating..."
                  : "Generate & Send WhatsApp"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
