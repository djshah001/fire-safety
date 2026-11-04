import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Send,
  Copy,
  ExternalLink,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Search,
  ChevronsUpDown,
  Check,
  PackageSearch,
  Calendar,
  Building2,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  masterLookupsQuery,
  vendorLookupsQuery,
  type Item,
  type Vendor,
} from "@/api/masters";
import {
  useCreatePriceInquiry,
  useInviteVendor,
  useSendMsg91,
  type InquiryItem,
  type PriceInquiry,
  type PriceInquiryInvitation,
} from "@/api/priceInquiry";

// Zod Schema for React Hook Form
const inquiryItemSchema = z.object({
  itemId: z.string().optional(),
  itemName: z.string().trim().min(1, "Item name is required"),
  itemCode: z.string().optional(),
  unit: z.string().trim().min(1, "Unit is required"),
  quantity: z
    .string()
    .trim()
    .min(1, "Quantity is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Must be a number > 0"),
  specification: z.string().optional(),
  eligibleBrands: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        code: z.string().optional(),
      }),
    )
    .optional(),
});

const inquiryFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Inquiry title is required")
    .max(200, "Title cannot exceed 200 characters"),
  description: z.string().optional(),
  responseDueDate: z.string().optional(),
  items: z
    .array(inquiryItemSchema)
    .min(1, "Add at least one item to this price inquiry"),
});

type InquiryFormValues = z.infer<typeof inquiryFormSchema>;

export interface PriceInquirySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItems?: InquiryItem[];
  defaultTitle?: string;
  onInquiryCreated?: (inquiry: PriceInquiry) => void;
}

