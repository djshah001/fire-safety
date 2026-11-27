import { useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  BellPlus,
  ChevronDown,
  CircleDot,
  FileUp,
  Loader2,
  Plus,
  Settings2,
  UserRoundCheck,
  X,
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
  leadClassificationsQuery,
  leadFilterOptionsQuery,
  leadQuery,
  leadsQuery,
  serviceCategoriesQuery,
  type DuplicateHint,
  type Lead,
  type LeadSortField,
  type LeadStage,
} from "@/api/crm";
import { getApiErrorMessage } from "@/api/client";
import {
  ListToolbar,
  type ActiveFilterChip,
} from "@/components/data-table/ListToolbar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AuthorizeDesignDialog } from "@/features/crm/AuthorizeDesignDialog";
import { ConvertLeadDialog } from "@/features/crm/ConvertLeadDialog";
import { CrmImportDialog } from "@/features/crm/CrmImportDialog";
import { LeadWorkPanel } from "@/features/crm/LeadWorkPanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { cn } from "@/lib/utils";

const ACTIVE_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "design_authorized",
  "commercial_negotiation",
];

const TERMINAL_STAGES: LeadStage[] = ["won", "lost", "on_hold"];

const ALL_STAGES: LeadStage[] = [...ACTIVE_STAGES, ...TERMINAL_STAGES];

