import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, CircleDot, FileUp, LoaderCircle, Plus, Settings2, UserRoundCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { CurrentUser } from "@/api/auth";
import { assigneesQuery, bulkAssignLeads, bulkCreateReminders, changeLeadStage, createLead, createServiceCategory, customerQuery, customersQuery, leadQuery, leadsQuery, qualifyLead, serviceCategoriesQuery, type DuplicateHint, type Lead, type LeadStage } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import { ServerDataTable, type ServerColumn } from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LeadWorkPanel } from "@/features/crm/LeadWorkPanel";
import { CrmImportDialog } from "@/features/crm/CrmImportDialog";
import { AuthorizeDesignDialog } from "@/features/crm/AuthorizeDesignDialog";

const stages: LeadStage[] = ["new", "contacted", "qualified", "design_authorized", "commercial_negotiation", "won", "lost", "on_hold"];
const formatStage = (stage: string) => stage.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function LeadsPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canWrite = user.permissions.includes("crm.lead.write");
  const canAssign = user.permissions.includes("crm.lead.assign");
  const canManageCategories = user.permissions.includes("crm.service_category.manage");
  const canAuthorizeDesign = user.permissions.includes("crm.lead.authorize_design");
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<"create" | "category" | "qualify">();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateHint[]>([]);
  const [lostLead, setLostLead] = useState<Lead>();
  const [lostReason, setLostReason] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAuthorizeDesign, setShowAuthorizeDesign] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Map<string, Lead>>(new Map());
  const [bulkAction, setBulkAction] = useState<"assign" | "reminder">();
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");
  const search = params.get("search") ?? "";
  const stage = (stages.includes(params.get("stage") as LeadStage) ? params.get("stage") : undefined) as LeadStage | undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize"))) ? Number(params.get("pageSize")) : 20;
  const sort = (["leadNumber", "inquiryName", "stage", "updatedAt"].includes(params.get("sort") ?? "") ? params.get("sort") : "updatedAt") as "leadNumber" | "inquiryName" | "stage" | "updatedAt";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  const leads = useQuery(leadsQuery({ search: search || undefined, stage, page, pageSize, sort, direction }));
  const categories = useQuery(serviceCategoriesQuery());
  const assignees = useQuery({ ...assigneesQuery, enabled: canAssign });
  const selectedLead = useQuery(leadQuery(selectedId));
  const customers = useQuery({ ...customersQuery(), enabled: modal === "qualify" });
  const selectedCustomer = useQuery(customerQuery(selectedCustomerId || undefined));
  const queryClient = useQueryClient();

  const creation = useMutation({
    mutationFn: (form: FormData) => createLead({ inquiryName: String(form.get("inquiryName")), companyName: String(form.get("companyName")) || undefined, contactName: String(form.get("contactName")), phone: String(form.get("phone")) || undefined, email: String(form.get("email")) || undefined, address: String(form.get("address")) || undefined, source: String(form.get("source")), serviceCategoryId: String(form.get("serviceCategoryId")), ownerUserId: String(form.get("ownerUserId")) || undefined }),
    async onSuccess(result) { setDuplicates(result.duplicateHints); await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }); setSelectedId(result.lead.id); if (result.duplicateHints.length === 0) setModal(undefined); },
  });
  const categoryCreation = useMutation({
    mutationFn: (form: FormData) => createServiceCategory({ code: String(form.get("code")), name: String(form.get("name")) }),
    async onSuccess() { await queryClient.invalidateQueries({ queryKey: ["crm", "service-categories"] }); setModal(undefined); },
  });
  const stageChange = useMutation({
    mutationFn: (input: { lead: Lead; stage: "contacted" | "on_hold" | "lost"; reason?: string }) => changeLeadStage({ leadId: input.lead.id, expectedVersion: input.lead.rowVersion, stage: input.stage, reason: input.reason }),
    async onSuccess(lead) { await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }); queryClient.setQueryData(["crm", "lead", lead.id], lead); setLostLead(undefined); setLostReason(""); },
  });
  const qualification = useMutation({
    mutationFn: (form: FormData) => {
      if (!selectedLead.data) throw new Error("Lead is unavailable.");
      return qualifyLead({ leadId: selectedLead.data.id, expectedVersion: selectedLead.data.rowVersion, customerId: String(form.get("customerId")), primaryContactId: String(form.get("primaryContactId")), siteId: String(form.get("siteId")) || undefined, title: String(form.get("title")), qualificationNotes: String(form.get("qualificationNotes")) });
    },
    async onSuccess() { await Promise.all([queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }), queryClient.invalidateQueries({ queryKey: ["crm", "opportunities"] }), queryClient.invalidateQueries({ queryKey: ["crm", "customers"] })]); if (selectedId) await queryClient.invalidateQueries({ queryKey: ["crm", "lead", selectedId] }); setModal(undefined); },
  });
  const bulkAssignment = useMutation({
    mutationFn: () => bulkAssignLeads({
      targets: [...selectedLeads.values()].map((lead) => ({ id: lead.id, expectedVersion: lead.rowVersion })),
      assigneeUserId: bulkAssigneeId,
    }),
    async onSuccess(result) {
      toast.success(`${result.updated} lead${result.updated === 1 ? "" : "s"} assigned.`);
      setSelectedLeads(new Map());
      setBulkAction(undefined);
      setSelectedId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
    },
  });
  const bulkReminder = useMutation({
    mutationFn: (form: FormData) => bulkCreateReminders({
      targets: [...selectedLeads.values()].map((lead) => ({ id: lead.id, expectedVersion: lead.rowVersion })),
      title: String(form.get("title")),
      assigneeUserId: !form.get("assigneeUserId") || form.get("assigneeUserId") === "self" ? undefined : String(form.get("assigneeUserId")),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      dueAt: new Date(String(form.get("dueAt"))).toISOString(),
      recurrence: String(form.get("recurrence")) as "none" | "daily" | "weekly" | "monthly",
    }),
    async onSuccess(result) {
      toast.success(`${result.created} reminder${result.created === 1 ? "" : "s"} scheduled.`);
      setSelectedLeads(new Map());
      setBulkAction(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "reminders"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "lead"] }),
      ]);
    },
  });

  function updateFilter(name: "search" | "stage", value: string) { setSelectedLeads(new Map()); const next = new URLSearchParams(params); if (value && value !== "all") next.set(name, value); else next.delete(name); next.delete("page"); setParams(next, { replace: true }); }

  function updateList(values: Record<string, string | number>) { setSelectedLeads(new Map()); const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) next.set(key, String(value)); setParams(next, { replace: true }); }
  const columns: Array<ServerColumn<Lead, typeof sort>> = [
    { key: "lead", label: "Lead", sort: "inquiryName", className: "min-w-64", cell: (lead) => <div><p className="font-medium">{lead.inquiryName}</p><p className="text-xs text-muted-foreground">{lead.leadNumber} · {lead.serviceCategoryName}</p></div> },
    { key: "contact", label: "Contact", cell: (lead) => <div><p>{lead.contactName}</p><p className="text-xs text-muted-foreground">{lead.companyName || lead.phone || lead.email}</p></div> },
    { key: "stage", label: "Stage", sort: "stage", cell: (lead) => <StatusBadge status={lead.stage} /> },
    { key: "updated", label: "Updated", sort: "updatedAt", className: "tabular-nums", cell: (lead) => new Date(lead.updatedAt).toLocaleDateString() },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">CRM</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Leads</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Only assigned leads appear here. Qualification creates an opportunity; it does not mark the work as commercially won.</p></div><div className="flex flex-wrap gap-2">{canManageCategories && <Button onClick={() => setModal("category")} variant="outline"><Settings2 />Services</Button>}{canWrite && <Button onClick={() => setShowImport(true)} variant="outline"><FileUp />Import</Button>}{canWrite && <Button onClick={() => { setDuplicates([]); creation.reset(); setModal("create"); }}><Plus />Add lead</Button>}</div></div>

      <div className="mt-6"><ListToolbar search={search} onSearch={(value) => updateFilter("search", value)} activeFilters={stage ? 1 : 0} onClear={() => updateFilter("stage", "all")}><div className="space-y-2"><Label>Stage</Label><Select onValueChange={(value) => updateFilter("stage", value)} value={stage ?? "all"}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{stages.map((item) => <SelectItem key={item} value={item}>{formatStage(item)}</SelectItem>)}</SelectContent></Select></div></ListToolbar></div>

      {selectedLead.data && <div className="mt-6"><LeadWorkPanel lead={selectedLead.data} canAssign={canAssign} assignees={assignees.data ?? []} /></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card><CardHeader className="pb-3"><CardTitle>Assigned leads</CardTitle><CardDescription>{leads.data ? `${leads.data.total} visible lead${leads.data.total === 1 ? "" : "s"}` : "Loading leads…"}</CardDescription></CardHeader><CardContent className="px-0">{leads.isError ? <Alert className="mx-5" variant="destructive"><AlertDescription>{getApiErrorMessage(leads.error)}</AlertDescription></Alert> : <ServerDataTable columns={columns} rows={leads.data?.items ?? []} rowKey={(lead) => lead.id} loading={leads.isPending} empty={<EmptyLeads />} sort={sort} direction={direction} onSort={(nextSort, nextDirection) => updateList({ sort: nextSort, direction: nextDirection, page: 1 })} page={page} pageSize={pageSize} total={leads.data?.total ?? 0} onPageChange={(nextPage) => updateList({ page: nextPage })} onPageSizeChange={(nextSize) => updateList({ pageSize: nextSize, page: 1 })} onRowClick={(lead) => setSelectedId(lead.id)} selection={(canWrite || canAssign) ? { selectedKeys: new Set(selectedLeads.keys()), rowLabel: (lead) => lead.inquiryName, onToggle: (lead, selected) => setSelectedLeads((current) => { const next = new Map(current); if (selected) next.set(lead.id, lead); else next.delete(lead.id); return next; }), onToggleAll: (pageRows, selected) => setSelectedLeads((current) => { const next = new Map(current); pageRows.forEach((lead) => { if (selected) next.set(lead.id, lead); else next.delete(lead.id); }); return next; }) } : undefined} />}</CardContent></Card>

        <Card className="self-start xl:sticky xl:top-24">{!selectedId ? <CardContent className="text-sm text-muted-foreground">Select a lead to review its contact and permitted actions.</CardContent> : selectedLead.isPending ? <CardContent><Skeleton className="h-48" /></CardContent> : selectedLead.isError ? <CardContent><Alert variant="destructive"><AlertDescription>{getApiErrorMessage(selectedLead.error)}</AlertDescription></Alert></CardContent> : <><CardHeader><p className="text-xs font-semibold uppercase tracking-wider text-primary">{selectedLead.data.leadNumber}</p><CardTitle className="text-xl">{selectedLead.data.inquiryName}</CardTitle><CardDescription>{selectedLead.data.contactName} · {selectedLead.data.phone || selectedLead.data.email}</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Stage</dt><dd className="mt-1 font-medium">{formatStage(selectedLead.data.stage)}</dd></div><div><dt className="text-muted-foreground">Source</dt><dd className="mt-1 font-medium">{selectedLead.data.source}</dd></div></dl>{["new", "contacted", "on_hold"].includes(selectedLead.data.stage) && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5"><Button disabled={stageChange.isPending} onClick={() => stageChange.mutate({ lead: selectedLead.data, stage: selectedLead.data.stage === "contacted" ? "on_hold" : "contacted" })} variant="outline">{selectedLead.data.stage === "contacted" ? "Put on hold" : "Mark contacted"}</Button><Button disabled={stageChange.isPending} onClick={() => { setLostReason(""); setLostLead(selectedLead.data); }} variant="destructive">Mark lost</Button><Button onClick={() => { setSelectedCustomerId(""); qualification.reset(); setModal("qualify"); }}>Qualify</Button></div>}{selectedLead.data.stage === "qualified" && canAuthorizeDesign && <div className="mt-5 border-t border-border pt-5"><Button className="w-full" onClick={() => setShowAuthorizeDesign(true)}>Authorize free design</Button><p className="mt-2 text-xs text-muted-foreground">Creates an engineering handoff while the opportunity remains commercially unawarded.</p></div>}{selectedLead.data.stage === "design_authorized" && <Alert className="mt-5"><AlertTitle>Free design authorized</AlertTitle><AlertDescription>The assigned engineering handoff is ready for the P3 design workspace. Commercial award remains independent.</AlertDescription></Alert>}{stageChange.isError && <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(stageChange.error)}</AlertDescription></Alert>}</CardContent></>}</Card>
      </div>

      {selectedLeads.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur-md sm:bottom-6 sm:w-auto sm:rounded-full">
          <span className="px-2 text-sm font-medium tabular-nums">{selectedLeads.size} selected</span>
          {canAssign && <Button onClick={() => { setBulkAssigneeId(""); bulkAssignment.reset(); setBulkAction("assign"); }} size="sm" variant="outline"><UserRoundCheck />Assign owner</Button>}
          {canWrite && <Button onClick={() => { bulkReminder.reset(); setBulkAction("reminder"); }} size="sm"><BellPlus />Schedule reminder</Button>}
          <Button aria-label="Clear selection" onClick={() => setSelectedLeads(new Map())} size="icon-sm" variant="ghost"><X /></Button>
        </div>
      )}

      <Dialog onOpenChange={(open) => { if (!open) setBulkAction(undefined); }} open={bulkAction === "assign"}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign selected leads</DialogTitle><DialogDescription>Replace the current owner on {selectedLeads.size} selected lead{selectedLeads.size === 1 ? "" : "s"}. Previous owners lose owner-based visibility.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label>New owner</Label><Select onValueChange={setBulkAssigneeId} value={bulkAssigneeId}><SelectTrigger className="w-full"><SelectValue placeholder="Choose an active CRM employee" /></SelectTrigger><SelectContent>{assignees.data?.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.email}</SelectItem>)}</SelectContent></Select></div>
          {bulkAssignment.isError && <ErrorMessage error={bulkAssignment.error} />}
          <DialogFooter><Button onClick={() => setBulkAction(undefined)} type="button" variant="outline">Cancel</Button><Button disabled={!bulkAssigneeId || bulkAssignment.isPending} onClick={() => bulkAssignment.mutate()} type="button">{bulkAssignment.isPending && <LoaderCircle className="animate-spin" />}Assign {selectedLeads.size}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) setBulkAction(undefined); }} open={bulkAction === "reminder"}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={(event) => { event.preventDefault(); bulkReminder.mutate(new FormData(event.currentTarget)); }}>
            <DialogHeader><DialogTitle>Schedule reminders</DialogTitle><DialogDescription>Create the same auditable reminder for each of the {selectedLeads.size} selected leads.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="bulk-reminder-title">Title</Label><Input id="bulk-reminder-title" minLength={3} name="title" placeholder="Follow up with customer" required /></div>
              <div className="space-y-2"><Label htmlFor="bulk-reminder-due">Due at</Label><Input id="bulk-reminder-due" name="dueAt" required type="datetime-local" /></div>
              <SelectField items={[{ label: "One time", value: "none" }, { label: "Daily", value: "daily" }, { label: "Weekly", value: "weekly" }, { label: "Monthly", value: "monthly" }]} label="Recurrence" name="recurrence" placeholder="Choose recurrence" required defaultValue="none" />
              {canAssign && <div className="sm:col-span-2"><SelectField items={[{ label: "Assign to me", value: "self" }, ...(assignees.data?.map((assignee) => ({ label: assignee.name, value: assignee.id })) ?? [])]} label="Assignee" name="assigneeUserId" placeholder="Assign to me" defaultValue="self" /></div>}
            </div>
            {bulkReminder.isError && <ErrorMessage error={bulkReminder.error} />}
            <DialogFooter className="mt-6"><Button onClick={() => setBulkAction(undefined)} type="button" variant="outline">Cancel</Button><Button disabled={bulkReminder.isPending} type="submit">{bulkReminder.isPending && <LoaderCircle className="animate-spin" />}Schedule {selectedLeads.size}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CrmImportDialog
        onCommitted={() => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] })}
        onOpenChange={setShowImport}
        open={showImport}
        type="open_leads"
      />
      <AuthorizeDesignDialog lead={selectedLead.data} onOpenChange={setShowAuthorizeDesign} open={showAuthorizeDesign} />

      {modal === "create" && <Modal description="Record the enquiry and assign its service and owner." title="New lead" onClose={() => setModal(undefined)}><form onSubmit={(event) => { event.preventDefault(); creation.mutate(new FormData(event.currentTarget)); }}><div className="grid gap-4 sm:grid-cols-2"><Field label="Inquiry / lead name" name="inquiryName" required /><Field label="Company (optional)" name="companyName" /><Field label="Contact name" name="contactName" required /><Field label="Source" name="source" placeholder="Referral, website, walk-in…" required /><Field label="Phone" name="phone" /><Field label="Email" name="email" type="email" /><SelectField items={categories.data?.map((item) => ({ label: item.name, value: item.id })) ?? []} label="Service" name="serviceCategoryId" placeholder="Choose service" required />{canAssign && <SelectField items={assignees.data?.map((item) => ({ label: item.name, value: item.id })) ?? []} label="Owner" name="ownerUserId" placeholder="Assign to me" />}<div className="space-y-2 sm:col-span-2"><Label htmlFor="lead-address">Address (optional)</Label><Textarea id="lead-address" name="address" /></div></div><p className="mt-3 text-xs text-muted-foreground">A name and either phone or email are required.</p>{duplicates.length > 0 && <DuplicateNotice items={duplicates} />}{creation.isError && <ErrorMessage error={creation.error} />}<ModalActions pending={creation.isPending} submit="Create lead" onCancel={() => setModal(undefined)} /></form></Modal>}
      {modal === "category" && <Modal description="Add an enabled service choice for lead capture." title="New service category" onClose={() => setModal(undefined)}><form onSubmit={(event) => { event.preventDefault(); categoryCreation.mutate(new FormData(event.currentTarget)); }}><Field label="Code" name="code" placeholder="FIRE_ALARM" required /><div className="mt-4"><Field label="Name" name="name" required /></div>{categoryCreation.isError && <ErrorMessage error={categoryCreation.error} />}<ModalActions pending={categoryCreation.isPending} submit="Add service" onCancel={() => setModal(undefined)} /></form></Modal>}
      {modal === "qualify" && selectedLead.data && <Modal description="Link an in-scope customer and create an unawarded opportunity." title="Qualify lead" onClose={() => setModal(undefined)}><form onSubmit={(event) => { event.preventDefault(); qualification.mutate(new FormData(event.currentTarget)); }}><SelectField items={customers.data?.items.map((item) => ({ label: item.displayName, value: item.id })) ?? []} label="Customer" name="customerId" onValueChange={setSelectedCustomerId} placeholder="Choose an in-scope customer" required value={selectedCustomerId || undefined} /><div className="mt-4"><SelectField disabled={!selectedCustomer.data} items={selectedCustomer.data?.contacts.filter((item) => item.status === "active").map((item) => ({ label: item.name, value: item.id })) ?? []} label="Primary contact" name="primaryContactId" placeholder="Choose contact" required /></div><div className="mt-4"><SelectField disabled={!selectedCustomer.data} items={selectedCustomer.data?.sites.filter((item) => item.status === "active").map((item) => ({ label: item.name, value: item.id })) ?? []} label="Site (optional at qualification)" name="siteId" placeholder="No site selected" /></div><div className="mt-4"><Field defaultValue={selectedLead.data.inquiryName} label="Opportunity title" name="title" required /></div><div className="mt-4 space-y-2"><Label htmlFor="qualification-notes">Qualification notes</Label><Textarea id="qualification-notes" minLength={3} name="qualificationNotes" required /></div><p className="mt-3 text-xs text-muted-foreground">This creates an unawarded opportunity. It does not confirm a quotation, customer PO, or project start.</p>{qualification.isError && <ErrorMessage error={qualification.error} />}<ModalActions pending={qualification.isPending} submit="Create opportunity" onCancel={() => setModal(undefined)} /></form></Modal>}

      <Dialog onOpenChange={(open) => { if (!open) setLostLead(undefined); }} open={Boolean(lostLead)}><DialogContent className="sm:max-w-md">{lostLead && <form onSubmit={(event) => { event.preventDefault(); stageChange.mutate({ lead: lostLead, stage: "lost", reason: lostReason.trim() }); }}><DialogHeader><DialogTitle>Mark lead as lost</DialogTitle><DialogDescription>Record why this enquiry will not progress. The history remains auditable.</DialogDescription></DialogHeader><div className="mt-5 space-y-2"><Label htmlFor="lost-reason">Reason</Label><Textarea id="lost-reason" minLength={3} onChange={(event) => setLostReason(event.target.value)} required value={lostReason} /></div>{stageChange.isError && <ErrorMessage error={stageChange.error} />}<DialogFooter className="mt-5"><Button onClick={() => setLostLead(undefined)} type="button" variant="outline">Cancel</Button><Button disabled={stageChange.isPending || lostReason.trim().length < 3} type="submit" variant="destructive">{stageChange.isPending && <LoaderCircle className="animate-spin" />}Mark lost</Button></DialogFooter></form>}</DialogContent></Dialog>
    </main>
  );
}

