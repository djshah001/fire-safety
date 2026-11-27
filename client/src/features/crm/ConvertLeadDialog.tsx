import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  checkCustomerDuplicateHints,
  customerQuery,
  customersQuery,
  qualifyLead,
  type DuplicateHint,
  type Lead,
} from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { FileDropzone } from "@/components/FileDropzone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

const conversionFormSchema = z
  .object({
    mode: z.enum(["new", "existing"]),
    customerId: z.string().optional(),
    primaryContactId: z.string().optional(),
    siteId: z.string().optional(),
    displayName: z.string().trim().max(160).optional(),
    legalName: z.string().trim().max(200).optional(),
    customerType: z.enum(["business", "individual", "government", "other"]),
    gstin: z
      .string()
      .trim()
      .max(15)
      .optional()
      .refine(
        (val) => !val || /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/.test(val),
        "Enter a valid 15-character GSTIN.",
      ),
    pan: z
      .string()
      .trim()
      .max(10)
      .optional()
      .refine(
        (val) => !val || /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(val),
        "Enter a valid PAN.",
      ),
    contactName: z.string().trim().max(120).optional(),
    contactJobTitle: z.string().trim().max(100).optional(),
    contactPhone: z.string().trim().max(30).optional(),
    contactEmail: z.union([z.email().max(254), z.literal("")]).optional(),
    includeSite: z.boolean(),
    siteName: z.string().trim().max(120).optional(),
    siteAddressLine1: z.string().trim().max(200).optional(),
    siteCity: z.string().trim().max(100).optional(),
    siteState: z.string().trim().max(100).optional(),
    sitePostalCode: z.string().trim().max(20).optional(),
    title: z.string().trim().min(2, "Opportunity title is required.").max(200),
    qualificationNotes: z
      .string()
      .trim()
      .min(3, "Enter at least 3 characters of qualification notes.")
      .max(1000),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "existing") {
      if (!val.customerId) {
        ctx.addIssue({ code: "custom", message: "Choose a customer account.", path: ["customerId"] });
      }
      if (!val.primaryContactId) {
        ctx.addIssue({ code: "custom", message: "Choose a primary contact.", path: ["primaryContactId"] });
      }
      return;
    }

    if (!val.displayName || val.displayName.length < 2) {
      ctx.addIssue({ code: "custom", message: "Customer name must be at least 2 characters.", path: ["displayName"] });
    }
    if (!val.contactName || val.contactName.length < 2) {
      ctx.addIssue({ code: "custom", message: "Contact person name is required.", path: ["contactName"] });
    }
    if (!val.contactPhone && !val.contactEmail) {
      ctx.addIssue({
        code: "custom",
        message: "Provide a phone number or email address for the primary contact.",
        path: ["contactPhone"],
      });
    }
    if (val.includeSite) {
      if (!val.siteName || val.siteName.length < 2) {
        ctx.addIssue({ code: "custom", message: "Site name is required.", path: ["siteName"] });
      }
      if (!val.siteAddressLine1 || val.siteAddressLine1.length < 3) {
        ctx.addIssue({ code: "custom", message: "Site address is required.", path: ["siteAddressLine1"] });
      }
      if (!val.siteCity || val.siteCity.length < 2) {
        ctx.addIssue({ code: "custom", message: "Site city is required.", path: ["siteCity"] });
      }
    }
  });

type ConversionFormValues = z.infer<typeof conversionFormSchema>;

