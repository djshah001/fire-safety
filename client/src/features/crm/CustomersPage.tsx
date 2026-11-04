import { useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  Building2,
  FileUp,
  Loader2,
  Plus,
  ShieldCheck,
  Building,
  UserCheck,
  MapPin,
  CircleDot,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import {
  createCustomer,
  customersQuery,
  type CustomerSummary,
  type DuplicateHint,
  type MasterStatus,
} from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import {
  ServerDataTable,
  type ServerColumn,
} from "@/components/data-table/ServerDataTable";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmImportDialog } from "@/features/crm/CrmImportDialog";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    displayName: z.string().trim().min(2, "Enter the customer name.").max(160),
    legalName: z.string().trim().max(200),
    customerType: z.enum(["business", "individual", "government", "other"]),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (value) =>
          !value ||
          /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value),
        "Enter a valid 15-character GSTIN.",
      ),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (value) => !value || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value),
        "Enter a valid 10-character PAN.",
      ),
    contactName: z
      .string()
      .trim()
      .min(2, "Enter the primary contact name.")
      .max(120),
    jobTitle: z.string().trim().max(100),
    phone: z.string().trim().max(30),
    email: z.union([
      z.string().email("Enter a valid email address."),
      z.literal(""),
    ]),
    billingAddress: z.string().trim().max(200),
    billingCity: z.string().trim().max(100),
    billingState: z.string().trim().max(100),
    billingPostalCode: z.string().trim().max(20),
    billingCountry: z.string().trim().max(100),
    siteName: z.string().trim().max(120),
    siteAddress: z.string().trim().max(200),
    siteCity: z.string().trim().max(100),
  })
  .refine((value) => value.phone || value.email, {
    message: "Provide a contact phone number or email address.",
    path: ["phone"],
  })
  .refine((value) => !value.siteName || (value.siteAddress && value.siteCity), {
    message: "Address and city are required when adding a site.",
    path: ["siteAddress"],
  })
  .refine((value) => !value.billingAddress || value.billingCity, {
    message: "City is required when adding a billing address.",
    path: ["billingCity"],
  });

type Fields = z.infer<typeof schema>;

