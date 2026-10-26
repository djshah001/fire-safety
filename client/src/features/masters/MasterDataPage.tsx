import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Factory, LoaderCircle, Pencil, Plus, Power, Ruler, Tags, Truck } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CurrentUser } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import {
  createMaster,
  deactivateMaster,
  masterListQuery,
  masterLookupsQuery,
  updateMaster,
  type Brand,
  type Item,
  type ItemCategory,
  type MasterResource,
  type MasterSort,
  type MasterStatus,
  type Unit,
  type Vendor,
} from '@/api/masters';
import { ListToolbar } from '@/components/data-table/ListToolbar';
import { ServerDataTable, type ServerColumn } from '@/components/data-table/ServerDataTable';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type MasterRow = Unit | ItemCategory | Brand | Item | Vendor;
type Configuration = {
  title: string; singular: string; description: string; resource: MasterResource;
  icon: typeof Boxes; readPermission: string; managePermission: string;
};

const configurations: Record<string, Configuration> = {
  '/masters/vendors': { title: 'Vendors', singular: 'vendor', description: 'Operational supplier identity and primary contacts for later procurement.', resource: 'vendors', icon: Truck, readPermission: 'procurement.vendor.read', managePermission: 'procurement.vendor.manage' },
  '/masters/items': { title: 'Items', singular: 'item', description: 'Technical item identity, specification, category, purchasing unit, and allowed brands/makes.', resource: 'items', icon: Boxes, readPermission: 'procurement.item.read', managePermission: 'procurement.item.manage' },
  '/masters/brands': { title: 'Brands & makes', singular: 'brand/make', description: 'Approved makes that can be assigned to items and selected on quotation lines.', resource: 'brands', icon: Factory, readPermission: 'procurement.item.read', managePermission: 'procurement.item.manage' },
  '/masters/item-categories': { title: 'Item categories', singular: 'category', description: 'Controlled groupings used by the technical item master.', resource: 'item-categories', icon: Tags, readPermission: 'procurement.item.read', managePermission: 'procurement.item.manage' },
  '/masters/units': { title: 'Units', singular: 'unit', description: 'Controlled units of measure. No conversion or valuation policy is implied.', resource: 'units', icon: Ruler, readPermission: 'procurement.item.read', managePermission: 'procurement.item.manage' },
};

function rowName(row: MasterRow) {
  return 'displayName' in row ? row.displayName : row.name;
}

function detail(row: MasterRow) {
  if ('primaryContact' in row) return row.primaryContact ? `${row.primaryContact.name} · ${row.primaryContact.phone || row.primaryContact.email}` : 'No primary contact';
  if ('categoryName' in row) return `${row.categoryName} · ${row.unitName} (${row.unitSymbol}) · ${row.brands.length > 0 ? row.brands.map((brand) => brand.name).join(', ') : 'No makes configured'}`;
  if ('symbol' in row) return row.symbol;
  return 'Item grouping';
}