const formatStage = (stage: string) =>
  stage.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function LeadsPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canWrite = user.permissions.includes("crm.lead.write");
  const canQualify = user.permissions.includes("crm.lead.qualify");
  const canAssign = user.permissions.includes("crm.lead.assign");
  const canUploadOpportunityDocs =
    canWrite || canQualify || user.permissions.includes("system.access.all");
  const canManageCategories = user.permissions.includes(
    "crm.service_category.manage",
  );
  const canAuthorizeDesign = user.permissions.includes(
    "crm.lead.authorize_design",
  );

  const [params, setParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<
    "create" | "category" | "purpose" | "sector"
  >();
  const selectedId = params.get("selectedId") || undefined;
  const setSelectedId = (id?: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("selectedId", id);
    else next.delete("selectedId");
    setParams(next, { replace: true });
  };
  const [showConvertDialog, setShowConvertDialog] = useState(false);
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
    ALL_STAGES.includes(params.get("stage") as LeadStage)
      ? params.get("stage")
      : undefined
  ) as LeadStage | undefined;
  const serviceCategoryId = params.get("serviceCategoryId") || undefined;
  const purposeId = params.get("purposeId") || undefined;
  const sectorId = params.get("sectorId") || undefined;
  const source = params.get("source") || undefined;
  const ownerUserId = params.get("ownerUserId") || undefined;
  const updatedByUserId = params.get("updatedByUserId") || undefined;
  const converted = (
    params.get("converted") === "yes" || params.get("converted") === "no"
      ? params.get("converted")
      : undefined
  ) as "yes" | "no" | undefined;
  const hasDesignJob = (
    params.get("hasDesignJob") === "yes" || params.get("hasDesignJob") === "no"
      ? params.get("hasDesignJob")
      : undefined
  ) as "yes" | "no" | undefined;
  const createdFrom = params.get("createdFrom") || undefined;
  const createdTo = params.get("createdTo") || undefined;
  const updatedFrom = params.get("updatedFrom") || undefined;
  const updatedTo = params.get("updatedTo") || undefined;

  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 20;
  const sort = (
    [
      "leadNumber",
      "inquiryName",
      "stage",
      "ownerName",
      "source",
      "createdAt",
      "updatedAt",
    ].includes(params.get("sort") ?? "")
      ? params.get("sort")
      : "updatedAt"
  ) as LeadSortField;
  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const leads = useQuery(
    leadsQuery({
      search: search || undefined,
      stage,
      serviceCategoryId,
      purposeId,
      sectorId,
      source,
      ownerUserId,
      updatedByUserId,
      converted,
      hasDesignJob,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      page,
      pageSize,
      sort,
      direction,
    }),
  );
  const categories = useQuery(serviceCategoriesQuery());
  const purposes = useQuery(leadClassificationsQuery("purposes"));
  const sectors = useQuery(leadClassificationsQuery("sectors"));
  const filterOptions = useQuery(leadFilterOptionsQuery);
  const assignees = useQuery({ ...assigneesQuery, enabled: canAssign });
  const selectedLead = useQuery(leadQuery(selectedId));
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
      stage: "contacted" | "on_hold" | "lost" | "resume";
      reason?: string;
    }) =>
      changeLeadStage({
        leadId: input.lead.id,
        expectedVersion: input.lead.rowVersion,
        stage: input.stage,
        reason: input.reason,
      }),
    async onSuccess(lead) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "opportunities"] }),
        queryClient.invalidateQueries({
          queryKey: ["engineering", "design-jobs"],
        }),
      ]);
      queryClient.setQueryData(["crm", "lead", lead.id], lead);
      setLostLead(undefined);
      setLostReason("");
      toast.success("Lead stage updated.");
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

  const actionParam = params.get("action");

  useEffect(() => {
    if (actionParam === "create") {
      if (canWrite) {
        setDuplicates([]);
        setModal("create");
      }
      const next = new URLSearchParams(params);
      next.delete("action");
      setParams(next, { replace: true });
    }
  }, [actionParam, canWrite, params, setParams]);

  useHotkeys({
    c: () => {
      if (canWrite && !modal) {
        setDuplicates([]);
        creation.reset();
        setModal("create");
      }
    },
    f: () => {
      searchInputRef.current?.focus();
    },
    escape: () => {
      if (selectedId) {
        setSelectedId(undefined);
      } else if (selectedLeads.size > 0) {
        setSelectedLeads(new Map());
      }
    },
  });

  function updateFilter(name: string, value?: string) {
    setSelectedLeads(new Map());
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(name, value);
    else next.delete(name);
    next.delete("page");
    setParams(next, { replace: true });
  }

  function clearAllFilters() {
    setSelectedLeads(new Map());
    const next = new URLSearchParams(params);
    [
      "stage",
      "serviceCategoryId",
      "purposeId",
      "sectorId",
      "source",
      "ownerUserId",
      "updatedByUserId",
      "converted",
      "hasDesignJob",
      "createdFrom",
      "createdTo",
      "updatedFrom",
      "updatedTo",
      "page",
    ].forEach((key) => next.delete(key));
    setParams(next, { replace: true });
  }

  function updateList(values: Record<string, string | number>) {
    setSelectedLeads(new Map());
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      next.set(key, String(value));
    setParams(next, { replace: true });
  }

  const userNameMap = new Map(
    (filterOptions.data?.users ?? []).map((u) => [u.id, u.name]),
  );
  const categoryNameMap = new Map(
    (categories.data ?? []).map((c) => [c.id, c.name]),
  );
  const purposeNameMap = new Map(
    (purposes.data ?? []).map((p) => [p.id, p.name]),
  );
  const sectorNameMap = new Map(
    (sectors.data ?? []).map((s) => [s.id, s.name]),
  );

  const activeChips: ActiveFilterChip[] = [
    stage
      ? {
          key: "stage",
          label: `Stage: ${formatStage(stage)}`,
          onRemove: () => updateFilter("stage"),
        }
      : null,
    serviceCategoryId
      ? {
          key: "serviceCategoryId",
          label: `Service: ${categoryNameMap.get(serviceCategoryId) ?? "Selected"}`,
          onRemove: () => updateFilter("serviceCategoryId"),
        }
      : null,
    purposeId
      ? {
          key: "purposeId",
          label: `Purpose: ${purposeNameMap.get(purposeId) ?? "Selected"}`,
          onRemove: () => updateFilter("purposeId"),
        }
      : null,
    sectorId
      ? {
          key: "sectorId",
          label: `Sector: ${sectorNameMap.get(sectorId) ?? "Selected"}`,
          onRemove: () => updateFilter("sectorId"),
        }
      : null,
    source
      ? {
          key: "source",
          label: `Source: ${source}`,
          onRemove: () => updateFilter("source"),
        }
      : null,
    ownerUserId
      ? {
          key: "ownerUserId",
          label: `Owner: ${userNameMap.get(ownerUserId) ?? "Selected"}`,
          onRemove: () => updateFilter("ownerUserId"),
        }
      : null,
    updatedByUserId
      ? {
          key: "updatedByUserId",
          label: `Last edited by: ${userNameMap.get(updatedByUserId) ?? "Selected"}`,
          onRemove: () => updateFilter("updatedByUserId"),
        }
      : null,
    converted
      ? {
          key: "converted",
          label: converted === "yes" ? "Converted only" : "Unconverted only",
          onRemove: () => updateFilter("converted"),
        }
      : null,
    hasDesignJob
      ? {
          key: "hasDesignJob",
          label: hasDesignJob === "yes" ? "Design authorized" : "No design job",
          onRemove: () => updateFilter("hasDesignJob"),
        }
      : null,
    createdFrom || createdTo
      ? {
          key: "createdRange",
          label: `Created: ${createdFrom ?? "…"} → ${createdTo ?? "…"}`,
          onRemove: () => {
            const next = new URLSearchParams(params);
            next.delete("createdFrom");
            next.delete("createdTo");
            next.delete("page");
            setParams(next, { replace: true });
          },
        }
      : null,
    updatedFrom || updatedTo
      ? {
          key: "updatedRange",
          label: `Updated: ${updatedFrom ?? "…"} → ${updatedTo ?? "…"}`,
          onRemove: () => {
            const next = new URLSearchParams(params);
            next.delete("updatedFrom");
            next.delete("updatedTo");
            next.delete("page");
            setParams(next, { replace: true });
          },
        }
      : null,
  ].filter((chip): chip is ActiveFilterChip => Boolean(chip));

  const columns: Array<ServerColumn<Lead, LeadSortField>> = [
    {
      key: "lead",
      label: "Lead / Inquiry",
      sort: "inquiryName",
      className: "min-w-[230px]",
      cell: (lead) => (
        <div className="space-y-1">
          <p className="font-semibold text-xs text-foreground leading-snug">
            {lead.inquiryName}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono font-medium text-foreground/80">
              {lead.leadNumber}
            </span>
            {lead.companyName && (
              <>
                <span>•</span>
                <span className="truncate max-w-[140px]">
                  {lead.companyName}
                </span>
              </>
            )}
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-normal"
            >
              {lead.source}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: "classification",
      label: "Service & Sector",
      className: "min-w-[175px]",
      cell: (lead) => (
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground truncate max-w-[180px]">
            {lead.serviceCategoryName ?? "—"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
            {lead.purposeName} · {lead.sectorName}
          </p>
        </div>
      ),
    },
    {
      key: "contact",
      label: "Contact Person",
      className: "min-w-[175px]",
      cell: (lead) => (
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground">
            {lead.contactName}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[170px]">
            {lead.phone || lead.email || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      label: "Owner",
      sort: "ownerName",
      className: "min-w-[140px]",
      cell: (lead) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">
            {lead.ownerName ?? "—"}
          </span>
          {lead.ownerIsOnLeave && (
            <Badge
              variant="outline"
              className="text-[10px] text-amber-600 border-amber-500/40 px-1 py-0 h-4"
            >
              On Leave
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "stage",
      label: "Stage",
      sort: "stage",
      className: "min-w-[145px]",
      cell: (lead) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={lead.stage} />
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {lead.opportunityId && (
              <span className="rounded bg-muted px-1.5 py-0.5">
                Opportunity
              </span>
            )}
            {lead.designJobId && (
              <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5">
                Design
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "updated",
      label: "Last Change",
      sort: "updatedAt",
      className: "min-w-[155px] tabular-nums text-xs",
      cell: (lead) => (
        <div className="space-y-0.5">
          <p className="font-mono text-[11px] text-foreground">
            {new Date(lead.updatedAt).toLocaleDateString()} ·{" "}
            {new Date(lead.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
            by {lead.lastModifiedByName ?? lead.createdByName ?? "System"}
          </p>
        </div>
      ),
    },
  ];

  const isTerminalSelected = Boolean(stage && TERMINAL_STAGES.includes(stage));

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
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Click any lead to open its workspace drawer for activity logs,
            follow-ups, documents, and stage progression.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageCategories && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Settings2 className="size-3.5 mr-1.5" />
                  Configure
                  <ChevronDown className="size-3 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setModal("category")}>
                  <Plus className="size-3.5 mr-2" />
                  Service Category
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal("purpose")}>
                  <Plus className="size-3.5 mr-2" />
                  Lead Purpose
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal("sector")}>
                  <Plus className="size-3.5 mr-2" />
                  Market Sector
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canWrite && (
            <Button
              onClick={() => setShowImport(true)}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
            >
              <FileUp className="size-3.5 mr-1.5" />
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
              <Plus className="size-3.5 mr-1.5" />
              Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mt-6">
        <ListToolbar
          search={search}
          searchInputRef={searchInputRef}
          searchPlaceholder="Search by lead #, inquiry, company, contact, phone, email, or source…"
          onSearch={(value) => updateFilter("search", value)}
          activeFilters={activeChips.length}
          activeChips={activeChips}
          onClear={clearAllFilters}
          quickFilters={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={!stage ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-[11px]"
                onClick={() => updateFilter("stage")}
              >
                All
              </Button>
              {ACTIVE_STAGES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={stage === item ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-[11px]"
                  onClick={() =>
                    updateFilter("stage", stage === item ? undefined : item)
                  }
                >
                  {formatStage(item)}
                </Button>
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={isTerminalSelected ? "secondary" : "ghost"}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    {isTerminalSelected ? formatStage(stage!) : "Closed / Hold"}
                    <ChevronDown className="size-3 ml-1 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  {TERMINAL_STAGES.map((item) => (
                    <DropdownMenuItem
                      key={item}
                      onClick={() =>
                        updateFilter("stage", stage === item ? undefined : item)
                      }
                    >
                      {formatStage(item)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        >
          {/* Grouped Filter Popover (Duplicate Pipeline Stage removed) */}
          <div className="space-y-4">
            {/* Section 1: Classification */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Classification
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Service Category
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      updateFilter("serviceCategoryId", value)
                    }
                    value={serviceCategoryId ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All services</SelectItem>
                      {categories.data?.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="text-xs"
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Lead Purpose</Label>
                  <Select
                    onValueChange={(value) => updateFilter("purposeId", value)}
                    value={purposeId ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All purposes</SelectItem>
                      {purposes.data?.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="text-xs"
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Market Sector</Label>
                  <Select
                    onValueChange={(value) => updateFilter("sectorId", value)}
                    value={sectorId ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sectors</SelectItem>
                      {sectors.data?.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="text-xs"
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Lead Source</Label>
                  <Select
                    onValueChange={(value) => updateFilter("source", value)}
                    value={source ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {filterOptions.data?.sources.map((item) => (
                        <SelectItem key={item} value={item} className="text-xs">
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Ownership & Conversion */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ownership & Conversion
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Assigned Owner
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      updateFilter("ownerUserId", value)
                    }
                    value={ownerUserId ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All owners</SelectItem>
                      {filterOptions.data?.users.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="text-xs"
                        >
                          {item.name}
                          {item.isOnLeave ? " (On Leave)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Last Modified By
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      updateFilter("updatedByUserId", value)
                    }
                    value={updatedByUserId ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      {filterOptions.data?.users.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="text-xs"
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Opportunity Conversion
                  </Label>
                  <Select
                    onValueChange={(value) => updateFilter("converted", value)}
                    value={converted ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All leads</SelectItem>
                      <SelectItem value="yes">
                        Converted to Opportunity
                      </SelectItem>
                      <SelectItem value="no">Not yet converted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Design Authorization
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      updateFilter("hasDesignJob", value)
                    }
                    value={hasDesignJob ?? "all"}
                  >
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="yes">Has Design Job</SelectItem>
                      <SelectItem value="no">No Design Job</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 3: Date Ranges */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date Ranges
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Created From</Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={createdFrom ?? ""}
                    onChange={(e) => updateFilter("createdFrom", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Created To</Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={createdTo ?? ""}
                    onChange={(e) => updateFilter("createdTo", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Last Updated From
                  </Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={updatedFrom ?? ""}
                    onChange={(e) => updateFilter("updatedFrom", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Last Updated To
                  </Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={updatedTo ?? ""}
                    onChange={(e) => updateFilter("updatedTo", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </ListToolbar>
      </div>

      {/* Full-Width Leads Table (Zero Layout Shift) */}
      <Card className="mt-6 shadow-xs overflow-hidden">
        <CardHeader className="border-b bg-card/60 p-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                Assigned Leads
              </CardTitle>
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

      {/* Unified Slide-Over Lead Workspace Sheet */}
      <Sheet
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(undefined);
        }}
      >
        <SheetContent
          side="right"
          className="w-full p-0 sm:max-w-2xl flex flex-col gap-0"
        >
          {selectedLead.isPending ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : selectedLead.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  {getApiErrorMessage(selectedLead.error)}
                </AlertDescription>
              </Alert>
            </div>
          ) : selectedLead.data ? (
            <LeadWorkPanel
              lead={selectedLead.data}
              canAssign={canAssign}
              canUploadOpportunityDocs={canUploadOpportunityDocs}
              canAuthorizeDesign={canAuthorizeDesign}
              assignees={assignees.data ?? []}
              stageChangePending={stageChange.isPending}
              stageChangeError={stageChange.isError ? stageChange.error : null}
              onStageChange={(input) => stageChange.mutate(input)}
              onMarkLost={(lead) => {
                setLostReason("");
                setLostLead(lead);
              }}
              onConvert={() => setShowConvertDialog(true)}
              onAuthorizeDesign={() => setShowAuthorizeDesign(true)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

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
              <span className="text-xs font-medium text-foreground">
                Selected
              </span>
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
                  <SelectItem
                    key={assignee.id}
                    value={assignee.id}
                    className="text-xs"
                  >
                    {assignee.name} ({assignee.email})
                    {assignee.isOnLeave ? " · On Leave" : ""}
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
              Assign {selectedLeads.size} Lead
              {selectedLeads.size === 1 ? "" : "s"}
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
                Create a linked follow-up for each of the {selectedLeads.size}{" "}
                selected leads.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label
                  htmlFor="bulk-reminder-title"
                  className="text-xs font-semibold"
                >
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
                <Label
                  htmlFor="bulk-reminder-due"
                  className="text-xs font-semibold"
                >
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
                        label: `${assignee.name}${assignee.isOnLeave ? " (On Leave)" : ""}`,
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
                      label: `${item.name}${item.isOnLeave ? " (On Leave)" : ""}`,
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
              A contact name and either phone or email are required to create a
              lead.
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
              <Field
                label="Code"
                name="code"
                placeholder="FIRE_ALARM"
                required
              />
              <Field
                label="Display Name"
                name="name"
                placeholder="Fire Alarm Systems"
                required
              />
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
                placeholder={
                  modal === "purpose" ? "ANNUAL_RENEWAL" : "EDUCATION"
                }
                required
              />
              <Field
                label="Classification Name"
                name="name"
                placeholder={
                  modal === "purpose"
                    ? "Annual Maintenance Contract"
                    : "Educational Institutions"
                }
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

      <ConvertLeadDialog
        lead={selectedLead.data}
        onOpenChange={setShowConvertDialog}
        open={showConvertDialog}
      />

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
                  Record why this inquiry will not progress. The record and
                  reason remain permanently audited.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="lost-reason"
                    className="text-xs font-semibold"
                  >
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
                  disabled={
                    stageChange.isPending || lostReason.trim().length < 3
                  }
                  type="submit"
                  variant="destructive"
                  size="sm"
                >
                  {stageChange.isPending ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />{" "}
                      Updating…
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
        <p className="mt-2 text-xs font-semibold text-foreground">
          No leads in this view
        </p>
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
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
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