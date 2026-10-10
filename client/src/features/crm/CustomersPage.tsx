import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { createCustomer, customersQuery, type DuplicateHint } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateHint[]>([]);
  const search = searchParams.get("search") ?? "";
  const status =
    searchParams.get("status") === "inactive"
      ? ("inactive" as const)
      : undefined;
  const customers = useQuery(
    customersQuery({ search: search || undefined, status }),
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

  function updateFilter(name: "search" | "status", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

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
        <Button
          className="min-h-11"
          onClick={() => {
            setDuplicates([]);
            setShowCreate(true);
          }}
          size="lg"
          type="button"
        >
          <Plus size={18} /> Add customer
        </Button>
      </div>

      <section className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[1fr_12rem]">
        <label className="relative">
          <span className="sr-only">Search customers</span>
          <Search
            className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground"
            size={18}
          />
          <Input
            className="min-h-11 pl-10"
            defaultValue={search}
            key={search}
            onBlur={(event) =>
              updateFilter("search", event.target.value.trim())
            }
            onKeyDown={(event) => {
              if (event.key === "Enter")
                updateFilter("search", event.currentTarget.value.trim());
            }}
            placeholder="Search customers"
          />
        </label>
        <Select onValueChange={(value) => updateFilter("status", value === "all" ? "" : value)} value={status ?? "all"}>
          <SelectTrigger aria-label="Customer status" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Active and inactive</SelectItem><SelectItem value="inactive">Inactive only</SelectItem></SelectContent>
        </Select>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Customer directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {customers.data
              ? `${customers.data.total} visible customer${customers.data.total === 1 ? "" : "s"}`
              : "Loading customers…"}
          </p>
        </div>
        {customers.isPending ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <Skeleton className="h-16" key={item} />)}</div>
        ) : customers.isError ? (
          <Alert className="m-5 w-auto" variant="destructive"><AlertDescription>{getApiErrorMessage(customers.error)}</AlertDescription></Alert>
        ) : customers.data.items.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <Building2 className="mx-auto text-muted-foreground" />
              <p className="mt-3 font-medium">No customers in this view</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one or wait until a customer is linked to work assigned
                to you.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {customers.data.items.map((customer) => (
              <Link
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-accent"
                key={customer.id}
                to={`/crm/customers/${customer.id}`}
              >
                <div>
                  <p className="font-medium">{customer.displayName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {customer.legalName || "No separate legal name"}
                  </p>
                </div>
                <Badge className="capitalize" variant={customer.status === "active" ? "default" : "secondary"}>{customer.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

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
    </main>
  );
}