function EmptyLeads() { return <div className="grid min-h-48 place-items-center p-6 text-center"><div><CircleDot className="mx-auto text-muted-foreground" /><p className="mt-3 font-medium">No leads in this view</p><p className="mt-1 text-sm text-muted-foreground">Create a lead or change the filters.</p></div></div>; }
function Field({ label, name, ...input }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={`lead-${name}`}>{label}</Label><Input className="min-h-11" id={`lead-${name}`} name={name} {...input} /></div>; }
function SelectField({ label, name, items, placeholder, ...props }: { label: string; name: string; items: Array<{ label: string; value: string }>; placeholder: string } & React.ComponentProps<typeof Select>) { const id = `lead-${name}`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Select name={name} {...props}><SelectTrigger className="min-h-11 w-full" id={id}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) { return <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>; }
function ModalActions({ pending, submit, onCancel }: { pending: boolean; submit: string; onCancel: () => void }) { return <DialogFooter className="mt-6"><Button onClick={onCancel} type="button" variant="outline">Cancel</Button><Button disabled={pending} type="submit">{pending && <LoaderCircle className="animate-spin" />}{submit}</Button></DialogFooter>; }
function ErrorMessage({ error }: { error: unknown }) { return <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(error)}</AlertDescription></Alert>; }
function DuplicateNotice({ items }: { items: DuplicateHint[] }) { return <Alert className="mt-4"><AlertTitle>Possible duplicates found; the records were not merged.</AlertTitle><AlertDescription><ul className="mt-2 list-disc pl-5">{items.map((item) => <li key={`${item.type}-${item.id}`}>{item.label} — {item.reason}</li>)}</ul></AlertDescription></Alert>; }
