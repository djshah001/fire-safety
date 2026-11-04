import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  UserRound,
  ShieldCheck,
  Copy,
  Check,
  Loader2,
  Star,
  ExternalLink,
  FileText,
} from "lucide-react";

import { addCustomerContact, addCustomerSite, customerQuery } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { StatusBadge } from "@/components/data-table/StatusBadge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CustomerDetailPage() {
  const { id } = useParams();
  const customer = useQuery(customerQuery(id));
  const queryClient = useQueryClient();

  const [panel, setPanel] = useState<"contact" | "site">();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!id || !panel) throw new Error("Customer record is unavailable.");

      if (panel === "contact") {
        const phone = String(form.get("phone") ?? "").trim();
        const email = String(form.get("email") ?? "").trim();

        if (!phone && !email) {
          throw new Error(
            "Provide at least a contact phone number or email address.",
          );
        }

        return addCustomerContact(id, {
          name: String(form.get("name")).trim(),
          phone: phone || undefined,
          email: email || undefined,
          isPrimary: form.get("isPrimary") === "on",
        });
      }

      return addCustomerSite(id, {
        name: String(form.get("name")).trim(),
        addressLine1: String(form.get("addressLine1")).trim(),
        city: String(form.get("city")).trim(),
      });
    },
    async onSuccess(_data, _variables) {
      await queryClient.invalidateQueries({
        queryKey: ["crm", "customer", id],
      });
      await queryClient.invalidateQueries({ queryKey: ["crm", "customers"] });
      toast.success(
        panel === "contact"
          ? "Contact added successfully."
          : "Site added successfully.",
      );
      setPanel(undefined);
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  if (customer.isPending) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </main>
    );
  }

  if (customer.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost" className="-ml-2 mb-2">
          <Link to="/crm/customers">
            <ArrowLeft className="mr-1.5 size-4" />
            Customers
          </Link>
        </Button>
        <Alert className="mt-4" variant="destructive">
          <AlertTitle>Customer unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              customer.error,
              "This customer is unavailable or outside your assigned branch scope.",
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const data = customer.data;

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        {/* Navigation Breadcrumb */}
        <Button asChild className="-ml-2 mb-2" variant="ghost">
          <Link to="/crm/customers">
            <ArrowLeft className="mr-1.5 size-4" />
            Customers Directory
          </Link>
        </Button>

        {/* Header Summary */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Customer Master
              </span>
              <StatusBadge status={data.status} />
              <Badge
                variant="outline"
                className="text-[11px] capitalize font-medium"
              >
                {data.customerType} Account
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {data.displayName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data.legalName
                ? `Legal Entity: ${data.legalName}`
                : "No separate legal registration recorded"}
            </p>
          </div>
        </div>

        {/* Section 1: Billing & Tax Profile */}
        <Card className="mt-6 shadow-2xs overflow-hidden">
          <CardHeader className="border-b bg-card/60 p-4 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                Billing & Commercial Identity
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Commercial tax details referenced in quotations, BOQs, and
              customer orders.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <span className="text-[11px] font-medium text-muted-foreground block">
                  Account Type
                </span>
                <span className="mt-0.5 text-xs font-semibold capitalize text-foreground block">
                  {data.customerType}
                </span>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    GSTIN
                  </span>
                  {data.gstin && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(data.gstin!, "gstin")}
                      className="text-muted-foreground hover:text-foreground"
                      title="Copy GSTIN"
                    >
                      {copiedKey === "gstin" ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  )}
                </div>
                <span className="mt-0.5 text-xs font-mono font-semibold text-foreground block">
                  {data.gstin || "Not registered"}
                </span>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    PAN Number
                  </span>
                  {data.pan && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(data.pan!, "pan")}
                      className="text-muted-foreground hover:text-foreground"
                      title="Copy PAN"
                    >
                      {copiedKey === "pan" ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  )}
                </div>
                <span className="mt-0.5 text-xs font-mono font-semibold text-foreground block">
                  {data.pan || "Not provided"}
                </span>
              </div>
            </div>

            {/* Addresses */}
            {data.addresses.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <span className="text-xs font-semibold text-foreground block">
                  Registered Addresses
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.addresses.map((address) => (
                    <div
                      key={address.id}
                      className="rounded-lg border bg-card p-3 space-y-1 text-xs"
                    >
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4.5 px-1.5 font-normal"
                      >
                        {address.label || "Address"}
                      </Badge>
                      <p className="text-foreground leading-relaxed">
                        {[
                          address.addressLine1,
                          address.addressLine2,
                          address.city,
                          address.state,
                          address.postalCode,
                          address.country,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Contacts & Sites Columns */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Card: Contacts */}
          <Card className="shadow-2xs overflow-hidden">
            <CardHeader className="border-b bg-card/60 p-4 pb-3 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <UserRound className="size-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">
                    Contact Persons
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  {data.contacts.length} registered representative
                  {data.contacts.length === 1 ? "" : "s"}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPanel("contact")}
                className="h-8 text-xs px-2.5"
              >
                <Plus className="size-3.5 mr-1" />
                Add Contact
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {data.contacts.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No contact persons added yet.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {data.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-start justify-between gap-3 p-3.5 hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground truncate">
                            {contact.name}
                          </span>
                          {contact.isPrimary && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 font-medium flex items-center gap-1"
                            >
                              <Star className="size-2.5 fill-primary" />
                              Primary
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs text-muted-foreground pt-0.5">
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="flex items-center gap-1 hover:text-foreground transition-colors font-mono text-[11px]"
                            >
                              <Phone className="size-3 text-primary shrink-0" />
                              <span>{contact.phone}</span>
                            </a>
                          )}
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="flex items-center gap-1 hover:text-foreground transition-colors font-mono text-[11px] truncate max-w-[200px]"
                            >
                              <Mail className="size-3 text-primary shrink-0" />
                              <span className="truncate">{contact.email}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card: Project Sites */}
          <Card className="shadow-2xs overflow-hidden">
            <CardHeader className="border-b bg-card/60 p-4 pb-3 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">
                    Project Sites
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  {data.sites.length} delivery & installation location
                  {data.sites.length === 1 ? "" : "s"}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPanel("site")}
                className="h-8 text-xs px-2.5"
              >
                <Plus className="size-3.5 mr-1" />
                Add Site
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {data.sites.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No project sites added yet.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {data.sites.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-start gap-3 p-3.5 hover:bg-muted/20 transition-colors"
                    >
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MapPin className="size-3.5" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1 text-xs">
                        <p className="font-semibold text-foreground truncate">
                          {site.name}
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                          {site.addressLine1}, {site.city}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal: Add Contact or Add Site */}
        <Dialog
          open={Boolean(panel)}
          onOpenChange={(open) => {
            if (!open) setPanel(undefined);
          }}
        >
          <DialogContent className="max-h-[85vh] sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-5 pb-3 border-b shrink-0">
              <DialogTitle>
                {panel === "contact"
                  ? "Add Contact Representative"
                  : "Add Project Site"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {panel === "contact"
                  ? "Record an authorized representative for operational and commercial communications."
                  : "Record a physical installation or delivery location for this customer."}
              </DialogDescription>
            </DialogHeader>

            {panel && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate(new FormData(event.currentTarget));
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="panel-name"
                      className="text-xs font-semibold"
                    >
                      {panel === "contact"
                        ? "Contact Person Name"
                        : "Site Name"}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="panel-name"
                      name="name"
                      placeholder={
                        panel === "contact"
                          ? "e.g. Ramesh Patel"
                          : "e.g. Makarpura GIDC Unit-2"
                      }
                      className="h-9 text-sm"
                      required
                    />
                  </div>

                  {panel === "contact" ? (
                    <>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="panel-phone"
                          className="text-xs font-semibold"
                        >
                          Phone Number
                        </Label>
                        <Input
                          id="panel-phone"
                          name="phone"
                          type="tel"
                          placeholder="+91 98765 43210"
                          className="h-9 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="panel-email"
                          className="text-xs font-semibold"
                        >
                          Email Address
                        </Label>
                        <Input
                          id="panel-email"
                          name="email"
                          type="email"
                          placeholder="ramesh@company.com"
                          className="h-9 text-sm"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="panel-isPrimary"
                          name="isPrimary"
                          className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                        <Label
                          htmlFor="panel-isPrimary"
                          className="text-xs font-medium text-foreground cursor-pointer"
                        >
                          Designate as primary contact
                        </Label>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        At least one contact method (phone or email) is
                        required.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="panel-address"
                          className="text-xs font-semibold"
                        >
                          Site Address Line{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="panel-address"
                          name="addressLine1"
                          placeholder="Plot / Survey No., Industrial Area, Road…"
                          className="h-9 text-sm"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="panel-city"
                          className="text-xs font-semibold"
                        >
                          City <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="panel-city"
                          name="city"
                          placeholder="Vadodara"
                          className="h-9 text-sm"
                          required
                        />
                      </div>
                    </>
                  )}

                  {mutation.isError && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-xs">
                        {getApiErrorMessage(mutation.error)}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <DialogFooter className="p-4 border-t bg-card shrink-0">
                  <Button
                    onClick={() => setPanel(undefined)}
                    type="button"
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button disabled={mutation.isPending} type="submit" size="sm">
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />{" "}
                        Saving…
                      </>
                    ) : (
                      `Save ${panel === "contact" ? "Contact" : "Site"}`
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