export function PriceInquirySheet({
  open,
  onOpenChange,
  initialItems,
  defaultTitle,
  onInquiryCreated,
}: PriceInquirySheetProps) {
  const [step, setStep] = useState<"create" | "invite">("create");
  const [createdInquiry, setCreatedInquiry] = useState<PriceInquiry | null>(
    null,
  );

  // Combobox popover states
  const [catalogueComboboxOpen, setCatalogueComboboxOpen] = useState(false);
  const [vendorComboboxOpen, setVendorComboboxOpen] = useState(false);

  // Invite form state
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [sendMsg91, setSendMsg91] = useState(false);
  const [invitations, setInvitations] = useState<
    Array<{
      invitation: PriceInquiryInvitation;
      vendorName: string;
      submissionUrl: string;
    }>
  >([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Queries
  const itemsQuery = useQuery(masterLookupsQuery("items"));
  const vendorsQuery = useQuery(vendorLookupsQuery());

  // Mutations
  const createMutation = useCreatePriceInquiry();
  const inviteMutation = useInviteVendor(createdInquiry?.id ?? "");
  const sendMsg91Mutation = useSendMsg91(createdInquiry?.id ?? "");

  // React Hook Form
  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: {
      title: defaultTitle || "",
      description: "",
      responseDueDate: "",
      items:
        initialItems && initialItems.length > 0
          ? initialItems.map((item) => ({
              itemId: item.itemId,
              itemName: item.itemName,
              itemCode: item.itemCode,
              unit: item.unit || "NOS",
              quantity: item.quantity || "1",
              specification: item.specification || "",
            }))
          : [{ itemName: "", unit: "NOS", quantity: "1", specification: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Reset or initialize on open change
  useEffect(() => {
    if (open) {
      setStep("create");
      setCreatedInquiry(null);
      form.reset({
        title: defaultTitle || "",
        description: "",
        responseDueDate: "",
        items:
          initialItems && initialItems.length > 0
            ? initialItems.map((item) => ({
                itemId: item.itemId,
                itemName: item.itemName,
                itemCode: item.itemCode,
                unit: item.unit || "NOS",
                quantity: item.quantity || "1",
                specification: item.specification || "",
              }))
            : [{ itemName: "", unit: "NOS", quantity: "1", specification: "" }],
      });
      setSelectedVendorId("");
      setWhatsappNumber("");
      setSendMsg91(false);
      setInvitations([]);
      setCopiedToken(null);
      setCatalogueComboboxOpen(false);
      setVendorComboboxOpen(false);
    }
  }, [open, defaultTitle, initialItems, form]);

  const catalogueItems = (itemsQuery.data?.items as Item[] | undefined) ?? [];
  const vendorList = (vendorsQuery.data?.items as Vendor[] | undefined) ?? [];
  const selectedVendor = vendorList.find((v) => v.id === selectedVendorId);

  // Handle adding from catalogue
  function handleSelectCatalogueItem(item: Item) {
    append({
      itemId: item.id,
      itemName: item.name,
      itemCode: item.code || undefined,
      unit: item.unitSymbol || "NOS",
      quantity: "1",
      specification: item.specification || "",
      eligibleBrands: (item.brands ?? [])
        .filter((b) => b.status === "active")
        .map((b) => ({ id: b.id, name: b.name, code: b.code })),
    });
    setCatalogueComboboxOpen(false);
    toast.success(`Added "${item.name}" from catalogue`);
  }

  // Handle Form Submit for creating Price Inquiry
  async function onSubmit(data: InquiryFormValues) {
    try {
      const result = await createMutation.mutateAsync({
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        items: data.items.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName.trim(),
          itemCode: i.itemCode?.trim() || undefined,
          unit: i.unit.trim(),
          quantity: i.quantity.trim(),
          specification: i.specification?.trim() || undefined,
          eligibleBrands: i.eligibleBrands,
        })),
        responseDueDate: data.responseDueDate || undefined,
      });

      setCreatedInquiry(result);
      setStep("invite");
      onInquiryCreated?.(result);
      toast.success(
        `Price Inquiry ${result.inquiryCode} created successfully!`,
      );
    } catch {
      toast.error("Failed to create price inquiry. Please try again.");
    }
  }

  // Handle Vendor Invitation
  async function handleInvite() {
    if (!selectedVendorId) {
      toast.error("Please select a vendor to invite.");
      return;
    }

    try {
      const result = await inviteMutation.mutateAsync({
        vendorId: selectedVendorId,
        whatsappNumber: whatsappNumber.trim() || undefined,
        sendMsg91,
        expiryDays: 14,
      });

      const vendorName = selectedVendor?.displayName ?? "Vendor";
      setInvitations((prev) => [
        ...prev,
        {
          invitation: result.invitation,
          vendorName,
          submissionUrl: result.submissionUrl,
        },
      ]);

      if (result.msg91Result?.success) {
        toast.success(`WhatsApp invitation sent to ${vendorName} via MSG91!`);
      } else if (result.msg91Result && !result.msg91Result.success) {
        toast.warning(
          `MSG91 notice: ${result.msg91Result.error || "Delivery pending"}. You can also copy the link or share via WhatsApp Web.`,
        );
      } else {
        toast.success(
          `Invitation generated for ${vendorName}. Share the price link!`,
        );
      }

      // Reset invite selection
      setSelectedVendorId("");
      setWhatsappNumber("");
      setSendMsg91(false);
    } catch {
      toast.error("Failed to invite vendor.");
    }
  }

  async function copyLink(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      toast.success("Submission link copied to clipboard!");
      setTimeout(() => setCopiedToken(null), 2500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  async function retryMsg91(invitationId: string) {
    try {
      const res = await sendMsg91Mutation.mutateAsync(invitationId);
      if (res.success) {
        toast.success("WhatsApp message delivered via MSG91.");
      } else {
        toast.error(res.error || "Failed to deliver via MSG91.");
      }
    } catch {
      toast.error("Failed to retry MSG91 send.");
    }
  }

  function openWhatsAppWeb(
    vendorName: string,
    phone: string | null | undefined,
    url: string,
  ) {
    const text = encodeURIComponent(
      `Hello ${vendorName}, please provide your best prices for the items requested in our inquiry: ${url}`,
    );
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const href = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  // Framer motion variants for staggered vendor list
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-5xl sm:max-h-none h-full flex flex-col p-0 gap-0 border-l bg-background shadow-2xl"
      >
        {/* Pinned Header */}
        <SheetHeader className="px-6 py-4 border-b bg-card shrink-0 pr-14">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg font-semibold tracking-tight">
                  {step === "create"
                    ? "New Vendor Price Inquiry"
                    : `Invite Vendors — ${createdInquiry?.inquiryCode}`}
                </SheetTitle>
                <Badge
                  variant={step === "create" ? "default" : "secondary"}
                  className="text-[11px] font-medium"
                >
                  {step === "create" ? "Step 1: Items" : "Step 2: Invitations"}
                </Badge>
              </div>
              <SheetDescription className="text-xs text-muted-foreground">
                {step === "create"
                  ? "Select items from the catalogue or enter custom items with quantities to collect comparative quotes from vendors."
                  : "Invite vendors via MSG91 WhatsApp or share self-fill links for rapid price submissions."}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {step === "create" ? (
            <form
              id="price-inquiry-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
            >
              {/* Inquiry Basic Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="pi-title" className="text-xs font-semibold">
                    Inquiry Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pi-title"
                    placeholder="e.g. Fire Alarm Control Panels & Detectors Q4"
                    {...form.register("title")}
                    className={cn(
                      form.formState.errors.title &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  {form.formState.errors.title && (
                    <p className="text-[11px] text-destructive">
                      {form.formState.errors.title.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pi-due" className="text-xs font-semibold">
                    Response Due Date
                  </Label>
                  <div className="relative">
                    <Input
                      id="pi-due"
                      type="date"
                      {...form.register("responseDueDate")}
                    />
                    <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pi-desc" className="text-xs font-semibold">
                  Instructions / Specifications for Vendors (optional)
                </Label>
                <Textarea
                  id="pi-desc"
                  placeholder="Provide delivery location, required warranty, payment terms, or technical requirements…"
                  rows={2}
                  {...form.register("description")}
                />
              </div>

              <Separator />

              {/* Items Section */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Line Items for Pricing{" "}
                      <span className="text-destructive">*</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Pick from the verified catalogue or enter custom items
                      below.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        itemName: "",
                        unit: "NOS",
                        quantity: "1",
                        specification: "",
                      })
                    }
                    className="shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add custom item
                  </Button>
                </div>

                {/* Searchable Catalogue Combobox */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Quick Add from Database Catalogue
                  </Label>
                  <Popover
                    open={catalogueComboboxOpen}
                    onOpenChange={setCatalogueComboboxOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={catalogueComboboxOpen}
                        className="w-full justify-between font-normal text-muted-foreground hover:text-foreground h-9"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>Search catalogue by item name or code…</span>
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] min-w-[340px] p-0 shadow-lg"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Type to search items…" />
                        <CommandList>
                          <CommandEmpty>
                            No catalogue items match your search.
                          </CommandEmpty>
                          <CommandGroup heading="Catalogue Items">
                            {catalogueItems.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.name} ${item.code ?? ""}`}
                                onSelect={() => handleSelectCatalogueItem(item)}
                                className="cursor-pointer"
                              >
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="font-medium text-sm truncate">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {item.code ? `[${item.code}] • ` : ""}
                                    {item.unitSymbol || "Unit"}
                                    {item.specification
                                      ? ` • ${item.specification}`
                                      : ""}
                                  </span>
                                </div>
                                <Plus className="ml-2 h-4 w-4 text-primary shrink-0 opacity-70 group-hover:opacity-100" />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Validation summary error */}
                {form.formState.errors.items?.root && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.items.root.message}
                  </p>
                )}

                {/* Empty State */}
                {fields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed border-muted text-center bg-muted/10">
                    <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
                      <PackageSearch className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-semibold">
                      No items in this inquiry yet
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      Select items using the catalogue search above or click
                      below to add a custom item.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        append({
                          itemName: "",
                          unit: "NOS",
                          quantity: "1",
                          specification: "",
                        })
                      }
                      className="mt-4"
                    >
                      <Plus className="h-4 w-4 mr-1.5" /> Add custom item
                    </Button>
                  </div>
                ) : (
                  /* Two-Tier Item Rows with Framer Motion */
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {fields.map((field, index) => {
                        const itemError = form.formState.errors.items?.[index];
                        return (
                          <motion.div
                            key={field.id}
                            initial={{ opacity: 0, height: 0, y: -8 }}
                            animate={{ opacity: 1, height: "auto", y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -8 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="rounded-lg border bg-card/70 p-3.5 space-y-2.5 transition-all hover:border-primary/40 focus-within:border-primary/50 shadow-2xs">
                              {/* Top Tier: Name, Qty, Unit, Delete */}
                              <div className="flex items-start gap-2.5">
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground">
                                    Item Name{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    placeholder="e.g. Smoke Detector Optical Type"
                                    {...form.register(
                                      `items.${index}.itemName`,
                                    )}
                                    className={cn(
                                      "h-9 text-sm",
                                      itemError?.itemName &&
                                        "border-destructive focus-visible:ring-destructive",
                                    )}
                                  />
                                  {itemError?.itemName && (
                                    <p className="text-[11px] text-destructive">
                                      {itemError.itemName.message}
                                    </p>
                                  )}
                                </div>

                                <div className="w-24 shrink-0 space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground">
                                    Qty{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    placeholder="10"
                                    {...form.register(
                                      `items.${index}.quantity`,
                                    )}
                                    className={cn(
                                      "h-9 text-sm text-right tabular-nums",
                                      itemError?.quantity &&
                                        "border-destructive focus-visible:ring-destructive",
                                    )}
                                  />
                                  {itemError?.quantity && (
                                    <p className="text-[11px] text-destructive">
                                      {itemError.quantity.message}
                                    </p>
                                  )}
                                </div>

                                <div className="w-24 shrink-0 space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground">
                                    Unit{" "}
                                    <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    placeholder="NOS"
                                    {...form.register(`items.${index}.unit`)}
                                    className={cn(
                                      "h-9 text-sm",
                                      itemError?.unit &&
                                        "border-destructive focus-visible:ring-destructive",
                                    )}
                                  />
                                  {itemError?.unit && (
                                    <p className="text-[11px] text-destructive">
                                      {itemError.unit.message}
                                    </p>
                                  )}
                                </div>

                                <div className="pt-6 shrink-0">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                          onClick={() => remove(index)}
                                          disabled={fields.length <= 1}
                                          aria-label="Remove item"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Remove item
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </div>

                              {/* Bottom Tier: Full-width specification / brand / model */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[11px] text-muted-foreground font-normal">
                                    Specification / Requirement (optional)
                                  </Label>
                                  {(fields[index]?.eligibleBrands?.length ?? 0) > 0 && (
                                    <span className="text-[10px] text-primary font-medium">
                                      Approved makes: {fields[index]?.eligibleBrands?.map((b) => b.name).join(", ")}
                                    </span>
                                  )}
                                </div>
                                <Input
                                  placeholder="e.g. UL Listed, System Sensor or Apollo equivalent, with mounting base"
                                  {...form.register(
                                    `items.${index}.specification`,
                                  )}
                                  className="h-8 text-xs text-muted-foreground bg-muted/20"
                                />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </form>
          ) : (
            /* Step 2: Invite Vendors */
            <div className="space-y-6">
              {/* Summary card */}
              {createdInquiry && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Inquiry Code: {createdInquiry.inquiryCode}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {(createdInquiry.items as InquiryItem[]).length} Item(s)
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Title: <strong>{createdInquiry.title}</strong>
                  </p>
                </div>
              )}

              {/* Invite vendor card with Searchable Combobox */}
              <div className="rounded-xl border p-4 space-y-4 bg-card shadow-xs">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">
                    Invite a Vendor for Quote
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Searchable Vendor Combobox */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Select Vendor <span className="text-destructive">*</span>
                    </Label>
                    <Popover
                      open={vendorComboboxOpen}
                      onOpenChange={setVendorComboboxOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={vendorComboboxOpen}
                          className="w-full justify-between font-normal text-muted-foreground hover:text-foreground h-9"
                        >
                          <span className="truncate">
                            {selectedVendor
                              ? `${selectedVendor.displayName} (${selectedVendor.code})`
                              : "Choose vendor…"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0 shadow-lg"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder="Search vendor by name or code…" />
                          <CommandList>
                            <CommandEmpty>No vendors found.</CommandEmpty>
                            <CommandGroup heading="Active Vendors">
                              {vendorList.map((v) => (
                                <CommandItem
                                  key={v.id}
                                  value={`${v.displayName} ${v.code} ${v.tradeName ?? ""}`}
                                  onSelect={() => {
                                    setSelectedVendorId(v.id);
                                    if (v.primaryContact?.phone) {
                                      setWhatsappNumber(v.primaryContact.phone);
                                    }
                                    setVendorComboboxOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedVendorId === v.id
                                        ? "opacity-100 text-primary"
                                        : "opacity-0",
                                    )}
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-sm truncate">
                                      {v.displayName}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {v.code} • {v.vendorType}
                                      {v.gstStatus === "registered"
                                        ? " • GST Registered"
                                        : ""}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* WhatsApp Mobile Number */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      WhatsApp / Mobile Number
                    </Label>
                    <Input
                      placeholder="+91 98765 43210"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* MSG91 Checkbox using proper Shadcn primitive */}
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="send-msg91-inquiry"
                    checked={sendMsg91}
                    onCheckedChange={(checked) => setSendMsg91(!!checked)}
                  />
                  <Label
                    htmlFor="send-msg91-inquiry"
                    className="text-xs font-normal cursor-pointer leading-tight text-foreground"
                  >
                    Send automated WhatsApp invitation via MSG91 template
                  </Label>
                </div>

                <Button
                  type="button"
                  onClick={handleInvite}
                  disabled={inviteMutation.isPending || !selectedVendorId}
                  className="w-full sm:w-auto"
                >
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                      Generating Invitation…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" /> Generate Link & Invite
                    </>
                  )}
                </Button>
              </div>

              {/* Staggered Vendor List with Framer Motion and Pulsing Status Indicators */}
              {invitations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      Invited Vendors ({invitations.length})
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      Real-time status
                    </span>
                  </div>

                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-2 max-h-72 overflow-y-auto pr-1"
                  >
                    {invitations.map(
                      ({ invitation, vendorName, submissionUrl }) => (
                        <motion.div
                          key={invitation.id}
                          variants={cardVariants}
                          className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-3 text-sm gap-2 bg-card hover:bg-muted/10 transition-colors"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              {/* Pulsing Status Dots */}
                              {invitation.status === "responded" ? (
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                </span>
                              ) : invitation.status === "sent" ? (
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/50" />
                              )}

                              <p className="font-medium text-foreground text-sm">
                                {vendorName}
                              </p>
                              <Badge
                                variant={
                                  invitation.status === "responded"
                                    ? "default"
                                    : invitation.status === "sent"
                                      ? "secondary"
                                      : "outline"
                                }
                                className="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold"
                              >
                                {invitation.status}
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {submissionUrl}
                            </p>
                          </div>

                          {/* Accessible Action Buttons wrapped with Tooltips */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      copyLink(submissionUrl, invitation.token)
                                    }
                                    className="h-8 text-xs px-2.5"
                                  >
                                    {copiedToken === invitation.token ? (
                                      <>
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />{" "}
                                        Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3.5 w-3.5 mr-1" />{" "}
                                        Copy Link
                                      </>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Copy self-submission link to clipboard
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                    aria-label="Open in WhatsApp Web"
                                    onClick={() =>
                                      openWhatsAppWeb(
                                        vendorName,
                                        invitation.whatsappNumber,
                                        submissionUrl,
                                      )
                                    }
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Open chat in WhatsApp Web
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    aria-label="Preview public price submission page"
                                    onClick={() =>
                                      window.open(submissionUrl, "_blank")
                                    }
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Preview vendor submission page
                                </TooltipContent>
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
                                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                      aria-label="Retry automated MSG91 send"
                                      onClick={() => retryMsg91(invitation.id)}
                                      disabled={sendMsg91Mutation.isPending}
                                    >
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Retry MSG91 WhatsApp send
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </motion.div>
                      ),
                    )}
                  </motion.div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pinned Footer */}
        <SheetFooter className="px-6 py-4 border-t bg-card shrink-0 flex flex-row items-center justify-between sm:justify-between gap-3">
          {step === "create" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="price-inquiry-form"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
                  </>
                ) : (
                  "Create Inquiry & Invite Vendors →"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("create")}
              >
                ← Back to Edit Items
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
