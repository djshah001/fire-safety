import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDot, LoaderCircle, Plus, Search, Settings2 } from "lucide-react";
import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { CurrentUser } from "@/api/auth";
import { assigneesQuery, changeLeadStage, createLead, createServiceCategory, customerQuery, customersQuery, leadQuery, leadsQuery, qualifyLead, serviceCategoriesQuery, type DuplicateHint, type Lead, type LeadStage } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const stages: LeadStage[] = ["new", "contacted", "qualified", "design_authorized", "commercial_negotiation", "won", "lost", "on_hold"];
const formatStage = (stage: string) => stage.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function LeadsPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canAssign = user.permissions.includes("crm.lead.assign");
  const canManageCategories = user.permissions.includes("crm.service_category.manage");
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<"create" | "category" | "qualify">();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateHint[]>([]);
  const [lostLead, setLostLead] = useState<Lead>();
  const [lostReason, setLostReason] = useState("");
  const search = params.get("search") ?? "";
  const stage = (stages.includes(params.get("stage") as LeadStage) ? params.get("stage") : undefined) as LeadStage | undefined;
  const leads = useQuery(leadsQuery({ search: search || undefined, stage }));
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

  function updateFilter(name: "search" | "stage", value: string) { const next = new URLSearchParams(params); if (value && value !== "all") next.set(name, value); else next.delete(name); next.delete("page"); setParams(next, { replace: true }); }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">CRM</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Leads</h1><p className="mt-2 text-muted-foreground">Only assigned leads appear here. Qualification creates an opportunity; it does not mark the work as commercially won.</p></div><div className="flex gap-2">{canManageCategories && <Button className="min-h-11" onClick={() => setModal("category")} size="lg" variant="outline"><Settings2 />Services</Button>}<Button className="min-h-11" onClick={() => { setDuplicates([]); creation.reset(); setModal("create"); }} size="lg"><Plus />Add lead</Button></div></div>

      <Card className="mt-6"><CardContent className="grid gap-3 sm:grid-cols-[1fr_14rem]"><label className="relative"><span className="sr-only">Search leads</span><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={18} /><Input className="min-h-11 pl-10" defaultValue={search} key={search} onBlur={(event) => updateFilter("search", event.target.value.trim())} onKeyDown={(event) => { if (event.key === "Enter") updateFilter("search", event.currentTarget.value.trim()); }} placeholder="Search number, company or contact" /></label><Select onValueChange={(value) => updateFilter("stage", value)} value={stage ?? "all"}><SelectTrigger aria-label="Lead stage" className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{stages.map((item) => <SelectItem key={item} value={item}>{formatStage(item)}</SelectItem>)}</SelectContent></Select></CardContent></Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card><CardHeader><CardTitle>Assigned leads</CardTitle><CardDescription>{leads.data ? `${leads.data.total} visible lead${leads.data.total === 1 ? "" : "s"}` : "Loading leads…"}</CardDescription></CardHeader><CardContent className="px-0">{leads.isPending ? <div className="space-y-3 px-5">{[1, 2, 3].map((item) => <Skeleton className="h-24" key={item} />)}</div> : leads.isError ? <Alert className="mx-5" variant="destructive"><AlertDescription>{getApiErrorMessage(leads.error)}</AlertDescription></Alert> : leads.data.items.length === 0 ? <EmptyLeads /> : <div className="divide-y divide-border">{leads.data.items.map((lead) => <Button className={`h-auto w-full justify-start rounded-none px-5 py-4 text-left ${selectedId === lead.id ? "bg-accent" : ""}`} key={lead.id} onClick={() => setSelectedId(lead.id)} variant="ghost"><div className="w-full"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{lead.inquiryName}</p><Badge variant="secondary">{formatStage(lead.stage)}</Badge></div><p className="mt-1 text-sm font-normal text-muted-foreground">{lead.leadNumber} · {lead.serviceCategoryName}</p><p className="mt-1 text-sm font-normal text-muted-foreground">{lead.contactName}{lead.companyName ? ` · ${lead.companyName}` : ""}</p></div></Button>)}</div>}</CardContent></Card>

        <Card className="self-start xl:sticky xl:top-24">{!selectedId ? <CardContent className="text-sm text-muted-foreground">Select a lead to review its contact and permitted actions.</CardContent> : selectedLead.isPending ? <CardContent><Skeleton className="h-48" /></CardContent> : selectedLead.isError ? <CardContent><Alert variant="destructive"><AlertDescription>{getApiErrorMessage(selectedLead.error)}</AlertDescription></Alert></CardContent> : <><CardHeader><p className="text-xs font-semibold uppercase tracking-wider text-primary">{selectedLead.data.leadNumber}</p><CardTitle className="text-xl">{selectedLead.data.inquiryName}</CardTitle><CardDescription>{selectedLead.data.contactName} · {selectedLead.data.phone || selectedLead.data.email}</CardDescription></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Stage</dt><dd className="mt-1 font-medium">{formatStage(selectedLead.data.stage)}</dd></div><div><dt className="text-muted-foreground">Source</dt><dd className="mt-1 font-medium">{selectedLead.data.source}</dd></div></dl>{["new", "contacted", "on_hold"].includes(selectedLead.data.stage) && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5"><Button disabled={stageChange.isPending} onClick={() => stageChange.mutate({ lead: selectedLead.data, stage: selectedLead.data.stage === "contacted" ? "on_hold" : "contacted" })} variant="outline">{selectedLead.data.stage === "contacted" ? "Put on hold" : "Mark contacted"}</Button><Button disabled={stageChange.isPending} onClick={() => { setLostReason(""); setLostLead(selectedLead.data); }} variant="destructive">Mark lost</Button><Button onClick={() => { setSelectedCustomerId(""); qualification.reset(); setModal("qualify"); }}>Qualify</Button></div>}{stageChange.isError && <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(stageChange.error)}</AlertDescription></Alert>}</CardContent></>}</Card>
      </div>

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
