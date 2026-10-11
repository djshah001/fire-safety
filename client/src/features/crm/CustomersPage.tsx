import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileUp, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { z } from "zod";
import type { CurrentUser } from "@/api/auth";
import { createCustomer, customersQuery, type CustomerSummary, type DuplicateHint, type MasterStatus } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import { ServerDataTable, type ServerColumn } from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrmImportDialog } from "@/features/crm/CrmImportDialog";

const schema = z
  .object({
    displayName: z.string().trim().min(2, "Enter the customer name.").max(160),
    legalName: z.string().trim().max(200),
    contactName: z
      .string()
      .trim()
      .min(2, "Enter the primary contact.")
      .max(120),
    phone: z.string().trim().max(30),
    email: z.union([z.email("Enter a valid email."), z.literal("")]),
    siteName: z.string().trim().max(120),
    siteAddress: z.string().trim().max(200),
    siteCity: z.string().trim().max(100),
  })
  .refine((value) => value.phone || value.email, {
    message: "Provide a phone number or email.",
    path: ["phone"],
  })
  .refine((value) => !value.siteName || (value.siteAddress && value.siteCity), {
    message: "Address and city are required when adding a site.",
    path: ["siteAddress"],
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
  const status = (["active", "inactive"].includes(searchParams.get("status") ?? "") ? searchParams.get("status") : undefined) as MasterStatus | undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(searchParams.get("pageSize"))) ? Number(searchParams.get("pageSize")) : 20;
  const sort = (["name", "status", "updatedAt"].includes(searchParams.get("sort") ?? "") ? searchParams.get("sort") : "name") as "name" | "status" | "updatedAt";
  const direction = searchParams.get("direction") === "desc" ? "desc" : "asc";
  const customers = useQuery(
    customersQuery({ search: search || undefined, status, page, pageSize, sort, direction }),
  );
  const queryClient = useQueryClient();
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      legalName: "",
      contactName: "",
      phone: "",
      email: "",
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
        contacts: [
          {
            name: values.contactName,
            phone: values.phone || undefined,
            email: values.email || undefined,
            isPrimary: true,
          },
        ],
        addresses: [],
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
      form.reset();
      if (result.duplicateHints.length === 0) setShowCreate(false);
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
    { key: "name", label: "Customer", sort: "name", className: "min-w-64", cell: (customer) => <Link className="font-medium hover:underline" to={`/crm/customers/${customer.id}`}>{customer.displayName}<span className="mt-1 block text-sm font-normal text-muted-foreground">{customer.legalName || "No separate legal name"}</span></Link> },
    { key: "status", label: "Status", sort: "status", cell: (customer) => <StatusBadge status={customer.status} /> },
    { key: "updated", label: "Updated", sort: "updatedAt", className: "tabular-nums", cell: (customer) => new Date(customer.updatedAt).toLocaleDateString() },
  ];

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">CRM</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Customers
          </h1>
          <p className="mt-2 text-muted-foreground">
            Contacts and sites remain visible only through assigned work or an
            explicit access grant.
          </p>
        </div>
        {canManage && <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowImport(true)} type="button" variant="outline"><FileUp /> Import</Button>
          <Button
            onClick={() => {
              setDuplicates([]);
              setShowCreate(true);
            }}
            type="button"
          >
            <Plus /> Add customer
          </Button>
        </div>}
      </div>

      <div className="mt-6"><ListToolbar search={search} onSearch={(value) => updateFilter("search", value)} activeFilters={status ? 1 : 0} onClear={() => updateFilter("status", "")}><div className="space-y-2"><Label>Status</Label><Select onValueChange={(value) => updateFilter("status", value === "all" ? "" : value)} value={status ?? "all"}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div></ListToolbar></div>

      <section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">{customers.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(customers.error)}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={customers.data?.items ?? []} rowKey={(item) => item.id} loading={customers.isPending} empty={<div><Building2 className="mx-auto mb-2" />No customers in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => { const next = new URLSearchParams(searchParams); next.set("sort", nextSort); next.set("direction", nextDirection); next.delete("page"); setSearchParams(next, { replace: true }); }} page={page} pageSize={pageSize} total={customers.data?.total ?? 0} onPageChange={(nextPage) => updateFilter("page", String(nextPage))} onPageSizeChange={(nextSize) => { const next = new URLSearchParams(searchParams); next.set("pageSize", String(nextSize)); next.set("page", "1"); setSearchParams(next, { replace: true }); }} />}</section>

      <Dialog onOpenChange={setShowCreate} open={showCreate}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form
            onSubmit={form.handleSubmit((values) => creation.mutate(values))}
          >
            <DialogHeader><DialogTitle>New customer</DialogTitle><DialogDescription>Create the customer master, primary contact, and optional first site.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Label className="space-y-2">
                <span>Display name</span>
                <Input
                  className="min-h-11"
                  {...form.register("displayName")}
                />
                {form.formState.errors.displayName && (
                  <span className="mt-1 block text-sm text-destructive">
                    {form.formState.errors.displayName.message}
                  </span>
                )}
              </Label>
              <Label className="space-y-2"><span>Legal name (optional)</span><Input className="min-h-11" {...form.register("legalName")} /></Label>
              <Label className="space-y-2 sm:col-span-2">
                <span>Primary contact</span>
                <Input
                  className="min-h-11"
                  {...form.register("contactName")}
                />
                {form.formState.errors.contactName && (
                  <span className="mt-1 block text-sm text-destructive">
                    {form.formState.errors.contactName.message}
                  </span>
                )}
              </Label>
              <Label className="space-y-2">
                <span>Phone</span>
                <Input
                  className="min-h-11"
                  inputMode="tel"
                  {...form.register("phone")}
                />
                {form.formState.errors.phone && (
                  <span className="mt-1 block text-sm text-destructive">
                    {form.formState.errors.phone.message}
                  </span>
                )}
              </Label>
              <Label className="space-y-2">
                <span>Email</span>
                <Input
                  className="min-h-11"
                  type="email"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <span className="mt-1 block text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </span>
                )}
              </Label>
            </div>
            <fieldset className="mt-6 rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">
                First site (optional)
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Label className="space-y-2">
                  <span>Site name</span>
                  <Input
                    className="min-h-11"
                    {...form.register("siteName")}
                  />
                </Label>
                <Label className="space-y-2">
                  <span>City</span>
                  <Input
                    className="min-h-11"
                    {...form.register("siteCity")}
                  />
                </Label>
                <Label className="space-y-2 sm:col-span-2">
                  <span>Address</span>
                  <Input
                    className="min-h-11"
                    {...form.register("siteAddress")}
                  />
                  {form.formState.errors.siteAddress && (
                    <span className="mt-1 block text-sm text-destructive">
                      {form.formState.errors.siteAddress.message}
                    </span>
                  )}
                </Label>
              </div>
            </fieldset>
            {duplicates.length > 0 && (
              <Alert className="mt-4">
                <AlertTitle>
                  Possible duplicates were found; nothing was merged.
                </AlertTitle>
                <AlertDescription>
                <ul className="mt-2 list-disc pl-5">
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
              <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(creation.error)}</AlertDescription></Alert>
            )}
            <DialogFooter className="mt-6">
              <Button
                onClick={() => setShowCreate(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={creation.isPending}
                type="submit"
              >
                {creation.isPending && (
                  <LoaderCircle className="animate-spin" size={17} />
                )}
                Create customer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <CrmImportDialog
        onCommitted={() => queryClient.invalidateQueries({ queryKey: ["crm", "customers"] })}
        onOpenChange={setShowImport}
        open={showImport}
        type="customers"
      />
    </main>
  );
}