export function MasterDataPage() {
  const location = useLocation();
  const config = configurations[location.pathname] ?? configurations['/masters/items']!;
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canManage = user.permissions.includes(config.managePermission);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<MasterRow | 'new'>();
  const [deactivating, setDeactivating] = useState<MasterRow>();
  const search = params.get('search') ?? '';
  const status = (['active', 'inactive'].includes(params.get('status') ?? '') ? params.get('status') : undefined) as MasterStatus | undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20;
  const sort = (['code', 'name', 'status', 'updatedAt'].includes(params.get('sort') ?? '') ? params.get('sort') : 'name') as MasterSort;
  const direction = params.get('direction') === 'desc' ? 'desc' : 'asc';
  const records = useQuery(masterListQuery<MasterRow>(config.resource, { search: search || undefined, status, page, pageSize, sort, direction }));
  const unitLookups = useQuery({ ...masterLookupsQuery('units'), enabled: config.resource === 'items' && Boolean(editing) });
  const categoryLookups = useQuery({ ...masterLookupsQuery('item-categories'), enabled: config.resource === 'items' && Boolean(editing) });
  const brandLookups = useQuery({ ...masterLookupsQuery('brands'), enabled: config.resource === 'items' && Boolean(editing) });
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (form: FormData) => {
      const input = masterInput(config.resource, form);
      return editing === 'new'
        ? createMaster(config.resource, input)
        : updateMaster(config.resource, editing!.id, { ...input, expectedVersion: editing!.rowVersion });
    },
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['masters', config.resource] });
      toast.success(`${config.singular.replace(/^./, (value) => value.toUpperCase())} ${editing === 'new' ? 'created' : 'updated'}.`);
      setEditing(undefined);
    },
  });
  const deactivate = useMutation({
    mutationFn: (form: FormData) => deactivateMaster(config.resource, deactivating!.id, deactivating!.rowVersion, String(form.get('reason'))),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['masters', config.resource] });
      toast.success(`${config.singular.replace(/^./, (value) => value.toUpperCase())} deactivated.`);
      setDeactivating(undefined);
    },
  });

  const updateUrl = (values: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === '' || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  };
  const columns: Array<ServerColumn<MasterRow, MasterSort>> = [
    { key: 'code', label: 'Code', sort: 'code', className: 'w-32 font-mono text-xs', cell: (row) => row.code },
    { key: 'name', label: 'Name', sort: 'name', className: 'min-w-56', cell: (row) => <div><p className="font-medium">{rowName(row)}</p><p className="max-w-md truncate text-xs text-muted-foreground">{detail(row)}</p></div> },
    { key: 'status', label: 'Status', sort: 'status', cell: (row) => <StatusBadge status={row.status} /> },
    { key: 'updated', label: 'Updated', sort: 'updatedAt', className: 'tabular-nums', cell: (row) => new Date(row.updatedAt).toLocaleDateString() },
    ...(canManage ? [{ key: 'actions', label: 'Actions', className: 'w-28 text-right', cell: (row: MasterRow) => <div className="flex justify-end gap-1"><Button aria-label={`Edit ${rowName(row)}`} onClick={() => { save.reset(); setEditing(row); }} size="icon-sm" variant="ghost"><Pencil /></Button>{row.status === 'active' && <Button aria-label={`Deactivate ${rowName(row)}`} onClick={() => { deactivate.reset(); setDeactivating(row); }} size="icon-sm" variant="ghost"><Power /></Button>}</div> }] : []),
  ];
  const Icon = config.icon;

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Masters</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight"><Icon className="size-6" />{config.title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{config.description}</p></div>{canManage && <Button onClick={() => { save.reset(); setEditing('new'); }}><Plus />Add {config.singular}</Button>}</div>
    <div className="mt-6"><ListToolbar search={search} onSearch={(value) => updateUrl({ search: value, page: 1 })} activeFilters={status ? 1 : 0} onClear={() => updateUrl({ status: undefined, page: 1 })}><div className="space-y-2"><Label>Status</Label><Select value={status ?? 'all'} onValueChange={(value) => updateUrl({ status: value, page: 1 })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div></ListToolbar></div>
    <Card className="mt-4 overflow-hidden"><CardHeader className="border-b"><CardTitle>{config.title}</CardTitle><CardDescription>{records.data ? `${records.data.total} total record${records.data.total === 1 ? '' : 's'}` : 'Loading records…'}</CardDescription></CardHeader><CardContent className="p-0">{records.isError ? <Alert className="m-4" variant="destructive"><AlertDescription>{getApiErrorMessage(records.error)}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={records.data?.items ?? []} rowKey={(row) => row.id} loading={records.isPending} empty={<div><Icon className="mx-auto mb-2" />No {config.title.toLowerCase()} in this view.</div>} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => updateUrl({ sort: nextSort, direction: nextDirection, page: 1 })} page={page} pageSize={pageSize} total={records.data?.total ?? 0} onPageChange={(nextPage) => updateUrl({ page: nextPage })} onPageSizeChange={(nextSize) => updateUrl({ pageSize: nextSize, page: 1 })} />}</CardContent></Card>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(undefined)}><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">{editing && <form onSubmit={(event) => { event.preventDefault(); save.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{editing === 'new' ? 'Add' : 'Edit'} {config.singular}</DialogTitle><DialogDescription>Changes are validated on the server and recorded in the audit history.</DialogDescription></DialogHeader><MasterForm resource={config.resource} row={editing === 'new' ? undefined : editing} units={unitLookups.data?.items ?? []} categories={categoryLookups.data?.items ?? []} brands={brandLookups.data?.items ?? []} />{save.isError && <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(save.error)}</AlertDescription></Alert>}<DialogFooter className="mt-6"><Button onClick={() => setEditing(undefined)} type="button" variant="outline">Cancel</Button><Button disabled={save.isPending} type="submit">{save.isPending && <LoaderCircle className="animate-spin" />}Save {config.singular}</Button></DialogFooter></form>}</DialogContent></Dialog>

    <Dialog open={Boolean(deactivating)} onOpenChange={(open) => !open && setDeactivating(undefined)}><DialogContent className="sm:max-w-md">{deactivating && <form onSubmit={(event) => { event.preventDefault(); deactivate.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>Deactivate {rowName(deactivating)}?</DialogTitle><DialogDescription>Historical references remain available. This record will no longer be offered for new work.</DialogDescription></DialogHeader><div className="mt-5 space-y-2"><Label htmlFor="deactivate-reason">Reason</Label><Textarea id="deactivate-reason" minLength={3} maxLength={500} name="reason" required /></div>{deactivate.isError && <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(deactivate.error)}</AlertDescription></Alert>}<DialogFooter className="mt-6"><Button onClick={() => setDeactivating(undefined)} type="button" variant="outline">Cancel</Button><Button disabled={deactivate.isPending} type="submit" variant="destructive">{deactivate.isPending && <LoaderCircle className="animate-spin" />}Deactivate</Button></DialogFooter></form>}</DialogContent></Dialog>
  </main>;
}

