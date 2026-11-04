import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Eye,
  Factory,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  Ruler,
  Star,
  Tags,
  Truck,
} from "lucide-react";
import { useState } from "react";
import {
  useLocation,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  createMaster,
  createItemOffering,
  createItemRate,
  deactivateMaster,
  masterListQuery,
  masterLookupsQuery,
  itemOfferingsQuery,
  offeringRatesQuery,
  updateMaster,
  type Brand,
  type Item,
  type ItemFamily,
  type ItemOffering,
  type ItemCategory,
  type MasterResource,
  type MasterSort,
  type MasterStatus,
  type Unit,
  type Vendor,
} from "@/api/masters";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import {
  ServerDataTable,
  type ServerColumn,
} from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VendorDetailSheet } from "./VendorDetailSheet";
import { VendorFormDialog } from "./VendorFormDialog";
import { VendorInvitationDialog } from "./VendorInvitationDialog";

type MasterRow = Unit | ItemCategory | Brand | ItemFamily | Item | Vendor;
type Configuration = {
  title: string;
  singular: string;
  description: string;
  resource: MasterResource;
  icon: typeof Boxes;
  readPermission: string;
  managePermission: string;
};

const configurations: Record<string, Configuration> = {
  "/masters/vendors": {
    title: "Vendors",
    singular: "vendor",
    description:
      "Operational supplier identity and primary contacts for later procurement.",
    resource: "vendors",
    icon: Truck,
    readPermission: "procurement.vendor.read",
    managePermission: "procurement.vendor.manage",
  },
  "/masters/items": {
    title: "Items",
    singular: "item",
    description:
      "Technical item identity, specification, category, purchasing unit, and allowed brands/makes.",
    resource: "items",
    icon: Boxes,
    readPermission: "procurement.item.read",
    managePermission: "procurement.item.manage",
  },
  "/masters/item-families": {
    title: "Item families",
    singular: "item family",
    description:
      "Reusable scope wording and ordered specification definitions shared by catalogue variants.",
    resource: "item-families",
    icon: Layers3,
    readPermission: "procurement.item.read",
    managePermission: "procurement.item.manage",
  },
  "/masters/brands": {
    title: "Brands & makes",
    singular: "brand/make",
    description:
      "Approved makes that can be assigned to items and selected on quotation lines.",
    resource: "brands",
    icon: Factory,
    readPermission: "procurement.item.read",
    managePermission: "procurement.item.manage",
  },
  "/masters/item-categories": {
    title: "Item categories",
    singular: "category",
    description: "Controlled groupings used by the technical item master.",
    resource: "item-categories",
    icon: Tags,
    readPermission: "procurement.item.read",
    managePermission: "procurement.item.manage",
  },
  "/masters/units": {
    title: "Units",
    singular: "unit",
    description:
      "Controlled units of measure. No conversion or valuation policy is implied.",
    resource: "units",
    icon: Ruler,
    readPermission: "procurement.item.read",
    managePermission: "procurement.item.manage",
  },
};

function rowName(row: MasterRow) {
  return "displayName" in row ? row.displayName : row.name;
}

function detail(row: MasterRow) {
  if ("primaryContact" in row)
    return row.primaryContact
      ? `${row.primaryContact.name} · ${row.primaryContact.phone || row.primaryContact.email}`
      : "No primary contact";
  if ("scopeDescription" in row)
    return `${row.categoryName} · ${row.specifications.length} specification field${row.specifications.length === 1 ? "" : "s"}`;
  if ("categoryName" in row)
    return `${row.familyName ?? "No family"} · ${row.categoryName} · ${row.unitName} (${row.unitSymbol}) · offerings managed separately`;
  if ("symbol" in row) return row.symbol;
  return "Item grouping";
}