export function ConvertLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead?: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [duplicateHints, setDuplicateHints] = useState<DuplicateHint[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const form = useForm<ConversionFormValues>({
    resolver: zodResolver(conversionFormSchema),
    defaultValues: {
      mode: "new",
      customerId: lead?.customerId ?? "",
      primaryContactId: lead?.primaryContactId ?? "",
      siteId: lead?.siteId ?? "",
      displayName: lead?.companyName || lead?.contactName || lead?.inquiryName || "",
      legalName: lead?.companyName ?? "",
      customerType: "business",
      gstin: "",
      pan: "",
      contactName: lead?.contactName ?? "",
      contactJobTitle: "",
      contactPhone: lead?.phone ?? "",
      contactEmail: lead?.email ?? "",
      includeSite: Boolean(lead?.address),
      siteName: lead?.companyName || lead?.inquiryName || "",
      siteAddressLine1: lead?.address ?? "",
      siteCity: "",
      siteState: "",
      sitePostalCode: "",
      title: lead?.inquiryName ?? "",
      qualificationNotes: "",
    },
  });

  useEffect(() => {
    if (!open || !lead) return;
    setFiles([]);
    setDuplicateHints([]);
    form.reset({
      mode: lead.customerId ? "existing" : "new",
      customerId: lead.customerId ?? "",
      primaryContactId: lead.primaryContactId ?? "",
      siteId: lead.siteId ?? "",
      displayName: lead.companyName || lead.contactName || lead.inquiryName,
      legalName: lead.companyName ?? "",
      customerType: "business",
      gstin: "",
      pan: "",
      contactName: lead.contactName,
      contactJobTitle: "",
      contactPhone: lead.phone ?? "",
      contactEmail: lead.email ?? "",
      includeSite: Boolean(lead.address),
      siteName: lead.companyName || lead.inquiryName,
      siteAddressLine1: lead.address ?? "",
      siteCity: "",
      siteState: "",
      sitePostalCode: "",
      title: lead.inquiryName,
      qualificationNotes: "",
    });
  }, [open, lead, form]);

  const mode = form.watch("mode");
  const selectedCustomerId = form.watch("customerId");
  const selectedContactId = form.watch("primaryContactId");
  const selectedSiteId = form.watch("siteId");
  const includeSite = form.watch("includeSite");
  const watchedDisplayName = form.watch("displayName");
  const watchedPhone = form.watch("contactPhone");
  const watchedEmail = form.watch("contactEmail");
  const watchedNotes = form.watch("qualificationNotes") ?? "";

  const customers = useQuery({
    ...customersQuery({ pageSize: 100 }),
    enabled: open,
  });
  const selectedCustomer = useQuery(customerQuery(selectedCustomerId || undefined));

  const matchedContact = selectedCustomer.data?.contacts.find(
    (c) => c.id === selectedContactId,
  );
  const matchedSite = selectedCustomer.data?.sites.find((s) => s.id === selectedSiteId);

  useEffect(() => {
    if (!open || mode !== "new") {
      setDuplicateHints([]);
      return;
    }
    const name = watchedDisplayName?.trim() ?? "";
    if (name.length < 2) {
      setDuplicateHints([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setCheckingDuplicates(true);
      void checkCustomerDuplicateHints({
        name,
        phone: watchedPhone?.trim() || undefined,
        email: watchedEmail?.trim() || undefined,
      })
        .then((hints) => setDuplicateHints(hints.filter((item) => item.type === "customer")))
        .catch(() => setDuplicateHints([]))
        .finally(() => setCheckingDuplicates(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [open, mode, watchedDisplayName, watchedPhone, watchedEmail]);

  const conversion = useMutation({
    mutationFn: async (values: ConversionFormValues) => {
      if (!lead) throw new Error("Lead is unavailable.");
      if (values.mode === "existing") {
        return qualifyLead({
          leadId: lead.id,
          expectedVersion: lead.rowVersion,
          customerId: values.customerId,
          primaryContactId: values.primaryContactId,
          siteId: values.siteId || undefined,
          title: values.title,
          qualificationNotes: values.qualificationNotes,
          files,
        });
      }

      return qualifyLead({
        leadId: lead.id,
        expectedVersion: lead.rowVersion,
        newCustomer: {
          displayName: values.displayName!,
          legalName: values.legalName || undefined,
          customerType: values.customerType,
          gstin: values.gstin ? values.gstin.toUpperCase() : undefined,
          pan: values.pan ? values.pan.toUpperCase() : undefined,
          contact: {
            name: values.contactName!,
            jobTitle: values.contactJobTitle || undefined,
            phone: values.contactPhone || undefined,
            email: values.contactEmail || undefined,
            isPrimary: true,
          },
          site: values.includeSite
            ? {
                name: values.siteName!,
                addressLine1: values.siteAddressLine1!,
                city: values.siteCity!,
                state: values.siteState || undefined,
                postalCode: values.sitePostalCode || undefined,
              }
            : undefined,
        },
        title: values.title,
        qualificationNotes: values.qualificationNotes,
        files,
      });
    },
    async onSuccess(result) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "customers"] }),
        lead ? queryClient.invalidateQueries({ queryKey: ["crm", "lead", lead.id] }) : Promise.resolve(),
      ]);
      toast.success(
        result.attachments?.length
          ? `Lead converted with ${result.attachments.length} opportunity document${result.attachments.length === 1 ? "" : "s"}.`
          : "Lead converted into an unawarded opportunity.",
      );
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-5xl lg:max-w-6xl h-full flex flex-col p-0 gap-0 bg-background"
      >
        <SheetHeader className="border-b bg-card px-6 py-4 pr-14 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {lead && (
              <Badge variant="outline" className="font-mono text-[11px]">
                {lead.leadNumber}
              </Badge>
            )}
            {lead?.serviceCategoryName && (
              <Badge variant="secondary" className="text-[11px]">
                {lead.serviceCategoryName}
              </Badge>
            )}
            {lead?.sectorName && (
              <Badge variant="secondary" className="text-[11px]">
                {lead.sectorName}
              </Badge>
            )}
          </div>
          <SheetTitle className="mt-1 flex items-center gap-2 text-lg">
            <Building2 className="size-5 text-primary" />
            Convert Lead to Opportunity
          </SheetTitle>
          <SheetDescription className="text-xs">
            Pre-filled from lead inquiry. Create or link the customer account, primary contact,
            installation site, and attach client documents shared with Engineering.
          </SheetDescription>
        </SheetHeader>

        {lead && (
          <form
            onSubmit={form.handleSubmit((values) => conversion.mutate(values))}
            className="flex flex-1 flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] items-start">
                {/* Left Column: Customer Account, Contact & Site */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        1
                      </span>
                      <h3 className="text-sm font-semibold text-foreground">
                        Customer Account &amp; Contact
                      </h3>
                    </div>
                  </div>

                  <Tabs
                    value={mode}
                    onValueChange={(next) => {
                      form.setValue("mode", next as "new" | "existing");
                    }}
                  >
                    <TabsList className="grid w-full grid-cols-2 h-10">
                      <TabsTrigger value="new" className="text-xs font-medium">
                        Create New Customer
                      </TabsTrigger>
                      <TabsTrigger value="existing" className="text-xs font-medium">
                        Link Existing Customer
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="new" className="mt-4 space-y-4">
                      {duplicateHints.length > 0 && (
                        <Alert className="border-amber-500/40 bg-amber-500/10">
                          <AlertTriangle className="size-4 text-amber-600" />
                          <AlertTitle className="text-xs font-semibold">
                            Possible existing customer match found
                          </AlertTitle>
                          <AlertDescription className="mt-2 space-y-2 text-xs">
                            {duplicateHints.map((hint) => (
                              <div
                                key={hint.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/90 px-3 py-2"
                              >
                                <div>
                                  <span className="font-semibold text-foreground">{hint.label}</span>
                                  <span className="ml-2 text-muted-foreground">({hint.reason})</span>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    form.setValue("mode", "existing");
                                    form.setValue("customerId", hint.id);
                                    form.setValue("primaryContactId", "");
                                    form.setValue("siteId", "");
                                  }}
                                >
                                  Link this account
                                </Button>
                              </div>
                            ))}
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Account Identity Card */}
                      <div className="rounded-xl border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Customer Account Identity
                          </p>
                          {checkingDuplicates && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Loader2 className="size-3 animate-spin" />
                              Checking duplicates…
                            </span>
                          )}
                        </div>

                        <div className="grid gap-3.5 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="conv-displayName" className="text-xs font-semibold">
                              Customer Display Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="conv-displayName"
                              {...form.register("displayName")}
                              className="h-9 text-sm"
                            />
                            {form.formState.errors.displayName && (
                              <p className="text-[11px] text-destructive">
                                {form.formState.errors.displayName.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="conv-legalName" className="text-xs font-semibold">
                              Legal Company Name
                            </Label>
                            <Input
                              id="conv-legalName"
                              {...form.register("legalName")}
                              className="h-9 text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Customer Type</Label>
                            <Controller
                              control={form.control}
                              name="customerType"
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className="w-full h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="business">Business</SelectItem>
                                    <SelectItem value="individual">Individual</SelectItem>
                                    <SelectItem value="government">Government</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1.5">
                              <Label htmlFor="conv-gstin" className="text-xs font-semibold">
                                GSTIN (optional)
                              </Label>
                              <Input
                                id="conv-gstin"
                                {...form.register("gstin")}
                                placeholder="24AAAAA0000A1Z5"
                                className="h-9 text-xs font-mono uppercase"
                              />
                              {form.formState.errors.gstin && (
                                <p className="text-[11px] text-destructive">
                                  {form.formState.errors.gstin.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="conv-pan" className="text-xs font-semibold">
                                PAN (optional)
                              </Label>
                              <Input
                                id="conv-pan"
                                {...form.register("pan")}
                                placeholder="AAAAA0000A"
                                className="h-9 text-xs font-mono uppercase"
                              />
                              {form.formState.errors.pan && (
                                <p className="text-[11px] text-destructive">
                                  {form.formState.errors.pan.message}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Primary Contact Card */}
                      <div className="rounded-xl border bg-card p-4 space-y-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <UserRound className="size-3.5 text-primary" />
                          Primary Contact Person
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="conv-contactName" className="text-xs font-semibold">
                              Full Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="conv-contactName"
                              {...form.register("contactName")}
                              className="h-9 text-sm"
                            />
                            {form.formState.errors.contactName && (
                              <p className="text-[11px] text-destructive">
                                {form.formState.errors.contactName.message}
                              </p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="conv-contactJobTitle" className="text-xs font-semibold">
                              Designation / Role
                            </Label>
                            <Input
                              id="conv-contactJobTitle"
                              {...form.register("contactJobTitle")}
                              placeholder="Facility Manager"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="conv-contactPhone" className="text-xs font-semibold">
                              Phone
                            </Label>
                            <Input
                              id="conv-contactPhone"
                              {...form.register("contactPhone")}
                              className="h-9 text-sm"
                            />
                            {form.formState.errors.contactPhone && (
                              <p className="text-[11px] text-destructive">
                                {form.formState.errors.contactPhone.message}
                              </p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="conv-contactEmail" className="text-xs font-semibold">
                              Email
                            </Label>
                            <Input
                              id="conv-contactEmail"
                              type="email"
                              {...form.register("contactEmail")}
                              className="h-9 text-sm"
                            />
                            {form.formState.errors.contactEmail && (
                              <p className="text-[11px] text-destructive">
                                {form.formState.errors.contactEmail.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Optional Installation Site Card */}
                      <div className="rounded-xl border bg-card p-4 space-y-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Controller
                              control={form.control}
                              name="includeSite"
                              render={({ field }) => (
                                <Checkbox
                                  id="conv-includeSite"
                                  checked={field.value}
                                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                                />
                              )}
                            />
                            <Label
                              htmlFor="conv-includeSite"
                              className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              <MapPin className="size-3.5 text-primary" />
                              Create Installation / Project Site
                            </Label>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {includeSite ? "Enabled" : "Skipped"}
                          </Badge>
                        </div>

                        {includeSite && (
                          <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="conv-siteName" className="text-xs font-semibold">
                                Site Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="conv-siteName"
                                {...form.register("siteName")}
                                className="h-9 text-sm"
                              />
                              {form.formState.errors.siteName && (
                                <p className="text-[11px] text-destructive">
                                  {form.formState.errors.siteName.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="conv-siteCity" className="text-xs font-semibold">
                                City <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="conv-siteCity"
                                {...form.register("siteCity")}
                                placeholder="Ahmedabad"
                                className="h-9 text-sm"
                              />
                              {form.formState.errors.siteCity && (
                                <p className="text-[11px] text-destructive">
                                  {form.formState.errors.siteCity.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label htmlFor="conv-siteAddress" className="text-xs font-semibold">
                                Street Address <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="conv-siteAddress"
                                {...form.register("siteAddressLine1")}
                                className="h-9 text-sm"
                              />
                              {form.formState.errors.siteAddressLine1 && (
                                <p className="text-[11px] text-destructive">
                                  {form.formState.errors.siteAddressLine1.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="conv-siteState" className="text-xs font-semibold">
                                State
                              </Label>
                              <Input
                                id="conv-siteState"
                                {...form.register("siteState")}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="conv-sitePostalCode" className="text-xs font-semibold">
                                Postal Code
                              </Label>
                              <Input
                                id="conv-sitePostalCode"
                                {...form.register("sitePostalCode")}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="existing" className="mt-4 space-y-4">
                      <div className="rounded-xl border bg-card p-4 space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            Customer Account <span className="text-destructive">*</span>
                          </Label>
                          <Controller
                            control={form.control}
                            name="customerId"
                            render={({ field }) => (
                              <Select
                                value={field.value || undefined}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  form.setValue("primaryContactId", "");
                                  form.setValue("siteId", "");
                                }}
                              >
                                <SelectTrigger className="w-full h-9 text-xs">
                                  <SelectValue placeholder="Choose customer account…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {customers.data?.items
                                    .filter((item) => item.status === "active")
                                    .map((item) => (
                                      <SelectItem key={item.id} value={item.id} className="text-xs">
                                        {item.displayName}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {form.formState.errors.customerId && (
                            <p className="text-[11px] text-destructive">
                              {form.formState.errors.customerId.message}
                            </p>
                          )}
                        </div>

                        <div className="grid gap-3.5 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">
                              Primary Contact Person <span className="text-destructive">*</span>
                            </Label>
                            <Controller
                              control={form.control}
                              name="primaryContactId"
                              render={({ field }) => (
                                <Select
                                  disabled={!selectedCustomer.data}
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger className="w-full h-9 text-xs">
                                    <SelectValue
                                      placeholder={
                                        selectedCustomer.data
                                          ? "Choose primary contact…"
                                          : "Select customer first"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {selectedCustomer.data?.contacts
                                      .filter((c) => c.status === "active")
                                      .map((c) => (
                                        <SelectItem key={c.id} value={c.id} className="text-xs">
                                          {c.name} {c.phone ? `· ${c.phone}` : ""}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {form.formState.errors.primaryContactId && (
                              <p className="text-[11px] text-destructive">
                                {form.formState.errors.primaryContactId.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Customer Site (optional)</Label>
                            <Controller
                              control={form.control}
                              name="siteId"
                              render={({ field }) => (
                                <Select
                                  disabled={!selectedCustomer.data}
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger className="w-full h-9 text-xs">
                                    <SelectValue
                                      placeholder={
                                        selectedCustomer.data
                                          ? "Choose site (optional)…"
                                          : "Select customer first"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {selectedCustomer.data?.sites
                                      .filter((s) => s.status === "active")
                                      .map((s) => (
                                        <SelectItem key={s.id} value={s.id} className="text-xs">
                                          {s.name} ({s.city})
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                        </div>

                        {selectedCustomer.data && (
                          <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">
                                {selectedCustomer.data.displayName}
                              </span>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {selectedCustomer.data.customerType}
                              </Badge>
                            </div>
                            {matchedContact && (
                              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <UserRound className="size-3" /> {matchedContact.name}
                                </span>
                                {matchedContact.phone && (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="size-3" /> {matchedContact.phone}
                                  </span>
                                )}
                                {matchedContact.email && (
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="size-3" /> {matchedContact.email}
                                  </span>
                                )}
                              </div>
                            )}
                            {matchedSite && (
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <MapPin className="size-3 shrink-0" />
                                {matchedSite.name} — {matchedSite.addressLine1}, {matchedSite.city}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Right Column: Opportunity Details & Drag-and-Drop Documents */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      2
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">
                      Opportunity Brief &amp; Client Documents
                    </h3>
                  </div>

                  {/* Opportunity Details Card */}
                  <div className="rounded-xl border bg-card p-4 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <BriefcaseBusiness className="size-3.5 text-primary" />
                      Opportunity Details
                    </p>

                    <div className="space-y-1.5">
                      <Label htmlFor="conv-title" className="text-xs font-semibold">
                        Opportunity Title <span className="text-destructive">*</span>
                      </Label>
                      <Input id="conv-title" {...form.register("title")} className="h-9 text-sm" />
                      {form.formState.errors.title && (
                        <p className="text-[11px] text-destructive">
                          {form.formState.errors.title.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="conv-notes" className="text-xs font-semibold">
                          Qualification Notes <span className="text-destructive">*</span>
                        </Label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {watchedNotes.trim().length}/1000
                        </span>
                      </div>
                      <Textarea
                        id="conv-notes"
                        rows={4}
                        {...form.register("qualificationNotes")}
                        placeholder="Scope summary, fire protection systems required, site constraints, target schedule…"
                        className="text-sm"
                      />
                      {form.formState.errors.qualificationNotes && (
                        <p className="text-[11px] text-destructive">
                          {form.formState.errors.qualificationNotes.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Opportunity Documents Drag & Drop Card */}
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Paperclip className="size-3.5 text-primary" />
                          Opportunity Documents (Optional)
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Shared automatically with assigned Design Head &amp; Engineers. More files can be uploaded later.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                        {files.length}/10
                      </Badge>
                    </div>

                    <FileDropzone
                      id="convert-lead-files"
                      label="Drag & drop drawings, RFPs, or site photos here"
                      hint="PDF, JPEG, or PNG up to 20 MiB each (max 10 files)"
                      accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                      allowedMimeTypes={ALLOWED_MIME_TYPES}
                      allowedExtensions={ALLOWED_EXTENSIONS}
                      maxFileBytes={MAX_FILE_BYTES}
                      maxFiles={10}
                      files={files}
                      onFilesChange={setFiles}
                    />
                  </div>

                  {conversion.isError && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-xs">
                        {getApiErrorMessage(conversion.error)}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </div>

            <SheetFooter className="border-t bg-card px-6 py-4 flex-row flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary shrink-0" />
                <span>
                  {mode === "new" ? "Creates new customer + contact" : "Links existing customer"}
                  {files.length > 0
                    ? ` · ${files.length} document${files.length === 1 ? "" : "s"} queued`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={conversion.isPending}>
                  {conversion.isPending ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Converting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 mr-2" />
                      Convert Lead to Opportunity
                    </>
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
