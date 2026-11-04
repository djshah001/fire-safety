import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  BellPlus,
  CircleDot,
  FileUp,
  Loader2,
  Plus,
  Settings2,
  UserRoundCheck,
  X,
  Phone,
  Mail,
  Building,
  Target,
  ArrowRight,
  ShieldCheck,
  DraftingCompass,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import {
  assigneesQuery,
  bulkAssignLeads,
  bulkCreateReminders,
  changeLeadStage,
  createLead,
  createLeadClassification,
  createServiceCategory,
  customerQuery,
  customersQuery,
  leadClassificationsQuery,
  leadQuery,
  leadsQuery,
  qualifyLead,
  serviceCategoriesQuery,
  type DuplicateHint,
  type Lead,
  type LeadStage,
} from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import { ListToolbar } from "@/components/data-table/ListToolbar";
import {
  ServerDataTable,
  type ServerColumn,
} from "@/components/data-table/ServerDataTable";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LeadWorkPanel } from "@/features/crm/LeadWorkPanel";
import { CrmImportDialog } from "@/features/crm/CrmImportDialog";
import { AuthorizeDesignDialog } from "@/features/crm/AuthorizeDesignDialog";
import { cn } from "@/lib/utils";

const stages: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "design_authorized",
  "commercial_negotiation",
  "won",
  "lost",
  "on_hold",
];