export function CustomersPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canManage = user.permissions.includes("crm.customer_master.manage");

  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateHint[]>([]);

  const search = searchParams.get("search") ?? "";
  const status = (
    ["active", "inactive"].includes(searchParams.get("status") ?? "")
      ? searchParams.get("status")
      : undefined
  ) as MasterStatus | undefined;

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(
    Number(searchParams.get("pageSize")),
  )
    ? Number(searchParams.get("pageSize"))
    : 20;

  const sort = (
    ["name", "status", "updatedAt"].includes(searchParams.get("sort") ?? "")
      ? searchParams.get("sort")
      : "name"
  ) as "name" | "status" | "updatedAt";

  const direction = searchParams.get("direction") === "desc" ? "desc" : "asc";

  const customers = useQuery(
    customersQuery({
      search: search || undefined,
      status,
      page,
      pageSize,
      sort,
      direction,
    }),
  );

  const queryClient = useQueryClient();

  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      legalName: "",
      customerType: "business",
      gstin: "",
      pan: "",
      contactName: "",
      jobTitle: "",
      phone: "",
      email: "",
      billingAddress: "",
      billingCity: "",
      billingState: "",
      billingPostalCode: "",
      billingCountry: "India",
      siteName: "",
      siteAddress: "",
      siteCity: "",
    },
  });

  const creation = useMutation({
    mutationFn: (values: Fields) =>
      createCustomer({
        displayName: values.displayName,
        legalName: values.legalName || undefined,
        customerType: values.customerType,
        gstin: values.gstin || undefined,
        pan: values.pan || undefined,
        contacts: [
          {
            name: values.contactName,
            jobTitle: values.jobTitle || undefined,
            phone: values.phone || undefined,
            email: values.email || undefined,
            isPrimary: true,
          },
        ],
        addresses: values.billingAddress
          ? [
              {
                label: "Billing",
                addressLine1: values.billingAddress,
                city: values.billingCity,
                state: values.billingState || undefined,
                postalCode: values.billingPostalCode || undefined,
                country: values.billingCountry || undefined,
              },
            ]
          : [],
        sites: values.siteName
          ? [
              {
                name: values.siteName,
                addressLine1: values.siteAddress,
                city: values.siteCity,
              },
            ]
          : [],
      }),
    async onSuccess(result) {
      setDuplicates(result.duplicateHints);
      await queryClient.invalidateQueries({ queryKey: ["crm", "customers"] });
      toast.success("Customer created successfully.");
      form.reset();
      if (result.duplicateHints.length === 0) setShowCreate(false);
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  function updateFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  }

  const columns: Array<ServerColumn<CustomerSummary, typeof sort>> = [
    {
      key: "name",
      label: "Customer / Legal Entity",
      sort: "name",
      className: "min-w-[260px]",
      cell: (customer) => (
        <div className="space-y-0.5">
          <Link
            to={`/crm/customers/${customer.id}`}
            className="font-semibold text-xs text-foreground hover:text-primary transition-colors block"
          >
            {customer.displayName}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{customer.legalName || "No separate legal name"}</span>
            {customer.gstin && (
              <>
                <span>•</span>
                <span className="font-mono text-[10.5px]">
                  GSTIN: {customer.gstin}
                </span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sort: "status",
      className: "min-w-[100px]",
      cell: (customer) => <StatusBadge status={customer.status} />,
    },
    {
      key: "updated",
      label: "Updated",
      sort: "updatedAt",
      className: "tabular-nums text-xs font-mono text-muted-foreground",
      cell: (customer) => new Date(customer.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            CRM Masters
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Customers Directory
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground leading-relaxed">
            Contacts and sites remain visible only through assigned project work
            or an explicit access grant.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setShowImport(true)}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
            >
              <FileUp className="size-3.5 mr-1" />
              Import
            </Button>
            <Button
              onClick={() => {
                setDuplicates([]);
                form.reset();
                setShowCreate(true);
              }}
              type="button"
              size="sm"
              className="h-8 text-xs"
            >
              <Plus className="size-3.5 mr-1" />
              Add Customer
            </Button>
          </div>
        )}
      </div>

      {/* Toolbar Filters */}
      <div className="mt-6">
        <ListToolbar
          search={search}
          onSearch={(value) => updateFilter("search", value)}
          activeFilters={status ? 1 : 0}
          onClear={() => updateFilter("status", "")}
        >
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Filter by Status</Label>
            <Select
              onValueChange={(value) =>
                updateFilter("status", value === "all" ? "" : value)
              }
              value={status ?? "all"}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ListToolbar>
      </div>

      {/* Server Data Table Card */}
      <section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-xs">
        {customers.isError ? (
          <Alert className="m-4" variant="destructive">
            <AlertDescription className="text-xs">
              {getApiErrorMessage(customers.error)}
            </AlertDescription>
          </Alert>
        ) : (
          <ServerDataTable
            columns={columns}
            rows={customers.data?.items ?? []}
            rowKey={(item) => item.id}
            loading={customers.isPending}
            empty={
              <div className="text-center py-8">
                <Building2 className="mx-auto size-7 text-muted-foreground/40 mb-2" />
                <p className="text-xs font-medium text-foreground">
                  No customers found
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Try adjusting your search criteria or add a new customer.
                </p>
              </div>
            }
            sort={sort}
            direction={direction}
            onSort={(nextSort, nextDirection) => {
              const next = new URLSearchParams(searchParams);
              next.set("sort", nextSort);
              next.set("direction", nextDirection);
              next.delete("page");
              setSearchParams(next, { replace: true });
            }}
            page={page}
            pageSize={pageSize}
            total={customers.data?.total ?? 0}
            onPageChange={(nextPage) => updateFilter("page", String(nextPage))}
            onPageSizeChange={(nextSize) => {
              const next = new URLSearchParams(searchParams);
              next.set("pageSize", String(nextSize));
              next.set("page", "1");
              setSearchParams(next, { replace: true });
            }}
          />
        )}
      </section>

      {/* New Customer Dialog */}
      <Dialog onOpenChange={setShowCreate} open={showCreate}>
        <DialogContent className="max-h-[90vh] sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b shrink-0">
            <DialogTitle>New Customer Master Entry</DialogTitle>
            <DialogDescription className="text-xs">
              Create commercial & tax identity, assign a primary contact, and
              configure an initial project site.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit((values) => creation.mutate(values))}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Fieldset: Core Identification */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-1.5 border-b pb-1.5">
                  <Building className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Core Organization
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-displayName"
                      className="text-xs font-semibold"
                    >
                      Display / Trade Name{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cust-displayName"
                      className="h-9 text-sm"
                      placeholder="e.g. Reliance Industries Ltd."
                      {...form.register("displayName")}
                    />
                    {form.formState.errors.displayName && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.displayName.message}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-legalName"
                      className="text-xs font-semibold"
                    >
                      Legal Name (optional)
                    </Label>
                    <Input
                      id="cust-legalName"
                      className="h-9 text-sm"
                      placeholder="Registered legal corporate name"
                      {...form.register("legalName")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-type"
                      className="text-xs font-semibold"
                    >
                      Account Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={form.watch("customerType")}
                      onValueChange={(value) =>
                        form.setValue(
                          "customerType",
                          value as Fields["customerType"],
                          {
                            shouldValidate: true,
                          },
                        )
                      }
                    >
                      <SelectTrigger
                        id="cust-type"
                        className="h-9 text-xs w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="business" className="text-xs">
                          Business (Corporate / Enterprise)
                        </SelectItem>
                        <SelectItem value="individual" className="text-xs">
                          Individual
                        </SelectItem>
                        <SelectItem value="government" className="text-xs">
                          Government / PSU
                        </SelectItem>
                        <SelectItem value="other" className="text-xs">
                          Other
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-gstin"
                      className="text-xs font-semibold"
                    >
                      GSTIN (optional)
                    </Label>
                    <Input
                      id="cust-gstin"
                      className="h-9 text-sm font-mono uppercase"
                      maxLength={15}
                      placeholder="24ABCDE1234F1Z5"
                      {...form.register("gstin")}
                    />
                    {form.formState.errors.gstin && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.gstin.message}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cust-pan" className="text-xs font-semibold">
                      PAN Number (optional)
                    </Label>
                    <Input
                      id="cust-pan"
                      className="h-9 text-sm font-mono uppercase max-w-sm"
                      maxLength={10}
                      placeholder="ABCDE1234F"
                      {...form.register("pan")}
                    />
                    {form.formState.errors.pan && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.pan.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Fieldset: Primary Contact */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-1.5 border-b pb-1.5">
                  <UserCheck className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Primary Contact Person
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="cust-contactName"
                      className="text-xs font-semibold"
                    >
                      Contact Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cust-contactName"
                      className="h-9 text-sm"
                      placeholder="e.g. Rajesh Sharma"
                      {...form.register("contactName")}
                    />
                    {form.formState.errors.contactName && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.contactName.message}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-phone"
                      className="text-xs font-semibold"
                    >
                      Phone Number
                    </Label>
                    <Input
                      id="cust-phone"
                      className="h-9 text-sm"
                      inputMode="tel"
                      placeholder="+91 98765 43210"
                      {...form.register("phone")}
                    />
                    {form.formState.errors.phone && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.phone.message}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-email"
                      className="text-xs font-semibold"
                    >
                      Email Address
                    </Label>
                    <Input
                      id="cust-email"
                      className="h-9 text-sm"
                      type="email"
                      placeholder="rajesh@company.com"
                      {...form.register("email")}
                    />
                    {form.formState.errors.email && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.email.message}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="cust-jobTitle"
                      className="text-xs font-semibold"
                    >
                      Designation / Job Title (optional)
                    </Label>
                    <Input
                      id="cust-jobTitle"
                      className="h-9 text-sm"
                      placeholder="e.g. Procurement Head / Chief Engineer"
                      {...form.register("jobTitle")}
                    />
                  </div>
                </div>
              </div>

              {/* Fieldset: Billing Address */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-1.5 border-b pb-1.5">
                  <ShieldCheck className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Billing Address (optional)
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="cust-billAddr"
                      className="text-xs font-semibold"
                    >
                      Address Line
                    </Label>
                    <Input
                      id="cust-billAddr"
                      className="h-9 text-sm"
                      placeholder="Plot / Survey No., Complex, Road"
                      {...form.register("billingAddress")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-billCity"
                      className="text-xs font-semibold"
                    >
                      City
                    </Label>
                    <Input
                      id="cust-billCity"
                      className="h-9 text-sm"
                      placeholder="Vadodara"
                      {...form.register("billingCity")}
                    />
                    {form.formState.errors.billingCity && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.billingCity.message}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-billState"
                      className="text-xs font-semibold"
                    >
                      State
                    </Label>
                    <Input
                      id="cust-billState"
                      className="h-9 text-sm"
                      placeholder="Gujarat"
                      {...form.register("billingState")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-billPin"
                      className="text-xs font-semibold"
                    >
                      Postal Code
                    </Label>
                    <Input
                      id="cust-billPin"
                      className="h-9 text-sm font-mono"
                      placeholder="390001"
                      {...form.register("billingPostalCode")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-billCountry"
                      className="text-xs font-semibold"
                    >
                      Country
                    </Label>
                    <Input
                      id="cust-billCountry"
                      className="h-9 text-sm"
                      {...form.register("billingCountry")}
                    />
                  </div>
                </div>
              </div>

              {/* Fieldset: First Project Site */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-1.5 border-b pb-1.5">
                  <MapPin className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    First Project Site (optional)
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-siteName"
                      className="text-xs font-semibold"
                    >
                      Site Label / Branch Name
                    </Label>
                    <Input
                      id="cust-siteName"
                      className="h-9 text-sm"
                      placeholder="e.g. Petrochem Plant Unit-4"
                      {...form.register("siteName")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="cust-siteCity"
                      className="text-xs font-semibold"
                    >
                      Site City
                    </Label>
                    <Input
                      id="cust-siteCity"
                      className="h-9 text-sm"
                      placeholder="Dahej"
                      {...form.register("siteCity")}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="cust-siteAddr"
                      className="text-xs font-semibold"
                    >
                      Site Address Line
                    </Label>
                    <Input
                      id="cust-siteAddr"
                      className="h-9 text-sm"
                      placeholder="Full site location or GIDC plot"
                      {...form.register("siteAddress")}
                    />
                    {form.formState.errors.siteAddress && (
                      <span className="text-[11px] text-destructive block">
                        {form.formState.errors.siteAddress.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Duplicate Warnings */}
              {duplicates.length > 0 && (
                <Alert className="bg-amber-500/10 border-amber-500/20">
                  <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Possible duplicates detected (records were not merged)
                  </AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground mt-1">
                    <ul className="list-disc pl-4 space-y-0.5">
                      {duplicates.map((item) => (
                        <li key={`${item.type}-${item.id}`}>
                          {item.label} — {item.reason}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {creation.isError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    {getApiErrorMessage(creation.error)}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Pinned Dialog Footer */}
            <DialogFooter className="p-4 border-t bg-card shrink-0">
              <Button
                onClick={() => setShowCreate(false)}
                type="button"
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
              <Button disabled={creation.isPending} type="submit" size="sm">
                {creation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />{" "}
                    Creating…
                  </>
                ) : (
                  "Create Customer"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Controlled Excel Import Dialog */}
      <CrmImportDialog
        onCommitted={() =>
          queryClient.invalidateQueries({ queryKey: ["crm", "customers"] })
        }
        onOpenChange={setShowImport}
        open={showImport}
        type="customers"
      />
    </main>
  );
}
