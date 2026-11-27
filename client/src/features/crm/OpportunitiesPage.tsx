import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  DraftingCompass,
  ExternalLink,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  UserRound,
} from "lucide-react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  opportunitiesQuery,
  opportunityQuery,
  type CommercialState,
  type Opportunity,
} from "@/api/crm";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import { ServerDataTable, type ServerColumn } from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { OpportunityDocumentsCard } from "@/features/crm/OpportunityDocumentsCard";

const states: CommercialState[] = ["unawarded", "quoted", "awarded", "lost", "on_hold"];
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
type Sort = "title" | "customerName" | "state" | "updatedAt";

export function OpportunitiesPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canUploadDocs =
    user.permissions.includes("crm.lead.write") ||
    user.permissions.includes("crm.lead.qualify") ||
    user.permissions.includes("system.access.all");

  const [params, setParams] = useSearchParams();
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>();

  const search = params.get("search") ?? "";
  const state = (
    states.includes(params.get("state") as CommercialState)
      ? params.get("state")
      : undefined
  ) as CommercialState | undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;
  const sort = (
    ["title", "customerName", "state", "updatedAt"].includes(params.get("sort") ?? "")
      ? params.get("sort")
      : "updatedAt"
  ) as Sort;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const opportunities = useQuery(
    opportunitiesQuery({
      search: search || undefined,
      state,
      page,
      pageSize,
      sort,
      direction,
    }),
  );
  const selectedOpportunity = useQuery(opportunityQuery(selectedOpportunityId));

  function update(values: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value === undefined || value === "" || value === "all"
        ? next.delete(key)
        : next.set(key, String(value)),
    );
    if (!("page" in values)) next.delete("page");
    setParams(next, { replace: true });
  }

  const columns: Array<ServerColumn<Opportunity, Sort>> = [
    {
      key: "title",
      label: "Opportunity",
      sort: "title",
      className: "min-w-64",
      cell: (item) => (
        <div className="space-y-0.5">
          <p className="font-semibold text-xs text-foreground">{item.title}</p>
          <p className="text-[11px] font-mono text-muted-foreground">{item.leadNumber}</p>
        </div>
      ),
    },
    {
      key: "customer",
      label: "Customer / Site",
      sort: "customerName",
      cell: (item) => (
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground">{item.customerName}</p>
          {item.siteName && (
            <p className="text-[11px] text-muted-foreground">{item.siteName}</p>
          )}
        </div>
      ),
    },
    {
      key: "owner",
      label: "Owner",
      cell: (item) => <span className="text-xs">{item.ownerName ?? "—"}</span>,
    },
    {
      key: "state",
      label: "Commercial State",
      sort: "state",
      cell: (item) => (
        <StatusBadge label={label(item.commercialState)} status={item.commercialState} />
      ),
    },
    {
      key: "design",
      label: "Design & Docs",
      cell: (item) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.designStatus ? (
            <StatusBadge status={item.designStatus} className="text-[10px]" />
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Not authorized
            </Badge>
          )}
          <Badge variant="secondary" className="gap-1 text-[10px] font-mono">
            <Paperclip className="size-2.5" />
            {item.attachmentCount ?? 0}
          </Badge>
        </div>
      ),
    },
    {
      key: "updated",
      label: "Updated",
      sort: "updatedAt",
      className: "tabular-nums text-xs font-mono text-muted-foreground",
      cell: (item) => new Date(item.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">CRM</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">Opportunities</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Qualified inquiries with customer accounts and shared documents. Click any opportunity to
          upload additional documents or inspect linked engineering work.
        </p>
      </div>

      <div className="mt-6">
        <ListToolbar
          search={search}
          searchPlaceholder="Search by opportunity title, customer name, or lead number…"
          onSearch={(value) => update({ search: value })}
          activeFilters={state ? 1 : 0}
          onClear={() => update({ state: undefined })}
          activeChips={
            state
              ? [
                  {
                    key: "state",
                    label: `State: ${label(state)}`,
                    onRemove: () => update({ state: undefined }),
                  },
                ]
              : []
          }
        >
          <div className="space-y-2">
            <Label>Commercial state</Label>
            <Select value={state ?? "all"} onValueChange={(value) => update({ state: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {states.map((item) => (
                  <SelectItem key={item} value={item}>
                    {label(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ListToolbar>
      </div>

      <Card className="mt-4 overflow-hidden shadow-xs">
        <CardHeader className="border-b bg-card/60 p-4 pb-3 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Opportunities Pipeline</CardTitle>
            <CardDescription className="text-xs">
              {opportunities.data
                ? `${opportunities.data.total} record${opportunities.data.total === 1 ? "" : "s"}`
                : "Loading opportunities…"}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[11px] font-mono">
            Page {page}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {opportunities.isError ? (
            <Alert className="m-4" variant="destructive">
              <AlertDescription>{getApiErrorMessage(opportunities.error)}</AlertDescription>
            </Alert>
          ) : (
            <ServerDataTable
              columns={columns}
              rows={opportunities.data?.items ?? []}
              rowKey={(item) => item.id}
              loading={opportunities.isPending}
              empty={
                <div>
                  <BriefcaseBusiness className="mx-auto mb-2" />
                  No opportunities in this view.
                </div>
              }
              sort={sort}
              direction={direction}
              onSort={(nextSort, nextDirection) =>
                update({ sort: nextSort, direction: nextDirection })
              }
              page={page}
              pageSize={pageSize}
              total={opportunities.data?.total ?? 0}
              onPageChange={(nextPage) => update({ page: nextPage })}
              onPageSizeChange={(nextSize) => update({ pageSize: nextSize, page: 1 })}
              onRowClick={(item) => setSelectedOpportunityId(item.id)}
            />
          )}
        </CardContent>
      </Card>

      {/* Opportunity Workspace & Post-Conversion Document Upload Sheet */}
      <Sheet
        open={Boolean(selectedOpportunityId)}
        onOpenChange={(open) => !open && setSelectedOpportunityId(undefined)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl h-full flex flex-col p-0 gap-0 bg-background"
        >
          <SheetHeader className="border-b bg-card px-6 py-4 pr-14 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {selectedOpportunity.data?.leadNumber && (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {selectedOpportunity.data.leadNumber}
                </Badge>
              )}
              {selectedOpportunity.data && (
                <StatusBadge
                  label={label(selectedOpportunity.data.commercialState)}
                  status={selectedOpportunity.data.commercialState}
                />
              )}
            </div>
            <SheetTitle className="mt-1 text-base font-semibold">
              {selectedOpportunity.data?.title ?? "Opportunity Details"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              View customer contact, engineering status, and upload additional client documents
              anytime after conversion.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {selectedOpportunity.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-44 w-full" />
              </div>
            ) : selectedOpportunity.isError ? (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  {getApiErrorMessage(selectedOpportunity.error)}
                </AlertDescription>
              </Alert>
            ) : (
              selectedOpportunity.data && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-card p-3.5 space-y-1.5 text-xs">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Customer &amp; Contact
                      </p>
                      <p className="font-semibold text-sm text-foreground">
                        {selectedOpportunity.data.customerName}
                      </p>
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <UserRound className="size-3.5 text-primary" />
                        {selectedOpportunity.data.contactName}
                      </p>
                      {selectedOpportunity.data.contactPhone && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3.5" />
                          {selectedOpportunity.data.contactPhone}
                        </p>
                      )}
                      {selectedOpportunity.data.contactEmail && (
                        <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                          <Mail className="size-3.5" />
                          {selectedOpportunity.data.contactEmail}
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border bg-card p-3.5 space-y-1.5 text-xs">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Site &amp; Engineering Link
                      </p>
                      {selectedOpportunity.data.siteName ? (
                        <p className="flex items-center gap-1.5 text-foreground font-medium">
                          <MapPin className="size-3.5 text-primary shrink-0" />
                          {selectedOpportunity.data.siteName}
                          {selectedOpportunity.data.siteCity
                            ? ` (${selectedOpportunity.data.siteCity})`
                            : ""}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">No specific site linked.</p>
                      )}
                      <p className="text-muted-foreground">
                        Owner:{" "}
                        <span className="font-medium text-foreground">
                          {selectedOpportunity.data.ownerName}
                        </span>
                      </p>
                      {selectedOpportunity.data.designJobId ? (
                        <Button asChild size="sm" variant="outline" className="mt-1 h-8 text-xs">
                          <Link
                            to={`/engineering/design-jobs/${selectedOpportunity.data.designJobId}`}
                          >
                            <DraftingCompass className="size-3.5 mr-1.5" />
                            Open Design Job
                            <ExternalLink className="size-3 ml-1" />
                          </Link>
                        </Button>
                      ) : (
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Design job not yet authorized.
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedOpportunity.data.qualificationNotes && (
                    <div className="rounded-xl border bg-muted/20 p-3.5 text-xs space-y-1">
                      <p className="font-semibold text-foreground">Qualification Notes</p>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {selectedOpportunity.data.qualificationNotes}
                      </p>
                    </div>
                  )}

                  <OpportunityDocumentsCard
                    opportunityId={selectedOpportunity.data.id}
                    canUpload={canUploadDocs}
                  />
                </>
              )
            )}
          </div>

          <SheetFooter className="border-t bg-card px-6 py-3 flex-row justify-end shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedOpportunityId(undefined)}
            >
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}