const formatStage = (stage: string) =>
  stage.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function LeadsPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canWrite = user.permissions.includes("crm.lead.write");
  const canAssign = user.permissions.includes("crm.lead.assign");
  const canManageCategories = user.permissions.includes(
    "crm.service_category.manage",
  );
  const canAuthorizeDesign = user.permissions.includes(
    "crm.lead.authorize_design",
  );

  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<
    "create" | "category" | "purpose" | "sector" | "qualify"
  >();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateHint[]>([]);
  const [lostLead, setLostLead] = useState<Lead>();
  const [lostReason, setLostReason] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAuthorizeDesign, setShowAuthorizeDesign] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Map<string, Lead>>(
    new Map(),
  );
  const [bulkAction, setBulkAction] = useState<"assign" | "reminder">();
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");

  const search = params.get("search") ?? "";
  const stage = (
    stages.includes(params.get("stage") as LeadStage)
      ? params.get("stage")
      : undefined
  ) as LeadStage | undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;
  const sort = (
    ["leadNumber", "inquiryName", "stage", "updatedAt"].includes(
      params.get("sort") ?? "",
    )
      ? params.get("sort")
      : "updatedAt"
  ) as "leadNumber" | "inquiryName" | "stage" | "updatedAt";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const leads = useQuery(
    leadsQuery({
      search: search || undefined,
      stage,
      page,
      pageSize,
      sort,
      direction,
    }),
  );
  const categories = useQuery(serviceCategoriesQuery());
  const purposes = useQuery(leadClassificationsQuery("purposes"));
  const sectors = useQuery(leadClassificationsQuery("sectors"));
  const assignees = useQuery({ ...assigneesQuery, enabled: canAssign });
  const selectedLead = useQuery(leadQuery(selectedId));
  const customers = useQuery({
    ...customersQuery(),
    enabled: modal === "qualify",
  });
  const selectedCustomer = useQuery(
    customerQuery(selectedCustomerId || undefined),
  );
  const queryClient = useQueryClient();

  const creation = useMutation({
    mutationFn: (form: FormData) =>
      createLead({
        inquiryName: String(form.get("inquiryName")),
        companyName: String(form.get("companyName")) || undefined,
        contactName: String(form.get("contactName")),
        phone: String(form.get("phone")) || undefined,
        email: String(form.get("email")) || undefined,
        address: String(form.get("address")) || undefined,
        source: String(form.get("source")),
        serviceCategoryId: String(form.get("serviceCategoryId")),
        purposeId: String(form.get("purposeId")),
        sectorId: String(form.get("sectorId")),
        ownerUserId: String(form.get("ownerUserId")) || undefined,
      }),
    async onSuccess(result) {
      setDuplicates(result.duplicateHints);
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      setSelectedId(result.lead.id);
      if (result.duplicateHints.length === 0) setModal(undefined);
      toast.success("Lead created.");
    },
  });

  const categoryCreation = useMutation({
    mutationFn: (form: FormData) =>
      createServiceCategory({
        code: String(form.get("code")),
        name: String(form.get("name")),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["crm", "service-categories"],
      });
      setModal(undefined);
      toast.success("Service category added.");
    },
  });

  const classificationCreation = useMutation({
    mutationFn: (form: FormData) =>
      createLeadClassification(modal === "purpose" ? "purposes" : "sectors", {
        code: String(form.get("code")),
        name: String(form.get("name")),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["crm", "classifications"],
      });
      setModal(undefined);
      toast.success("Lead classification added.");
    },
  });

  const stageChange = useMutation({
    mutationFn: (input: {
      lead: Lead;
      stage: "contacted" | "on_hold" | "lost";
      reason?: string;
    }) =>
      changeLeadStage({
        leadId: input.lead.id,
        expectedVersion: input.lead.rowVersion,
        stage: input.stage,
        reason: input.reason,
      }),
    async onSuccess(lead) {
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      queryClient.setQueryData(["crm", "lead", lead.id], lead);
      setLostLead(undefined);
      setLostReason("");
      toast.success("Lead stage updated.");
    },
  });

  const qualification = useMutation({
    mutationFn: (form: FormData) => {
      if (!selectedLead.data) throw new Error("Lead is unavailable.");
      return qualifyLead({
        leadId: selectedLead.data.id,
        expectedVersion: selectedLead.data.rowVersion,
        customerId: String(form.get("customerId")),
        primaryContactId: String(form.get("primaryContactId")),
        siteId: String(form.get("siteId")) || undefined,
        title: String(form.get("title")),
        qualificationNotes: String(form.get("qualificationNotes")),
      });
    },
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "customers"] }),
      ]);
      if (selectedId)
        await queryClient.invalidateQueries({
          queryKey: ["crm", "lead", selectedId],
        });
      setModal(undefined);
      toast.success("Lead qualified into opportunity.");
    },
  });

  const bulkAssignment = useMutation({
    mutationFn: () =>
      bulkAssignLeads({
        targets: [...selectedLeads.values()].map((lead) => ({
          id: lead.id,
          expectedVersion: lead.rowVersion,
        })),
        assigneeUserId: bulkAssigneeId,
      }),
    async onSuccess(result) {
      toast.success(
        `${result.updated} lead${result.updated === 1 ? "" : "s"} assigned.`,
      );
      setSelectedLeads(new Map());
      setBulkAction(undefined);
      setSelectedId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
    },
  });

  const bulkReminder = useMutation({
    mutationFn: (form: FormData) =>
      bulkCreateReminders({
        targets: [...selectedLeads.values()].map((lead) => ({
          id: lead.id,
          expectedVersion: lead.rowVersion,
        })),
        title: String(form.get("title")),
        assigneeUserId:
          !form.get("assigneeUserId") || form.get("assigneeUserId") === "self"
            ? undefined
            : String(form.get("assigneeUserId")),
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        dueAt: new Date(String(form.get("dueAt"))).toISOString(),
        recurrence: String(form.get("recurrence")) as
          | "none"
          | "daily"
          | "weekly"
          | "monthly",
      }),
    async onSuccess(result) {
      toast.success(
        `${result.created} reminder${result.created === 1 ? "" : "s"} scheduled.`,
      );
      setSelectedLeads(new Map());
      setBulkAction(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "reminders"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "lead"] }),
      ]);
    },
  });

  function updateFilter(name: "search" | "stage", value: string) {
    setSelectedLeads(new Map());
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(name, value);
    else next.delete(name);
    next.delete("page");
    setParams(next, { replace: true });
  }

  function updateList(values: Record<string, string | number>) {
    setSelectedLeads(new Map());
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      next.set(key, String(value));
    setParams(next, { replace: true });
  }

  const columns: Array<ServerColumn<Lead, typeof sort>> = [
    {
      key: "lead",
      label: "Lead / Inquiry",
      sort: "inquiryName",
      className: "min-w-[240px]",
      cell: (lead) => (
        <div className="space-y-0.5">
          <p className="font-semibold text-xs text-foreground hover:text-primary transition-colors">
            {lead.inquiryName}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
            <span>{lead.leadNumber}</span>
            <span>•</span>
            <span className="font-sans text-foreground/80">
              {lead.serviceCategoryName}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "classification",
      label: "Purpose / Sector",
      className: "min-w-[180px]",
      cell: (lead) => (
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground">{lead.purposeName}</p>
          <p className="text-[11px] text-muted-foreground">{lead.sectorName}</p>
        </div>
      ),
    },
    {
      key: "contact",
      label: "Contact Person",
      className: "min-w-[200px]",
      cell: (lead) => (
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground">{lead.contactName}</p>
          <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]">
            {lead.companyName || lead.phone || lead.email}
          </p>
        </div>
      ),
    },
    {
      key: "stage",
      label: "Stage",
      sort: "stage",
      className: "min-w-[120px]",
      cell: (lead) => <StatusBadge status={lead.stage} />,
    },
    {
      key: "updated",
      label: "Updated",
      sort: "updatedAt",
      className: "tabular-nums text-xs font-mono text-muted-foreground",
      cell: (lead) => new Date(lead.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            CRM & Pipeline
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Leads Register
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground leading-relaxed">
            Only assigned leads appear in this scope. Purpose and market sector classify
            the enquiry; the chosen sector selects its matching technical BOQ template.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageCategories && (
            <>
              <Button
                onClick={() => setModal("category")}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
              >
                <Settings2 className="size-3.5 mr-1" />
                Services
              </Button>
              <Button
                onClick={() => setModal("purpose")}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
              >
                <Plus className="size-3.5 mr-1" />
                Purpose
              </Button>
              <Button
                onClick={() => setModal("sector")}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
              >
                <Plus className="size-3.5 mr-1" />
                Sector
              </Button>
            </>
          )}
          {canWrite && (
            <Button
              onClick={() => setShowImport(true)}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
            >
              <FileUp className="size-3.5 mr-1" />
              Import
            </Button>
          )}
          {canWrite && (
            <Button
              onClick={() => {
                setDuplicates([]);
                creation.reset();
                setModal("create");
              }}
              size="sm"
              className="h-8 text-xs"
            >
              <Plus className="size-3.5 mr-1" />
              Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mt-6">
        <ListToolbar
          search={search}
          onSearch={(value) => updateFilter("search", value)}
          activeFilters={stage ? 1 : 0}
          onClear={() => updateFilter("stage", "all")}
        >
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Filter by Stage</Label>
            <Select
              onValueChange={(value) => updateFilter("stage", value)}
              value={stage ?? "all"}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {stages.map((item) => (
                  <SelectItem key={item} value={item} className="text-xs">
                    {formatStage(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ListToolbar>
      </div>

      {/* Embedded Lead Work Panel (Activities / Reminders / Files) */}
      {selectedLead.data && (
        <div className="mt-6">
          <LeadWorkPanel
            lead={selectedLead.data}
            canAssign={canAssign}
            assignees={assignees.data ?? []}
          />
        </div>
      )}

      {/* Main Table + Sticky Inspector Layout */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="shadow-xs overflow-hidden">
          <CardHeader className="border-b bg-card/60 p-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Assigned Leads</CardTitle>
                <CardDescription className="text-xs">
                  {leads.data
                    ? `${leads.data.total} visible record${leads.data.total === 1 ? "" : "s"}`
                    : "Loading records…"}
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono">
                Page {page}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {leads.isError ? (
              <Alert className="m-4" variant="destructive">
                <AlertDescription className="text-xs">
                  {getApiErrorMessage(leads.error)}
                </AlertDescription>
              </Alert>
            ) : (
              <ServerDataTable
                columns={columns}
                rows={leads.data?.items ?? []}
                rowKey={(lead) => lead.id}
                loading={leads.isPending}
                empty={<EmptyLeads />}
                sort={sort}
                direction={direction}
                onSort={(nextSort, nextDirection) =>
                  updateList({
                    sort: nextSort,
                    direction: nextDirection,
                    page: 1,
                  })
                }
                page={page}
                pageSize={pageSize}
                total={leads.data?.total ?? 0}
                onPageChange={(nextPage) => updateList({ page: nextPage })}
                onPageSizeChange={(nextSize) =>
                  updateList({ pageSize: nextSize, page: 1 })
                }
                onRowClick={(lead) => setSelectedId(lead.id)}
                selection={
                  canWrite || canAssign
                    ? {
                        selectedKeys: new Set(selectedLeads.keys()),
                        rowLabel: (lead) => lead.inquiryName,
                        onToggle: (lead, selected) =>
                          setSelectedLeads((current) => {
                            const next = new Map(current);
                            if (selected) next.set(lead.id, lead);
                            else next.delete(lead.id);
                            return next;
                          }),
                        onToggleAll: (pageRows, selected) =>
                          setSelectedLeads((current) => {
                            const next = new Map(current);
                            pageRows.forEach((lead) => {
                              if (selected) next.set(lead.id, lead);
                              else next.delete(lead.id);
                            });
                            return next;
                          }),
                      }
                    : undefined
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Sticky Detail Inspector Drawer */}
        <Card className="self-start xl:sticky xl:top-20 shadow-xs border-border/80">
          {!selectedId ? (
            <CardContent className="p-8 text-center text-xs text-muted-foreground">
              <Target className="mx-auto mb-2 size-6 text-muted-foreground/40" />
              Select a lead from the table to inspect details, actions, and qualifications.
            </CardContent>
          ) : selectedLead.isPending ? (
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          ) : selectedLead.isError ? (
            <CardContent className="p-4">
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  {getApiErrorMessage(selectedLead.error)}
                </AlertDescription>
              </Alert>
            </CardContent>
          ) : (
            <>
              <CardHeader className="border-b bg-card/60 p-4 pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-primary">
                    {selectedLead.data.leadNumber}
                  </span>
                  <StatusBadge status={selectedLead.data.stage} />
                </div>
                <CardTitle className="text-base font-semibold pt-1">
                  {selectedLead.data.inquiryName}
                </CardTitle>
                <CardDescription className="text-xs">
                  {selectedLead.data.contactName}
                  {selectedLead.data.companyName ? ` (${selectedLead.data.companyName})` : ""}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Contact Links */}
                <div className="grid grid-cols-1 gap-1.5 rounded-lg border bg-muted/20 p-2.5 text-xs">
                  {selectedLead.data.phone && (
                    <a
                      href={`tel:${selectedLead.data.phone}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Phone className="size-3.5 text-primary" />
                      <span>{selectedLead.data.phone}</span>
                    </a>
                  )}
                  {selectedLead.data.email && (
                    <a
                      href={`mailto:${selectedLead.data.email}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      <Mail className="size-3.5 text-primary" />
                      <span className="truncate">{selectedLead.data.email}</span>
                    </a>
                  )}
                  {selectedLead.data.address && (
                    <p className="flex items-start gap-2 text-[11px] text-muted-foreground pt-1 border-t">
                      <Building className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{selectedLead.data.address}</span>
                    </p>
                  )}
                </div>

                {/* Classification Pills */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2 bg-card">
                    <span className="text-[10px] text-muted-foreground block">
                      Purpose
                    </span>
                    <span className="font-medium text-foreground truncate block">
                      {selectedLead.data.purposeName}
                    </span>
                  </div>
                  <div className="rounded-md border p-2 bg-card">
                    <span className="text-[10px] text-muted-foreground block">
                      Sector
                    </span>
                    <span className="font-medium text-foreground truncate block">
                      {selectedLead.data.sectorName}
                    </span>
                  </div>
                </div>

                {/* Stage Progression Actions */}
                {["new", "contacted", "on_hold"].includes(
                  selectedLead.data.stage,
                ) && (
                  <div className="space-y-2 border-t pt-3">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Pipeline Actions
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={stageChange.isPending}
                        onClick={() =>
                          stageChange.mutate({
                            lead: selectedLead.data,
                            stage:
                              selectedLead.data.stage === "contacted"
                                ? "on_hold"
                                : "contacted",
                          })
                        }
                        variant="outline"
                        className="h-8 text-xs flex-1"
                      >
                        {selectedLead.data.stage === "contacted"
                          ? "Put on hold"
                          : "Mark contacted"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={stageChange.isPending}
                        onClick={() => {
                          setLostReason("");
                          setLostLead(selectedLead.data);
                        }}
                        variant="destructive"
                        className="h-8 text-xs"
                      >
                        Mark lost
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedCustomerId("");
                          qualification.reset();
                          setModal("qualify");
                        }}
                        className="h-8 text-xs w-full"
                      >
                        Qualify into Opportunity →
                      </Button>
                    </div>
                  </div>
                )}

                {/* Authorize Design Stage */}
                {selectedLead.data.stage === "qualified" &&
                  canAuthorizeDesign && (
                    <div className="space-y-2 border-t pt-3">
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => setShowAuthorizeDesign(true)}
                      >
                        <DraftingCompass className="size-3.5 mr-1.5" />
                        Authorize Free Design
                      </Button>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Triggers engineering handoff while opportunity remains unawarded.
                      </p>
                    </div>
                  )}

                {selectedLead.data.stage === "design_authorized" && (
                  <Alert className="bg-primary/5 border-primary/20">
                    <ShieldCheck className="size-4 text-primary" />
                    <AlertTitle className="text-xs font-semibold">
                      Design Authorized
                    </AlertTitle>
                    <AlertDescription className="text-xs text-muted-foreground">
                      Ready for CAD workspace engineering. Commercial award is independent.
                    </AlertDescription>
                  </Alert>
                )}

                {stageChange.isError && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {getApiErrorMessage(stageChange.error)}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Floating Animated Bulk Action Bar */}
      <AnimatePresence>
        {selectedLeads.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center justify-between gap-2 rounded-2xl border border-border/80 bg-background/95 px-3.5 py-2 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {selectedLeads.size}
              </span>
              <span className="text-xs font-medium text-foreground">Selected</span>
            </div>

            <div className="flex items-center gap-1.5">
              {canAssign && (
                <Button
                  onClick={() => {
                    setBulkAssigneeId("");
                    bulkAssignment.reset();
                    setBulkAction("assign");
                  }}
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                >
                  <UserRoundCheck className="size-3.5 mr-1" />
                  Assign
                </Button>
              )}
              {canWrite && (
                <Button
                  onClick={() => {
                    bulkReminder.reset();
                    setBulkAction("reminder");
                  }}
                  size="sm"
                  className="h-8 text-xs"
                >
                  <BellPlus className="size-3.5 mr-1" />
                  Reminder
                </Button>
              )}
              <Button
                aria-label="Clear selection"
                onClick={() => setSelectedLeads(new Map())}
                size="icon-sm"
                variant="ghost"
                className="size-8"
              >
                <X className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Assign Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setBulkAction(undefined);
        }}
        open={bulkAction === "assign"}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Selected Leads</DialogTitle>
            <DialogDescription className="text-xs">
              Replace the owner for {selectedLeads.size} selected lead
              {selectedLeads.size === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-1.5">
            <Label className="text-xs font-semibold">New Assigned Owner</Label>
            <Select onValueChange={setBulkAssigneeId} value={bulkAssigneeId}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Choose active CRM employee…" />
              </SelectTrigger>
              <SelectContent>
                {assignees.data?.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id} className="text-xs">
                    {assignee.name} ({assignee.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {bulkAssignment.isError && (
            <ErrorMessage error={bulkAssignment.error} />
          )}

          <DialogFooter className="mt-6 border-t pt-3">
            <Button
              onClick={() => setBulkAction(undefined)}
              type="button"
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              disabled={!bulkAssigneeId || bulkAssignment.isPending}
              onClick={() => bulkAssignment.mutate()}
              type="button"
              size="sm"
            >
              {bulkAssignment.isPending && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              Assign {selectedLeads.size} Lead{selectedLeads.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reminder Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setBulkAction(undefined);
        }}
        open={bulkAction === "reminder"}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              bulkReminder.mutate(new FormData(event.currentTarget));
            }}
          >
            <DialogHeader>
              <DialogTitle>Schedule Batch Reminders</DialogTitle>
              <DialogDescription className="text-xs">
                Create a linked follow-up for each of the {selectedLeads.size} selected leads.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bulk-reminder-title" className="text-xs font-semibold">
                  Reminder Title
                </Label>
                <Input
                  id="bulk-reminder-title"
                  minLength={3}
                  name="title"
                  placeholder="e.g. Follow up on proposal"
                  className="h-9 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bulk-reminder-due" className="text-xs font-semibold">
                  Due At
                </Label>
                <Input
                  id="bulk-reminder-due"
                  name="dueAt"
                  type="datetime-local"
                  className="h-9 text-sm"
                  required
                />
              </div>

              <SelectField
                items={[
                  { label: "One time", value: "none" },
                  { label: "Daily", value: "daily" },
                  { label: "Weekly", value: "weekly" },
                  { label: "Monthly", value: "monthly" },
                ]}
                label="Recurrence"
                name="recurrence"
                placeholder="Choose recurrence"
                required
                defaultValue="none"
              />

              {canAssign && (
                <div className="sm:col-span-2">
                  <SelectField
                    items={[
                      { label: "Assign to me", value: "self" },
                      ...(assignees.data?.map((assignee) => ({
                        label: assignee.name,
                        value: assignee.id,
                      })) ?? []),
                    ]}
                    label="Assignee"
                    name="assigneeUserId"
                    placeholder="Assign to me"
                    defaultValue="self"
                  />
                </div>
              )}
            </div>

            {bulkReminder.isError && (
              <ErrorMessage error={bulkReminder.error} />
            )}

            <DialogFooter className="mt-6 border-t pt-3">
              <Button
                onClick={() => setBulkAction(undefined)}
                type="button"
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
              <Button disabled={bulkReminder.isPending} type="submit" size="sm">
                {bulkReminder.isPending && (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                )}
                Schedule {selectedLeads.size}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CrmImportDialog
        onCommitted={() =>
          queryClient.invalidateQueries({ queryKey: ["crm", "leads"] })
        }
        onOpenChange={setShowImport}
        open={showImport}
        type="open_leads"
      />

      <AuthorizeDesignDialog
        lead={selectedLead.data}
        onOpenChange={setShowAuthorizeDesign}
        open={showAuthorizeDesign}
      />

      {/* New Lead Modal */}
      {modal === "create" && (
        <Modal
          description="Record inquiry details, market sector classification, service line, and owner."
          title="New Lead Entry"
          onClose={() => setModal(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              creation.mutate(new FormData(event.currentTarget));
            }}
          >
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Inquiry / Lead Name" name="inquiryName" required />
              <Field label="Company Name (optional)" name="companyName" />
              <Field label="Contact Person" name="contactName" required />
              <Field
                label="Source"
                name="source"
                placeholder="Referral, website, walk-in…"
                required
              />
              <Field label="Phone" name="phone" />
              <Field label="Email" name="email" type="email" />
              <SelectField
                items={
                  categories.data?.map((item) => ({
                    label: item.name,
                    value: item.id,
                  })) ?? []
                }
                label="Service Category"
                name="serviceCategoryId"
                placeholder="Choose service…"
                required
              />
              <SelectField
                items={
                  purposes.data?.map((item) => ({
                    label: item.name,
                    value: item.id,
                  })) ?? []
                }
                label="Lead Purpose"
                name="purposeId"
                placeholder="Choose purpose…"
                required
              />
              <SelectField
                items={
                  sectors.data?.map((item) => ({
                    label: item.name,
                    value: item.id,
                  })) ?? []
                }
                label="Market Sector"
                name="sectorId"
                placeholder="Choose sector…"
                required
              />
              {canAssign && (
                <SelectField
                  items={
                    assignees.data?.map((item) => ({
                      label: item.name,
                      value: item.id,
                    })) ?? []
                  }
                  label="Assigned Owner"
                  name="ownerUserId"
                  placeholder="Assign to me"
                />
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lead-address" className="text-xs font-semibold">
                  Site / Customer Address (optional)
                </Label>
                <Textarea
                  id="lead-address"
                  name="address"
                  rows={2}
                  className="text-sm"
                  placeholder="Street, area, city, pincode…"
                />
              </div>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              A contact name and either phone or email are required to create a lead.
            </p>

            {duplicates.length > 0 && <DuplicateNotice items={duplicates} />}
            {creation.isError && <ErrorMessage error={creation.error} />}

            <ModalActions
              pending={creation.isPending}
              submit="Create Lead"
              onCancel={() => setModal(undefined)}
            />
          </form>
        </Modal>
      )}

      {/* New Service Category Modal */}
      {modal === "category" && (
        <Modal
          description="Add an active service category for ERP quotation and lead capture."
          title="New Service Category"
          onClose={() => setModal(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              categoryCreation.mutate(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-3.5">
              <Field label="Code" name="code" placeholder="FIRE_ALARM" required />
              <Field label="Display Name" name="name" placeholder="Fire Alarm Systems" required />
            </div>

            {categoryCreation.isError && (
              <ErrorMessage error={categoryCreation.error} />
            )}

            <ModalActions
              pending={categoryCreation.isPending}
              submit="Add Service"
              onCancel={() => setModal(undefined)}
            />
          </form>
        </Modal>
      )}

      {/* Purpose / Sector Modal */}
      {(modal === "purpose" || modal === "sector") && (
        <Modal
          description={
            modal === "purpose"
              ? "Add a selectable business reason for enquiries."
              : "Add a market sector linked to sector-based BOQ templates."
          }
          title={modal === "purpose" ? "New Lead Purpose" : "New Market Sector"}
          onClose={() => setModal(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              classificationCreation.mutate(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-3.5">
              <Field
                label="Classification Code"
                name="code"
                placeholder={modal === "purpose" ? "ANNUAL_RENEWAL" : "EDUCATION"}
                required
              />
              <Field
                label="Classification Name"
                name="name"
                placeholder={modal === "purpose" ? "Annual Maintenance Contract" : "Educational Institutions"}
                required
              />
            </div>

            {classificationCreation.isError && (
              <ErrorMessage error={classificationCreation.error} />
            )}

            <ModalActions
              pending={classificationCreation.isPending}
              submit="Add Classification"
              onCancel={() => setModal(undefined)}
            />
          </form>
        </Modal>
      )}

      {/* Qualify Lead Modal */}
      {modal === "qualify" && selectedLead.data && (
        <Modal
          description="Link an in-scope customer account and generate an unawarded opportunity."
          title="Qualify Lead"
          onClose={() => setModal(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              qualification.mutate(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-3.5">
              <SelectField
                items={
                  customers.data?.items.map((item) => ({
                    label: item.displayName,
                    value: item.id,
                  })) ?? []
                }
                label="Customer Account"
                name="customerId"
                onValueChange={setSelectedCustomerId}
                placeholder="Choose in-scope customer…"
                required
                value={selectedCustomerId || undefined}
              />

              <SelectField
                disabled={!selectedCustomer.data}
                items={
                  selectedCustomer.data?.contacts
                    .filter((item) => item.status === "active")
                    .map((item) => ({ label: item.name, value: item.id })) ?? []
                }
                label="Primary Contact Person"
                name="primaryContactId"
                placeholder={
                  selectedCustomer.data ? "Choose contact person…" : "Select customer first"
                }
                required
              />

              <SelectField
                disabled={!selectedCustomer.data}
                items={
                  selectedCustomer.data?.sites
                    .filter((item) => item.status === "active")
                    .map((item) => ({ label: item.name, value: item.id })) ?? []
                }
                label="Customer Site (optional)"
                name="siteId"
                placeholder={
                  selectedCustomer.data ? "Select site location (optional)…" : "Select customer first"
                }
              />

              <Field
                defaultValue={selectedLead.data.inquiryName}
                label="Opportunity Title"
                name="title"
                required
              />

              <div className="space-y-1.5">
                <Label htmlFor="qualification-notes" className="text-xs font-semibold">
                  Qualification Notes
                </Label>
                <Textarea
                  id="qualification-notes"
                  minLength={3}
                  name="qualificationNotes"
                  rows={3}
                  className="text-sm"
                  placeholder="Scope scope details, budget expectations, timeline…"
                  required
                />
              </div>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground leading-tight">
              Creates an unawarded opportunity. Does not confirm quotations or project start.
            </p>

            {qualification.isError && (
              <ErrorMessage error={qualification.error} />
            )}

            <ModalActions
              pending={qualification.isPending}
              submit="Create Opportunity"
              onCancel={() => setModal(undefined)}
            />
          </form>
        </Modal>
      )}

      {/* Mark Lead Lost Modal */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setLostLead(undefined);
        }}
        open={Boolean(lostLead)}
      >
        <DialogContent className="sm:max-w-md">
          {lostLead && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                stageChange.mutate({
                  lead: lostLead,
                  stage: "lost",
                  reason: lostReason.trim(),
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>Mark Lead as Lost</DialogTitle>
                <DialogDescription className="text-xs">
                  Record why this inquiry will not progress. The record and reason remain permanently audited.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="lost-reason" className="text-xs font-semibold">
                    Loss Reason <span className="text-destructive">*</span>
                  </Label>
                  <span
                    className={cn(
                      "text-[10px] font-mono",
                      lostReason.trim().length >= 3
                        ? "text-muted-foreground"
                        : "text-destructive font-medium",
                    )}
                  >
                    {lostReason.trim().length}/1000
                  </span>
                </div>
                <Textarea
                  id="lost-reason"
                  minLength={3}
                  maxLength={1000}
                  rows={3}
                  className="text-sm"
                  placeholder="Competitor price, project cancelled, non-responsive…"
                  onChange={(event) => setLostReason(event.target.value)}
                  value={lostReason}
                  required
                />
              </div>

              {stageChange.isError && (
                <ErrorMessage error={stageChange.error} />
              )}

              <DialogFooter className="mt-5 border-t pt-3">
                <Button
                  onClick={() => setLostLead(undefined)}
                  type="button"
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  disabled={stageChange.isPending || lostReason.trim().length < 3}
                  type="submit"
                  variant="destructive"
                  size="sm"
                >
                  {stageChange.isPending ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Updating…
                    </>
                  ) : (
                    "Mark Lost"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function EmptyLeads() {
  return (
    <div className="grid min-h-48 place-items-center p-6 text-center">
      <div>
        <CircleDot className="mx-auto size-6 text-muted-foreground/40" />
        <p className="mt-2 text-xs font-semibold text-foreground">No leads in this view</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Create a new lead or adjust your filter parameters.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  ...input
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`lead-${name}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id={`lead-${name}`}
        name={name}
        className="h-9 text-sm"
        {...input}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  items,
  placeholder,
  ...props
}: {
  label: string;
  name: string;
  items: Array<{ label: string; value: string }>;
  placeholder: string;
} & React.ComponentProps<typeof Select>) {
  const id = `lead-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <Select name={name} {...props}>
        <SelectTrigger className="w-full h-9 text-xs" id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function ModalActions({
  pending,
  submit,
  onCancel,
}: {
  pending: boolean;
  submit: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="mt-6 border-t pt-3">
      <Button onClick={onCancel} type="button" variant="outline" size="sm">
        Cancel
      </Button>
      <Button disabled={pending} type="submit" size="sm">
        {pending ? (
          <>
            <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…
          </>
        ) : (
          submit
        )}
      </Button>
    </DialogFooter>
  );
}

function ErrorMessage({ error }: { error: unknown }) {
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertDescription className="text-xs">
        {getApiErrorMessage(error)}
      </AlertDescription>
    </Alert>
  );
}

function DuplicateNotice({ items }: { items: DuplicateHint[] }) {
  return (
    <Alert className="mt-4 bg-amber-500/10 border-amber-500/20">
      <AlertTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        Possible duplicates detected (records were not merged)
      </AlertTitle>
      <AlertDescription className="mt-1 text-xs text-muted-foreground">
        <ul className="list-disc pl-4 space-y-0.5">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              {item.label} — {item.reason}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}