import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { opportunitiesQuery, type CommercialState } from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const states: CommercialState[] = ["unawarded", "quoted", "awarded", "lost", "on_hold"];
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function OpportunitiesPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const state = (states.includes(params.get("state") as CommercialState) ? params.get("state") : undefined) as CommercialState | undefined;
  const opportunities = useQuery(opportunitiesQuery({ search: search || undefined, state }));
  function update(name: "search" | "state", value: string) { const next = new URLSearchParams(params); if (value && value !== "all") next.set(name, value); else next.delete(name); setParams(next, { replace: true }); }
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div><p className="text-sm font-semibold text-primary">CRM</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Opportunities</h1><p className="mt-2 text-muted-foreground">Qualified, assigned work appears here. Commercial award remains independent from technical progression.</p></div>
      <Card className="mt-6"><CardContent className="grid gap-3 sm:grid-cols-[1fr_14rem]"><label className="relative"><span className="sr-only">Search opportunities</span><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={18} /><Input className="min-h-11 pl-10" defaultValue={search} key={search} onBlur={(event) => update("search", event.target.value.trim())} onKeyDown={(event) => { if (event.key === "Enter") update("search", event.currentTarget.value.trim()); }} placeholder="Search title, customer or lead" /></label><Select onValueChange={(value) => update("state", value)} value={state ?? "all"}><SelectTrigger className="min-h-11 w-full" aria-label="Commercial state"><SelectValue placeholder="All commercial states" /></SelectTrigger><SelectContent><SelectItem value="all">All commercial states</SelectItem>{states.map((item) => <SelectItem key={item} value={item}>{label(item)}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Assigned opportunities</CardTitle><CardDescription>{opportunities.data ? `${opportunities.data.total} visible opportunit${opportunities.data.total === 1 ? "y" : "ies"}` : "Loading opportunities…"}</CardDescription></CardHeader><CardContent className="px-0">{opportunities.isPending ? <div className="space-y-3 px-5">{[1, 2, 3].map((item) => <Skeleton className="h-16" key={item} />)}</div> : opportunities.isError ? <Alert className="mx-5" variant="destructive"><AlertDescription>{getApiErrorMessage(opportunities.error)}</AlertDescription></Alert> : opportunities.data.items.length === 0 ? <div className="grid min-h-48 place-items-center p-6 text-center"><div><BriefcaseBusiness className="mx-auto text-muted-foreground" /><p className="mt-3 font-medium">No opportunities in this view</p><p className="mt-1 text-sm text-muted-foreground">Qualifying an assigned lead creates the first opportunity.</p></div></div> : <div className="divide-y divide-border">{opportunities.data.items.map((item) => <article className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" key={item.id}><div><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.customerName} · {item.leadNumber}</p></div><Badge variant="secondary">{label(item.commercialState)}</Badge></article>)}</div>}</CardContent></Card>
    </main>
  );
}