export function MasterDataPage() {
  const location = useLocation();
  const config =
    configurations[location.pathname] ?? configurations["/masters/items"]!;
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canManage = user.permissions.includes(config.managePermission);
  const canManageRates = user.permissions.includes(
    "procurement.item_rate.manage",
  );
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<MasterRow | "new">();
  const [deactivating, setDeactivating] = useState<MasterRow>();
  const [offeringItem, setOfferingItem] = useState<Item>();
  const [rateOffering, setRateOffering] = useState<ItemOffering>();

  // Vendor-specific state
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>(
    undefined,
  );
  const [whatsappInviteOpen, setWhatsappInviteOpen] = useState(false);
  const search = params.get("search") ?? "";
  const status = (
    ["active", "inactive"].includes(params.get("status") ?? "")
      ? params.get("status")
      : undefined
  ) as MasterStatus | undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const isItemsResource = config.resource === "items";
  const defaultPageSize = isItemsResource ? 100 : 20;
  const pageSize = [10, 20, 50, 100, 200, 500].includes(
    Number(params.get("pageSize")),
  )
    ? Number(params.get("pageSize"))
    : defaultPageSize;
  const sort = (
    ["code", "name", "status", "updatedAt"].includes(params.get("sort") ?? "")
      ? params.get("sort")
      : "name"
  ) as MasterSort;
  const direction = params.get("direction") === "desc" ? "desc" : "asc";
  const records = useQuery(
    masterListQuery<MasterRow>(config.resource, {
      search: search || undefined,
      status,
      page,
      pageSize,
      sort,
      direction,
    }),
  );
  const unitLookups = useQuery({
    ...masterLookupsQuery("units"),
    enabled:
      ["items", "item-families"].includes(config.resource) && Boolean(editing),
  });
  const categoryLookups = useQuery({
    ...masterLookupsQuery("item-categories"),
    enabled:
      ["items", "item-families"].includes(config.resource) && Boolean(editing),
  });
  const brandLookups = useQuery({
    ...masterLookupsQuery("brands"),
    enabled:
      config.resource === "items" &&
      (Boolean(editing) || Boolean(offeringItem)),
  });
  const familyLookups = useQuery({
    ...masterLookupsQuery("item-families"),
    enabled: config.resource === "items" && Boolean(editing),
  });
  const offerings = useQuery(itemOfferingsQuery(offeringItem?.id));
  const rates = useQuery(
    offeringRatesQuery(offeringItem?.id, rateOffering?.id),
  );
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (form: FormData) => {
      const input = masterInput(config.resource, form);
      return editing === "new"
        ? createMaster(config.resource, input)
        : updateMaster(config.resource, editing!.id, {
            ...input,
            expectedVersion: editing!.rowVersion,
          });
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["masters", config.resource],
      });
      toast.success(
        `${config.singular.replace(/^./, (value) => value.toUpperCase())} ${editing === "new" ? "created" : "updated"}.`,
      );
      setEditing(undefined);
    },
  });
  const deactivate = useMutation({
    mutationFn: (form: FormData) =>
      deactivateMaster(
        config.resource,
        deactivating!.id,
        deactivating!.rowVersion,
        String(form.get("reason")),
      ),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["masters", config.resource],
      });
      toast.success(
        `${config.singular.replace(/^./, (value) => value.toUpperCase())} deactivated.`,
      );
      setDeactivating(undefined);
    },
  });
  const saveOffering = useMutation({
    mutationFn: (form: FormData) =>
      createItemOffering(offeringItem!.id, {
        brandId:
          optional(form, "brandId") === "none"
            ? undefined
            : optional(form, "brandId"),
        manufacturerModel: String(form.get("manufacturerModel")),
        manufacturerSku: optional(form, "manufacturerSku"),
        isPreferred: form.get("isPreferred") === "on",
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["masters", "items", offeringItem!.id, "offerings"],
      });
      toast.success("Brand/model offering created.");
      saveOffering.reset();
    },
  });
  const saveRate = useMutation({
    mutationFn: (form: FormData) =>
      createItemRate(offeringItem!.id, rateOffering!.id, {
        currency: String(form.get("currency")),
        effectiveFrom: String(form.get("effectiveFrom")),
        supplyRate: String(form.get("supplyRate")),
        labourRate: String(form.get("labourRate")),
        miscellaneousRate: String(form.get("miscellaneousRate")),
        miscellaneousNote: optional(form, "miscellaneousNote"),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: [
          "masters",
          "items",
          offeringItem!.id,
          "offerings",
          rateOffering!.id,
          "rates",
        ],
      });
      toast.success("Effective rate version created.");
      setRateOffering(undefined);
    },
  });

  const updateUrl = (values: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === "" || value === "all")
        next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  };

  const isVendorResource = config.resource === "vendors";

  const columns: Array<ServerColumn<MasterRow, MasterSort>> = isVendorResource
    ? [
        {
          key: "code",
          label: "Vendor Code",
          sort: "code",
          className: "w-28 font-mono text-xs font-semibold",
          cell: (row) => row.code,
        },
        {
          key: "name",
          label: "Vendor / Company",
          sort: "name",
          className: "min-w-64",
          cell: (row) => {
            const v = row as Vendor;
            return (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {v.displayName}
                  </span>
                  {v.tradeName && v.tradeName !== v.displayName && (
                    <span className="text-xs text-muted-foreground">
                      ({v.tradeName})
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1 font-normal capitalize"
                  >
                    {v.vendorType?.replace(/_/g, " ") || "Vendor"}
                  </Badge>
                  {v.supplierCategories && v.supplierCategories.length > 0 && (
                    <span>
                      • {v.supplierCategories.slice(0, 2).join(", ")}
                      {v.supplierCategories.length > 2
                        ? ` +${v.supplierCategories.length - 2}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          },
        },
        {
          key: "contact",
          label: "Primary Contact",
          className: "min-w-48",
          cell: (row) => {
            const v = row as Vendor;
            if (!v.primaryContact?.name)
              return (
                <span className="text-xs text-muted-foreground">
                  No contact
                </span>
              );
            return (
              <div className="text-xs space-y-0.5">
                <p className="font-medium text-foreground">
                  {v.primaryContact.name}
                </p>
                <p className="text-muted-foreground">
                  {v.primaryContact.phone || v.primaryContact.email || "—"}
                </p>
              </div>
            );
          },
        },
        {
          key: "gst",
          label: "GST / Tax",
          className: "w-36",
          cell: (row) => {
            const v = row as Vendor;
            return (
              <div className="text-xs space-y-0.5">
                {v.gstStatus === "registered" && v.gstin ? (
                  <div>
                    <span className="font-mono text-[11px] font-medium">
                      {v.gstin}
                    </span>
                    <Badge
                      variant="secondary"
                      className="ml-1 text-[9px] py-0 px-1"
                    >
                      GST
                    </Badge>
                  </div>
                ) : (
                  <span className="text-muted-foreground italic">
                    Unregistered
                  </span>
                )}
                {v.pan && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    PAN: {v.pan}
                  </p>
                )}
              </div>
            );
          },
        },
        {
          key: "status",
          label: "Status",
          sort: "status",
          className: "w-36",
          cell: (row) => {
            const v = row as Vendor;
            return (
              <div className="flex flex-col gap-1 items-start">
                {v.isArchived ? (
                  <Badge
                    variant="outline"
                    className="border-destructive/40 text-destructive text-[10px]"
                  >
                    Archived
                  </Badge>
                ) : v.approvalStatus === "pending_approval" ? (
                  <Badge
                    variant="secondary"
                    className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]"
                  >
                    Pending Approval
                  </Badge>
                ) : v.approvalStatus === "draft" ? (
                  <Badge variant="outline" className="text-[10px]">
                    Draft
                  </Badge>
                ) : v.approvalStatus === "rejected" ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Rejected
                  </Badge>
                ) : (
                  <StatusBadge status={row.status} />
                )}
              </div>
            );
          },
        },
        {
          key: "updated",
          label: "Updated",
          sort: "updatedAt",
          className: "w-24 tabular-nums text-xs text-muted-foreground",
          cell: (row) => new Date(row.updatedAt).toLocaleDateString(),
        },
        ...(canManage
          ? [
              {
                key: "actions",
                label: "Actions",
                className: "w-28 text-right",
                cell: (row: MasterRow) => {
                  const v = row as Vendor;
                  return (
                    <div className="flex justify-end gap-1">
                      <Button
                        aria-label={`View ${v.displayName}`}
                        onClick={() => setSelectedVendorId(v.id)}
                        size="icon-sm"
                        variant="ghost"
                        title="View Vendor Details"
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        aria-label={`Edit ${v.displayName}`}
                        onClick={() => {
                          setEditingVendor(v);
                          setVendorFormOpen(true);
                        }}
                        size="icon-sm"
                        variant="ghost"
                        title="Edit Vendor"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {row.status === "active" && !v.isArchived && (
                        <Button
                          aria-label={`Deactivate ${v.displayName}`}
                          onClick={() => {
                            deactivate.reset();
                            setDeactivating(row);
                          }}
                          size="icon-sm"
                          variant="ghost"
                          title="Deactivate Vendor"
                        >
                          <Power className="size-4" />
                        </Button>
                      )}
                    </div>
                  );
                },
              },
            ]
          : []),
      ]
    : [
        {
          key: "code",
          label: "Code",
          sort: "code",
          className: "w-32 font-mono text-xs",
          cell: (row) => row.code,
        },
        {
          key: "name",
          label: "Name",
          sort: "name",
          className: "min-w-56",
          cell: (row) => (
            <div>
              <p className="font-medium">{rowName(row)}</p>
              <p className="max-w-md truncate text-xs text-muted-foreground">
                {detail(row)}
              </p>
            </div>
          ),
        },
        {
          key: "status",
          label: "Status",
          sort: "status",
          cell: (row) => <StatusBadge status={row.status} />,
        },
        {
          key: "updated",
          label: "Updated",
          sort: "updatedAt",
          className: "tabular-nums",
          cell: (row) => new Date(row.updatedAt).toLocaleDateString(),
        },
        ...(canManage
          ? [
              {
                key: "actions",
                label: "Actions",
                className: "w-32 text-right",
                cell: (row: MasterRow) => (
                  <div className="flex justify-end gap-1">
                    {config.resource === "items" && canManageRates && (
                      <Button
                        aria-label={`Manage brand offerings for ${rowName(row)}`}
                        onClick={() => {
                          setOfferingItem(row as Item);
                          setRateOffering(undefined);
                        }}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Boxes />
                      </Button>
                    )}
                    <Button
                      aria-label={`Edit ${rowName(row)}`}
                      onClick={() => {
                        save.reset();
                        setEditing(row);
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    {row.status === "active" && (
                      <Button
                        aria-label={`Deactivate ${rowName(row)}`}
                        onClick={() => {
                          deactivate.reset();
                          setDeactivating(row);
                        }}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Power />
                      </Button>
                    )}
                  </div>
                ),
              },
            ]
          : []),
      ];
  const Icon = config.icon;

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Masters</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Icon className="size-6" />
            {config.title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>
        {canManage &&
          (isVendorResource ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setWhatsappInviteOpen(true)}
              >
                <MessageSquare className="size-4 mr-1 text-emerald-600" />
                Invite via WhatsApp
              </Button>
              <Button
                onClick={() => {
                  setEditingVendor(undefined);
                  setVendorFormOpen(true);
                }}
              >
                <Plus />
                Add vendor
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => {
                save.reset();
                setEditing("new");
              }}
            >
              <Plus />
              Add {config.singular}
            </Button>
          ))}
      </div>
      <div className="mt-6">
        <ListToolbar
          search={search}
          onSearch={(value) => updateUrl({ search: value, page: 1 })}
          activeFilters={status ? 1 : 0}
          onClear={() => updateUrl({ status: undefined, page: 1 })}
        >
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status ?? "all"}
              onValueChange={(value) => updateUrl({ status: value, page: 1 })}
            >
              <SelectTrigger>
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
      <Card className="mt-4 overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>
            {records.data
              ? `${records.data.total} total record${records.data.total === 1 ? "" : "s"}`
              : "Loading records…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {records.isError ? (
            <Alert className="m-4" variant="destructive">
              <AlertDescription>
                {getApiErrorMessage(records.error)}
              </AlertDescription>
            </Alert>
          ) : (
            <ServerDataTable
              columns={columns}
              rows={records.data?.items ?? []}
              rowKey={(row) => row.id}
              loading={records.isPending}
              empty={
                <div>
                  <Icon className="mx-auto mb-2" />
                  No {config.title.toLowerCase()} in this view.
                </div>
              }
              sort={sort}
              direction={direction}
              onSort={(nextSort, nextDirection) =>
                updateUrl({ sort: nextSort, direction: nextDirection, page: 1 })
              }
              page={page}
              pageSize={pageSize}
              total={records.data?.total ?? 0}
              onPageChange={(nextPage) => updateUrl({ page: nextPage })}
              onPageSizeChange={(nextSize) =>
                updateUrl({ pageSize: nextSize, page: 1 })
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          {editing && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editing === "new" ? "Add" : "Edit"} {config.singular}
                </DialogTitle>
                <DialogDescription>
                  Changes are validated on the server and recorded in the audit
                  history.
                </DialogDescription>
              </DialogHeader>
              <MasterForm
                resource={config.resource}
                row={editing === "new" ? undefined : editing}
                units={unitLookups.data?.items ?? []}
                categories={categoryLookups.data?.items ?? []}
                families={familyLookups.data?.items ?? []}
              />
              {save.isError && (
                <Alert className="mt-4" variant="destructive">
                  <AlertDescription>
                    {getApiErrorMessage(save.error)}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter className="mt-6">
                <Button
                  onClick={() => setEditing(undefined)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={save.isPending} type="submit">
                  {save.isPending && <LoaderCircle className="animate-spin" />}
                  Save {config.singular}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(offeringItem) && !rateOffering}
        onOpenChange={(open) => !open && setOfferingItem(undefined)}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          {offeringItem && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Brand/model offerings · {offeringItem.name}
                </DialogTitle>
                <DialogDescription>
                  Each offering has its own immutable, effective-dated supply,
                  labour and miscellaneous rates. The preferred option drives
                  BOQ summaries; quotation users still choose an approved option
                  explicitly.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 space-y-3">
                {offerings.isPending ? (
                  <p className="text-sm text-muted-foreground">
                    Loading offerings…
                  </p>
                ) : offerings.data?.length ? (
                  offerings.data.map((offering) => (
                    <Card key={offering.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {offering.brandName ?? "Unbranded"} ·{" "}
                              {offering.manufacturerModel}
                            </p>
                            {offering.isPreferred && (
                              <Star className="size-4 fill-current text-amber-500" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {offering.manufacturerSku || "No manufacturer SKU"}{" "}
                            · {offering.status}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setRateOffering(offering)}
                        >
                          Rates
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Alert>
                    <AlertDescription>
                      No offering exists yet. Add at least one brand/model (or
                      an unbranded service option) before BOQ costing.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <form
                className="mt-6 rounded-lg border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveOffering.mutate(new FormData(event.currentTarget));
                  event.currentTarget.reset();
                }}
              >
                <h3 className="font-medium">Add offering</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Brand / make</Label>
                    <Select defaultValue="none" name="brandId">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Unbranded / service
                        </SelectItem>
                        {(brandLookups.data?.items ?? []).map((brand) => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field
                    label="Manufacturer model"
                    name="manufacturerModel"
                    required
                    maxLength={120}
                  />
                  <Field
                    label="Manufacturer SKU (optional)"
                    name="manufacturerSku"
                    maxLength={100}
                  />
                  <Label className="flex items-center gap-3 rounded-md border p-3 font-normal">
                    <Checkbox name="isPreferred" />
                    <span>Preferred costing option</span>
                  </Label>
                </div>
                {saveOffering.isError && (
                  <Alert className="mt-4" variant="destructive">
                    <AlertDescription>
                      {getApiErrorMessage(saveOffering.error)}
                    </AlertDescription>
                  </Alert>
                )}
                <DialogFooter className="mt-4">
                  <Button disabled={saveOffering.isPending} type="submit">
                    {saveOffering.isPending && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    Add offering
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rateOffering)}
        onOpenChange={(open) => !open && setRateOffering(undefined)}
      >
        <DialogContent className="sm:max-w-2xl">
          {offeringItem && rateOffering && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveRate.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  Add effective rate · {rateOffering.brandName ?? "Unbranded"}{" "}
                  {rateOffering.manufacturerModel}
                </DialogTitle>
                <DialogDescription>
                  Rate versions are immutable and belong only to this
                  brand/model offering.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Effective from"
                  name="effectiveFrom"
                  type="date"
                  required
                />
                <Field
                  defaultValue="INR"
                  label="Currency"
                  maxLength={3}
                  name="currency"
                  required
                />
                <Field
                  label="Supply rate"
                  min="0"
                  name="supplyRate"
                  step="0.0001"
                  inputMode="decimal"
                  required
                />
                <Field
                  label="Labour / installation rate"
                  min="0"
                  name="labourRate"
                  step="0.0001"
                  inputMode="decimal"
                  required
                />
                <Field
                  label="Miscellaneous rate"
                  min="0"
                  name="miscellaneousRate"
                  step="0.0001"
                  inputMode="decimal"
                  required
                />
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="rate-note">Miscellaneous note</Label>
                  <Textarea
                    id="rate-note"
                    name="miscellaneousNote"
                    maxLength={1000}
                  />
                </div>
              </div>
              {rates.data && rates.data.length > 0 && (
                <Alert className="mt-4">
                  <AlertDescription>
                    Latest version: {rates.data[0]!.effectiveFrom} ·{" "}
                    {rates.data[0]!.currency} {rates.data[0]!.supplyRate} +{" "}
                    {rates.data[0]!.labourRate} +{" "}
                    {rates.data[0]!.miscellaneousRate}.
                  </AlertDescription>
                </Alert>
              )}
              {saveRate.isError && (
                <Alert className="mt-4" variant="destructive">
                  <AlertDescription>
                    {getApiErrorMessage(saveRate.error)}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRateOffering(undefined)}
                >
                  Back
                </Button>
                <Button type="submit" disabled={saveRate.isPending}>
                  {saveRate.isPending && (
                    <LoaderCircle className="animate-spin" />
                  )}
                  Create rate version
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(undefined)}
      >
        <DialogContent className="sm:max-w-md">
          {deactivating && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                deactivate.mutate(new FormData(event.currentTarget));
              }}
            >
              <DialogHeader>
                <DialogTitle>Deactivate {rowName(deactivating)}?</DialogTitle>
                <DialogDescription>
                  Historical references remain available. This record will no
                  longer be offered for new work.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 space-y-2">
                <Label htmlFor="deactivate-reason">Reason</Label>
                <Textarea
                  id="deactivate-reason"
                  minLength={3}
                  maxLength={500}
                  name="reason"
                  required
                />
              </div>
              {deactivate.isError && (
                <Alert className="mt-4" variant="destructive">
                  <AlertDescription>
                    {getApiErrorMessage(deactivate.error)}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter className="mt-6">
                <Button
                  onClick={() => setDeactivating(undefined)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={deactivate.isPending}
                  type="submit"
                  variant="destructive"
                >
                  {deactivate.isPending && (
                    <LoaderCircle className="animate-spin" />
                  )}
                  Deactivate
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {isVendorResource && (
        <>
          <VendorFormDialog
            open={vendorFormOpen}
            onOpenChange={(open) => {
              setVendorFormOpen(open);
              if (!open) setEditingVendor(undefined);
            }}
            vendor={editingVendor}
          />
          <VendorInvitationDialog
            open={whatsappInviteOpen}
            onOpenChange={setWhatsappInviteOpen}
          />
          <VendorDetailSheet
            vendorId={selectedVendorId}
            open={Boolean(selectedVendorId)}
            onOpenChange={(open) => {
              if (!open) setSelectedVendorId(null);
            }}
            onEdit={(v) => {
              setSelectedVendorId(null);
              setEditingVendor(v);
              setVendorFormOpen(true);
            }}
          />
        </>
      )}
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  ...props
}: { label: string; name: string; defaultValue?: string | null } & Omit<
  React.ComponentProps<typeof Input>,
  "defaultValue"
>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`master-${name}`}>{label}</Label>
      <Input
        defaultValue={defaultValue ?? ""}
        id={`master-${name}`}
        name={name}
        {...props}
      />
    </div>
  );
}

function MasterForm({
  resource,
  row,
  units,
  categories,
  families,
}: {
  resource: MasterResource;
  row?: MasterRow;
  units: Array<Unit | ItemCategory | Brand | ItemFamily>;
  categories: Array<Unit | ItemCategory | Brand | ItemFamily>;
  families: Array<Unit | ItemCategory | Brand | ItemFamily>;
}) {
  const vendor = row && "displayName" in row ? row : undefined;
  const item = row && "brands" in row ? row : undefined;
  const family = row && "scopeDescription" in row ? row : undefined;
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field
        defaultValue={row?.code}
        label="Code"
        maxLength={50}
        name="code"
        required
      />
      <Field
        defaultValue={row ? rowName(row) : ""}
        label={resource === "vendors" ? "Display name" : "Name"}
        maxLength={160}
        name="name"
        required
      />
      {resource === "units" && (
        <>
          <Field
            defaultValue={row && "symbol" in row ? row.symbol : ""}
            label="Symbol"
            maxLength={20}
            name="symbol"
            required
          />
          <Label className="flex items-center gap-3 rounded-md border p-3 font-normal sm:col-span-2">
            <Checkbox
              defaultChecked={
                row && "allowFractional" in row ? row.allowFractional : true
              }
              name="allowFractional"
            />
            <span>Allow fractional quantities</span>
          </Label>
        </>
      )}
      {resource === "item-families" && (
        <FamilyFields
          family={family}
          units={units as Unit[]}
          categories={categories as ItemCategory[]}
        />
      )}
      {resource === "items" && (
        <ItemFields
          item={item}
          units={units as Unit[]}
          families={families as ItemFamily[]}
        />
      )}
      {resource === "vendors" && (
        <>
          <Field
            defaultValue={vendor?.legalName}
            label="Legal name"
            maxLength={200}
            name="legalName"
          />
          <Field
            defaultValue={vendor?.taxIdentifier}
            label="Tax identifier (optional)"
            maxLength={40}
            name="taxIdentifier"
          />
          <Field
            defaultValue={vendor?.addressLine1}
            label="Address line 1"
            maxLength={200}
            name="addressLine1"
          />
          <Field
            defaultValue={vendor?.addressLine2}
            label="Address line 2"
            maxLength={200}
            name="addressLine2"
          />
          <Field
            defaultValue={vendor?.city}
            label="City"
            maxLength={100}
            name="city"
          />
          <Field
            defaultValue={vendor?.state}
            label="State"
            maxLength={100}
            name="state"
          />
          <Field
            defaultValue={vendor?.postalCode}
            label="Postal code"
            maxLength={20}
            name="postalCode"
          />
          <Field
            defaultValue={vendor?.country}
            label="Country"
            maxLength={100}
            name="country"
          />
          <div className="sm:col-span-2 border-t pt-4">
            <p className="text-sm font-medium">Primary contact</p>
          </div>
          <Field
            defaultValue={vendor?.primaryContact?.name}
            label="Contact name"
            maxLength={120}
            name="contactName"
            required
          />
          <Field
            defaultValue={vendor?.primaryContact?.jobTitle}
            label="Job title"
            maxLength={100}
            name="jobTitle"
          />
          <Field
            defaultValue={vendor?.primaryContact?.phone}
            label="Phone"
            maxLength={30}
            name="phone"
          />
          <Field
            defaultValue={vendor?.primaryContact?.email}
            label="Email"
            maxLength={254}
            name="email"
            type="email"
          />
        </>
      )}
    </div>
  );
}

type SpecificationRow = ItemFamily["specifications"][number] & {
  formId: string;
};

function FamilyFields({
  family,
  units,
  categories,
}: {
  family?: ItemFamily;
  units: Unit[];
  categories: ItemCategory[];
}) {
  const [rows, setRows] = useState<SpecificationRow[]>(() =>
    (family?.specifications ?? []).map((specification, index) => ({
      ...specification,
      formId: `existing-${index}`,
    })),
  );
  const add = () =>
    setRows((current) => [
      ...current,
      {
        formId: crypto.randomUUID(),
        key: "",
        label: "",
        valueType: "text",
        unitLabel: null,
        isRequired: false,
        sortOrder: current.length + 1,
      },
    ]);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="master-category">Category</Label>
        <Select defaultValue={family?.categoryId} name="categoryId" required>
          <SelectTrigger id="master-category">
            <SelectValue placeholder="Choose category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="family-unit">Default unit (optional)</Label>
        <Select
          defaultValue={family?.defaultUnitId ?? "none"}
          name="defaultUnitId"
        >
          <SelectTrigger id="family-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No default</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="family-scope">Reusable scope description</Label>
        <Textarea
          defaultValue={family?.scopeDescription ?? ""}
          id="family-scope"
          maxLength={4000}
          name="scopeDescription"
          required
        />
      </div>
      <fieldset className="space-y-3 rounded-lg border p-4 sm:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <legend className="text-sm font-medium">
              Specification fields
            </legend>
            <p className="text-xs text-muted-foreground">
              These fields become the guided product form for every item in this
              family.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus />
            Add field
          </Button>
        </div>
        {rows.length === 0 && (
          <Alert>
            <AlertDescription>
              No structured fields yet. Add fields such as diameter, pressure
              rating, material, or certification.
            </AlertDescription>
          </Alert>
        )}
        {rows.map((specification, index) => (
          <div
            className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2"
            key={specification.formId}
          >
            <input
              type="hidden"
              name="specRowId"
              value={specification.formId}
            />
            <Field
              label="Field key"
              name={`specKey:${specification.formId}`}
              defaultValue={specification.key}
              pattern="[a-z][a-z0-9_]*"
              required
            />
            <Field
              label="User-facing label"
              name={`specLabel:${specification.formId}`}
              defaultValue={specification.label}
              required
            />
            <div className="space-y-2">
              <Label>Value type</Label>
              <Select
                name={`specType:${specification.formId}`}
                defaultValue={specification.valueType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Yes / no</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Unit label (optional)"
              name={`specUnit:${specification.formId}`}
              defaultValue={specification.unitLabel}
            />
            <Label className="flex items-center gap-3 rounded-md border p-3 font-normal">
              <Checkbox
                name={`specRequired:${specification.formId}`}
                defaultChecked={specification.isRequired}
              />
              <span>Required field</span>
            </Label>
            <Button
              className="self-center justify-self-start"
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setRows((current) =>
                  current.filter((_, rowIndex) => rowIndex !== index),
                )
              }
            >
              Remove field
            </Button>
          </div>
        ))}
      </fieldset>
    </>
  );
}

function ItemFields({
  item,
  units,
  families,
}: {
  item?: Item;
  units: Unit[];
  families: ItemFamily[];
}) {
  const [familyId, setFamilyId] = useState(item?.familyId ?? "");
  const family = families.find((entry) => entry.id === familyId);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="master-family">Item family</Label>
        <Select
          value={familyId}
          onValueChange={setFamilyId}
          name="familyId"
          required
        >
          <SelectTrigger id="master-family">
            <SelectValue placeholder="Choose family" />
          </SelectTrigger>
          <SelectContent>
            {families.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {family && (
          <p className="text-xs text-muted-foreground">
            Category inherited automatically: {family.categoryName}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="master-unit">Unit</Label>
        <Select
          defaultValue={item?.unitId ?? family?.defaultUnitId ?? undefined}
          name="unitId"
          required
        >
          <SelectTrigger id="master-unit">
            <SelectValue placeholder="Choose unit" />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Field
        defaultValue={item?.model}
        label="Generic model / size (optional)"
        maxLength={120}
        name="model"
      />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="master-specification">
          Readable variant specification
        </Label>
        <Textarea
          defaultValue={item?.specification ?? ""}
          id="master-specification"
          maxLength={2_000}
          name="specification"
        />
      </div>
      {family && (
        <fieldset className="grid gap-4 rounded-lg border p-4 sm:col-span-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <legend className="text-sm font-medium">
              {family.name} specifications
            </legend>
            <p className="text-xs text-muted-foreground">
              Complete normal fields—no JSON required.
            </p>
          </div>
          {family.specifications.map((specification) => (
            <div className="space-y-2" key={specification.key}>
              <input
                type="hidden"
                name={`specType:${specification.key}`}
                value={specification.valueType}
              />
              <Label htmlFor={`spec-${specification.key}`}>
                {specification.label}
                {specification.unitLabel ? ` (${specification.unitLabel})` : ""}
              </Label>
              {specification.valueType === "boolean" ? (
                <Label className="flex items-center gap-3 rounded-md border p-3 font-normal">
                  <Checkbox
                    id={`spec-${specification.key}`}
                    name={`specValue:${specification.key}`}
                    defaultChecked={
                      item?.specificationValues[specification.key] === true
                    }
                  />
                  <span>Yes</span>
                </Label>
              ) : (
                <Input
                  id={`spec-${specification.key}`}
                  name={`specValue:${specification.key}`}
                  type={
                    specification.valueType === "number" ? "number" : "text"
                  }
                  step={
                    specification.valueType === "number" ? "any" : undefined
                  }
                  required={specification.isRequired}
                  defaultValue={String(
                    item?.specificationValues[specification.key] ?? "",
                  )}
                />
              )}
            </div>
          ))}
        </fieldset>
      )}
      <Alert className="sm:col-span-2">
        <AlertDescription>
          Save the generic product first, then use the offerings action to add
          each allowed brand/model and its own dated rates.
        </AlertDescription>
      </Alert>
    </>
  );
}

function optional(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim() || undefined;
}

function masterInput(
  resource: MasterResource,
  form: FormData,
): Record<string, unknown> {
  const base = {
    code: String(form.get("code")),
    name: String(form.get("name")),
  };
  if (resource === "units")
    return {
      ...base,
      symbol: String(form.get("symbol")),
      allowFractional: form.get("allowFractional") === "on",
    };
  if (resource === "item-categories" || resource === "brands") return base;
  if (resource === "item-families")
    return {
      ...base,
      categoryId: String(form.get("categoryId")),
      scopeDescription: String(form.get("scopeDescription")),
      defaultUnitId:
        optional(form, "defaultUnitId") === "none"
          ? undefined
          : optional(form, "defaultUnitId"),
      specifications: form
        .getAll("specRowId")
        .map(String)
        .map((id) => ({
          key: String(form.get(`specKey:${id}`)),
          label: String(form.get(`specLabel:${id}`)),
          valueType: String(form.get(`specType:${id}`)),
          unitLabel: optional(form, `specUnit:${id}`),
          isRequired: form.get(`specRequired:${id}`) === "on",
        })),
    };
  if (resource === "items") {
    const specificationValues: Record<string, string | number | boolean> = {};
    for (const [name, value] of form.entries())
      if (name.startsWith("specType:")) {
        const key = name.slice("specType:".length);
        const type = String(value);
        const raw = form.get(`specValue:${key}`);
        if (type === "boolean") specificationValues[key] = raw === "on";
        else if (raw !== null && String(raw).trim() !== "")
          specificationValues[key] =
            type === "number" ? Number(raw) : String(raw).trim();
      }
    return {
      ...base,
      specification: optional(form, "specification"),
      familyId: String(form.get("familyId")),
      model: optional(form, "model"),
      specificationValues,
      unitId: String(form.get("unitId")),
      brandIds: [],
    };
  }
  return {
    code: base.code,
    displayName: base.name,
    legalName: optional(form, "legalName"),
    taxIdentifier: optional(form, "taxIdentifier"),
    addressLine1: optional(form, "addressLine1"),
    addressLine2: optional(form, "addressLine2"),
    city: optional(form, "city"),
    state: optional(form, "state"),
    postalCode: optional(form, "postalCode"),
    country: optional(form, "country"),
    primaryContact: {
      name: String(form.get("contactName")),
      jobTitle: optional(form, "jobTitle"),
      phone: optional(form, "phone"),
      email: optional(form, "email"),
    },
  };
}
