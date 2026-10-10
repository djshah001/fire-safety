import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addCustomerContact, addCustomerSite, customerQuery } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function CustomerDetailPage() {
  const { id } = useParams();
  const customer = useQuery(customerQuery(id));
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<"contact" | "site">();
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!id || !panel) throw new Error("Customer is unavailable.");
      if (panel === "contact") return addCustomerContact(id, { name: String(form.get("name")), phone: String(form.get("phone")) || undefined, email: String(form.get("email")) || undefined, isPrimary: false });
      return addCustomerSite(id, { name: String(form.get("name")), addressLine1: String(form.get("addressLine1")), city: String(form.get("city")) });
    },
    async onSuccess() { await queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] }); setPanel(undefined); },
  });

  if (customer.isPending) return <main className="mx-auto max-w-5xl space-y-5 p-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-28 w-full" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></main>;
  if (customer.isError) return <main className="mx-auto max-w-4xl p-6"><Button asChild variant="link"><Link to="/crm/customers"><ArrowLeft />Customers</Link></Button><Alert className="mt-6" variant="destructive"><AlertDescription>{getApiErrorMessage(customer.error, "Customer is unavailable or outside your assigned scope.")}</AlertDescription></Alert></main>;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <Button asChild className="-ml-2" variant="ghost"><Link to="/crm/customers"><ArrowLeft />Customers</Link></Button>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">Customer</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{customer.data.displayName}</h1><p className="mt-2 text-muted-foreground">{customer.data.legalName || "No separate legal name recorded"}</p></div><Badge className="capitalize" variant="secondary">{customer.data.status}</Badge></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader className="border-b"><CardTitle>Contacts</CardTitle><CardDescription>{customer.data.contacts.length} recorded</CardDescription><CardAction><Button aria-label="Add contact" className="size-10" onClick={() => setPanel("contact")} size="icon" variant="outline"><Plus /></Button></CardAction></CardHeader><CardContent className="px-0"><div className="divide-y divide-border">{customer.data.contacts.map((contact) => <article className="flex gap-3 px-5 py-4" key={contact.id}><UserRound className="mt-0.5 text-muted-foreground" size={19} /><div><p className="font-medium">{contact.name}{contact.isPrimary ? " · Primary" : ""}</p><p className="mt-1 text-sm text-muted-foreground">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p></div></article>)}</div></CardContent></Card>
        <Card><CardHeader className="border-b"><CardTitle>Sites</CardTitle><CardDescription>{customer.data.sites.length} recorded</CardDescription><CardAction><Button aria-label="Add site" className="size-10" onClick={() => setPanel("site")} size="icon" variant="outline"><Plus /></Button></CardAction></CardHeader><CardContent className="px-0">{customer.data.sites.length === 0 ? <p className="px-5 text-sm text-muted-foreground">No site has been added yet.</p> : <div className="divide-y divide-border">{customer.data.sites.map((site) => <article className="flex gap-3 px-5 py-4" key={site.id}><MapPin className="mt-0.5 text-muted-foreground" size={19} /><div><p className="font-medium">{site.name}</p><p className="mt-1 text-sm text-muted-foreground">{site.addressLine1}, {site.city}</p></div></article>)}</div>}</CardContent></Card>
      </div>
      <Dialog onOpenChange={(open) => { if (!open) setPanel(undefined); }} open={Boolean(panel)}>
        <DialogContent className="sm:max-w-md">{panel && <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}><DialogHeader><DialogTitle>Add {panel}</DialogTitle><DialogDescription>Add a {panel} to this customer master.</DialogDescription></DialogHeader><div className="mt-5 space-y-4"><Field label="Name" name="name" required />{panel === "contact" ? <><Field label="Phone" name="phone" /><Field label="Email" name="email" type="email" /><p className="text-xs text-muted-foreground">At least one contact method is required.</p></> : <><Field label="Address" name="addressLine1" required /><Field label="City" name="city" required /></>}</div>{mutation.isError && <Alert className="mt-4" variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}<DialogFooter className="mt-6"><Button onClick={() => setPanel(undefined)} type="button" variant="outline">Cancel</Button><Button disabled={mutation.isPending} type="submit">Save</Button></DialogFooter></form>}</DialogContent>
      </Dialog>
    </main>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return <div className="space-y-2"><Label htmlFor={`detail-${name}`}>{label}</Label><Input className="min-h-11" id={`detail-${name}`} name={name} {...props} /></div>;
}
