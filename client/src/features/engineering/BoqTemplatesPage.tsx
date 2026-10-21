import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { boqTemplateOptionsQuery, boqTemplatesQuery, saveBoqTemplate, type BoqTemplate } from '@/api/engineering';
import { getApiErrorMessage } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function BoqTemplatesPage() {
  const templates = useQuery(boqTemplatesQuery);
  const options = useQuery(boqTemplateOptionsQuery);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BoqTemplate | null | undefined>();
  const [sectorId, setSectorId] = useState('');
  const [costingUserId, setCostingUserId] = useState('');
  const [purchaseHeadUserId, setPurchaseHeadUserId] = useState('');
  const [adminApproverUserId, setAdminApproverUserId] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (editing === undefined) return;
    setSectorId(editing?.sectorId ?? '');
    setCostingUserId(editing?.costingUserId ?? '');
    setPurchaseHeadUserId(editing?.purchaseHeadUserId ?? '');
    setAdminApproverUserId(editing?.adminApproverUserId ?? '');
    setSelectedItems(new Set(editing?.items.map((item) => item.itemId) ?? []));
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (form: FormData) => saveBoqTemplate(editing?.id, {
      sectorId,
      name: String(form.get('name')),
      costingUserId,
      purchaseHeadUserId,
      adminApproverUserId,
      expectedVersion: editing?.rowVersion,
      items: [...selectedItems].map((itemId) => ({ itemId, section: String(form.get(`section-${itemId}`)) || 'General' })),
    }),
    async onSuccess() { await queryClient.invalidateQueries({ queryKey: ['engineering', 'boq-templates'] }); setEditing(undefined); toast.success('BOQ template saved.'); },
    onError(error) { toast.error(getApiErrorMessage(error)); },
  });

  if (templates.isPending || options.isPending) return <main className="mx-auto max-w-7xl space-y-5 p-6"><Skeleton className="h-9 w-64" /><Skeleton className="h-96" /></main>;
  if (templates.isError || options.isError) return <main className="mx-auto max-w-4xl p-6"><Alert variant="destructive"><AlertDescription>{getApiErrorMessage(templates.error ?? options.error)}</AlertDescription></Alert></main>;

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Engineering configuration</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Sector BOQ templates</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Each active market sector maps to an item scope and an explicit costing, purchase-review, and final-approval chain.</p></div><Button onClick={() => setEditing(null)}><Plus />New template</Button></div>
    <Card className="mt-6"><CardHeader><CardTitle>Configured templates</CardTitle><CardDescription>{templates.data.length} market sector template{templates.data.length === 1 ? '' : 's'}</CardDescription></CardHeader><CardContent className="px-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Sector / template</TableHead><TableHead>Items</TableHead><TableHead>Costing</TableHead><TableHead>Purchase approval</TableHead><TableHead>Final approval</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{templates.data.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground"><ClipboardList className="mx-auto mb-2" />No templates configured.</TableCell></TableRow> : templates.data.map((template) => <TableRow key={template.id}><TableCell><p className="font-medium">{template.sectorName}</p><p className="text-xs text-muted-foreground">{template.name}</p></TableCell><TableCell><Badge variant="secondary">{template.items.length}</Badge></TableCell><TableCell>{template.costingUserName}</TableCell><TableCell>{template.purchaseHeadUserName}</TableCell><TableCell>{template.adminApproverUserName}</TableCell><TableCell><Button size="icon-sm" variant="ghost" aria-label={`Edit ${template.name}`} onClick={() => setEditing(template)}><Pencil /></Button></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <Dialog open={editing !== undefined} onOpenChange={(open) => { if (!open) setEditing(undefined); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>{editing ? 'Edit BOQ template' : 'New BOQ template'}</DialogTitle><DialogDescription>Use different employees for costing, purchase approval, and final administrative approval. Contributors cannot approve their own work.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="Template name" name="name" defaultValue={editing?.name} required />
      <SelectField label="Market sector" value={sectorId} onValueChange={setSectorId} items={options.data.sectors.filter((item) => item.status === 'active').map((item) => ({ value: item.id, label: item.name }))} />
      <SelectField label="Purchase cost preparer" value={costingUserId} onValueChange={setCostingUserId} items={options.data.costingUsers.map((item) => ({ value: item.id, label: item.name }))} />
      <SelectField label="Purchase head" value={purchaseHeadUserId} onValueChange={setPurchaseHeadUserId} items={options.data.purchaseHeads.map((item) => ({ value: item.id, label: item.name }))} />
      <div className="sm:col-span-2"><SelectField label="Final administrative approver" value={adminApproverUserId} onValueChange={setAdminApproverUserId} items={options.data.adminApprovers.map((item) => ({ value: item.id, label: item.name }))} /></div>
      <div className="space-y-3 sm:col-span-2"><Label>Template items</Label><div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">{options.data.items.map((item) => { const checked = selectedItems.has(item.id); return <div key={item.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[auto_minmax(0,1fr)_14rem]"><Checkbox aria-label={`Include ${item.name}`} checked={checked} onCheckedChange={(value) => setSelectedItems((current) => { const next = new Set(current); if (value === true) next.add(item.id); else next.delete(item.id); return next; })} /><div><p className="text-sm font-medium">{item.code} · {item.name}</p><p className="text-xs text-muted-foreground">{item.specification || 'No specification'} · {item.unitSymbol}</p></div><Input name={`section-${item.id}`} defaultValue={editing?.items.find((entry) => entry.itemId === item.id)?.section ?? 'General'} disabled={!checked} aria-label={`${item.name} section`} placeholder="Section" /></div>; })}</div></div>
      {mutation.isError && <Alert className="sm:col-span-2" variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}
    </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !sectorId || !costingUserId || !purchaseHeadUserId || !adminApproverUserId || selectedItems.size === 0}>Save template</Button></DialogFooter></form></DialogContent></Dialog>
  </main>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`template-${name}`}>{label}</Label><Input id={`template-${name}`} name={name} {...props} /></div>; }
function SelectField({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