function Field({ label, name, defaultValue, ...props }: { label: string; name: string; defaultValue?: string | null } & Omit<React.ComponentProps<typeof Input>, 'defaultValue'>) {
  return <div className="space-y-2"><Label htmlFor={`master-${name}`}>{label}</Label><Input defaultValue={defaultValue ?? ''} id={`master-${name}`} name={name} {...props} /></div>;
}

function MasterForm({ resource, row, units, categories, brands }: { resource: MasterResource; row?: MasterRow; units: Array<Unit | ItemCategory | Brand>; categories: Array<Unit | ItemCategory | Brand>; brands: Array<Unit | ItemCategory | Brand> }) {
  const vendor = row && 'displayName' in row ? row : undefined;
  const item = row && 'categoryName' in row ? row : undefined;
  return <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Field defaultValue={row?.code} label="Code" maxLength={50} name="code" required />
    <Field defaultValue={row ? rowName(row) : ''} label={resource === 'vendors' ? 'Display name' : 'Name'} maxLength={160} name="name" required />
    {resource === 'units' && <Field defaultValue={row && 'symbol' in row ? row.symbol : ''} label="Symbol" maxLength={20} name="symbol" required />}
    {resource === 'items' && <><div className="space-y-2"><Label htmlFor="master-category">Category</Label><Select defaultValue={item?.categoryId} name="categoryId" required><SelectTrigger id="master-category"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="master-unit">Unit</Label><Select defaultValue={item?.unitId} name="unitId" required><SelectTrigger id="master-unit"><SelectValue placeholder="Choose unit" /></SelectTrigger><SelectContent>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}{'symbol' in unit ? ` (${unit.symbol})` : ''}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="master-specification">Specification</Label><Textarea defaultValue={item?.specification ?? ''} id="master-specification" maxLength={2_000} name="specification" /></div><fieldset className="space-y-3 rounded-lg border p-4 sm:col-span-2"><legend className="px-1 text-sm font-medium">Allowed brands / makes</legend>{brands.length === 0 ? <Alert><AlertDescription>Create an active brand/make before saving an item.</AlertDescription></Alert> : <div className="grid gap-3 sm:grid-cols-2">{brands.map((brand) => <Label className="flex items-center gap-3 rounded-md border p-3 font-normal" key={brand.id}><Checkbox defaultChecked={item?.brands.some((assigned) => assigned.id === brand.id)} name="brandIds" value={brand.id} /><span>{brand.name} <span className="text-xs text-muted-foreground">({brand.code})</span></span></Label>)}</div>}</fieldset></>}
    {resource === 'vendors' && <><Field defaultValue={vendor?.legalName} label="Legal name" maxLength={200} name="legalName" /><Field defaultValue={vendor?.taxIdentifier} label="Tax identifier (optional)" maxLength={40} name="taxIdentifier" /><Field defaultValue={vendor?.addressLine1} label="Address line 1" maxLength={200} name="addressLine1" /><Field defaultValue={vendor?.addressLine2} label="Address line 2" maxLength={200} name="addressLine2" /><Field defaultValue={vendor?.city} label="City" maxLength={100} name="city" /><Field defaultValue={vendor?.state} label="State" maxLength={100} name="state" /><Field defaultValue={vendor?.postalCode} label="Postal code" maxLength={20} name="postalCode" /><Field defaultValue={vendor?.country} label="Country" maxLength={100} name="country" /><div className="sm:col-span-2 border-t pt-4"><p className="text-sm font-medium">Primary contact</p></div><Field defaultValue={vendor?.primaryContact?.name} label="Contact name" maxLength={120} name="contactName" required /><Field defaultValue={vendor?.primaryContact?.jobTitle} label="Job title" maxLength={100} name="jobTitle" /><Field defaultValue={vendor?.primaryContact?.phone} label="Phone" maxLength={30} name="phone" /><Field defaultValue={vendor?.primaryContact?.email} label="Email" maxLength={254} name="email" type="email" /></>}
  </div>;
}

function optional(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim() || undefined;
}

function masterInput(resource: MasterResource, form: FormData): Record<string, unknown> {
  const base = { code: String(form.get('code')), name: String(form.get('name')) };
  if (resource === 'units') return { ...base, symbol: String(form.get('symbol')) };
  if (resource === 'item-categories' || resource === 'brands') return base;
  if (resource === 'items') return { ...base, specification: optional(form, 'specification'), categoryId: String(form.get('categoryId')), unitId: String(form.get('unitId')), brandIds: form.getAll('brandIds').map(String) };
  return {
    code: base.code,
    displayName: base.name,
    legalName: optional(form, 'legalName'), taxIdentifier: optional(form, 'taxIdentifier'),
    addressLine1: optional(form, 'addressLine1'), addressLine2: optional(form, 'addressLine2'), city: optional(form, 'city'),
    state: optional(form, 'state'), postalCode: optional(form, 'postalCode'), country: optional(form, 'country'),
    primaryContact: { name: String(form.get('contactName')), jobTitle: optional(form, 'jobTitle'), phone: optional(form, 'phone'), email: optional(form, 'email') },
  };
}
