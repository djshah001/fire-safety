import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock,
  Clock3,
  DraftingCompass,
  FileText,
  FolderKanban,
  PackageCheck,
  Plus,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Target,
  Truck,
  Layers,
  ChevronRight,
  Activity,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import {
  customersQuery,
  leadsQuery,
  opportunitiesQuery,
  remindersQuery,
} from "@/api/crm";
import { designJobsQuery } from "@/api/engineering";
import { projectsQuery } from "@/api/projects";
import { purchaseOrdersQuery } from "@/api/purchaseOrders";
import { quotationQueueQuery } from "@/api/quotations";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function money(amount: number | string | undefined | null) {
  const num = Number(amount ?? 0);
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function DashboardPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const [activeTab, setActiveTab] = useState("overview");

  // Permission checks
  const canReadLeads = user.permissions.includes("crm.lead.read");
  const canWriteLeads = user.permissions.includes("crm.lead.write");
  const canReadCustomers = user.permissions.includes("crm.customer.read");
  const canReadOpportunities = user.permissions.includes(
    "crm.opportunity.read",
  );
  const canReadEngineering = user.permissions.includes(
    "engineering.design.read",
  );
  const canReadQuotation = user.permissions.includes(
    "engineering.quotation.read",
  );
  const canReadProjects = user.permissions.includes("project.read");
  const canReadProcurement =
    user.permissions.includes("procurement.purchase_order.read") ||
    user.permissions.includes("procurement.goods_receipt.read");

  const hasCrm = canReadLeads || canReadCustomers || canReadOpportunities;
  const hasEngineering = canReadEngineering || canReadQuotation;
  const hasProcurement = canReadProcurement;
  const hasProjects = canReadProjects;
  const hasAnyWorkspace =
    hasCrm || hasEngineering || hasProcurement || hasProjects;

  // CRM Queries
  const leads = useQuery({
    ...leadsQuery({
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadLeads,
  });
  const newLeads = useQuery({
    ...leadsQuery({ stage: "new", page: 1, pageSize: 1 }),
    enabled: canReadLeads,
  });
  const followUps = useQuery({
    ...remindersQuery({
      status: "pending",
      page: 1,
      pageSize: 5,
      sort: "dueAt",
      direction: "asc",
    }),
    enabled: canReadLeads,
  });
  const customers = useQuery({
    ...customersQuery({ status: "active", page: 1, pageSize: 1 }),
    enabled: canReadCustomers,
  });
  const opportunities = useQuery({
    ...opportunitiesQuery({ state: "unawarded", page: 1, pageSize: 1 }),
    enabled: canReadOpportunities,
  });

  // Engineering Queries
  const designJobs = useQuery({
    ...designJobsQuery({
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadEngineering,
  });
  const pendingReviewDesigns = useQuery({
    ...designJobsQuery({
      status: "under_review",
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadEngineering,
  });
  const quotations = useQuery({
    ...quotationQueueQuery({
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadQuotation,
  });
  const pendingQuotations = useQuery({
    ...quotationQueueQuery({
      status: "submitted",
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadQuotation,
  });

  // Project Queries
  const activeProjects = useQuery({
    ...projectsQuery({
      status: "started",
      page: 1,
      pageSize: 5,
      sort: "startDate",
      direction: "desc",
    }),
    enabled: canReadProjects,
  });

  // Procurement Queries
  const pendingPos = useQuery({
    ...purchaseOrdersQuery({
      status: "pending_approval",
      page: 1,
      pageSize: 5,
      sort: "createdAt",
      direction: "desc",
    }),
    enabled: canReadProcurement,
  });
  const activePos = useQuery({
    ...purchaseOrdersQuery({
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadProcurement,
  });
  const partialPos = useQuery({
    ...purchaseOrdersQuery({
      status: "partially_delivered",
      page: 1,
      pageSize: 5,
      sort: "updatedAt",
      direction: "desc",
    }),
    enabled: canReadProcurement,
  });

  // Action count requiring prompt operational attention
  const pendingActionsCount =
    (followUps.data?.total ?? 0) +
    (pendingReviewDesigns.data?.total ?? 0) +
    (pendingPos.data?.total ?? 0) +
    (pendingQuotations.data?.total ?? 0);

  return (
    <TooltipProvider delayDuration={150}>
      <main className="mx-auto w-full max-w-[100rem] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header & Quick Action Strip */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Operations Command Center
              </span>
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Welcome back, {user.name}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Real-time cross-functional pipeline overview. Metrics and records
              are strictly constrained to your active branch assignments and
              security scope.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWriteLeads && (
              <Button asChild size="sm" className="h-8 text-xs">
                <Link to="/crm/leads">
                  <Plus className="size-3.5 mr-1" /> New Lead
                </Link>
              </Button>
            )}
            {canReadEngineering && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 text-xs"
              >
                <Link to="/engineering/design-jobs">
                  <DraftingCompass className="size-3.5 mr-1" /> Design Jobs
                </Link>
              </Button>
            )}
            {canReadProcurement && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 text-xs"
              >
                <Link to="/procurement/purchase-orders">
                  <ShoppingBag className="size-3.5 mr-1" /> Purchase Orders
                </Link>
              </Button>
            )}
            {canReadProjects && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 text-xs"
              >
                <Link to="/projects">
                  <FolderKanban className="size-3.5 mr-1" /> Projects
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Password Reset Warning */}
        {user.mustChangePassword && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Temporary Password Active
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-0.5">
              Please change your credentials in My Account before proceeding
              with production authorizations.
            </AlertDescription>
          </Alert>
        )}

        {hasAnyWorkspace ? (
          <>
            {/* KPI Metric Strip */}
            <section
              aria-label="Executive Key Performance Indicators"
              className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
            >
              {canReadLeads && (
                <MetricCard
                  attention={(newLeads.data?.total ?? 0) > 0}
                  detail={`${newLeads.data?.total ?? 0} awaiting first contact`}
                  icon={Target}
                  accentColor="primary"
                  label="Enquiry Pipeline"
                  loading={leads.isPending}
                  value={leads.data?.total}
                  href="/crm/leads"
                />
              )}
              {canReadLeads && (
                <MetricCard
                  attention={(followUps.data?.total ?? 0) > 0}
                  detail="Assigned customer reminders"
                  icon={BellRing}
                  accentColor="amber"
                  label="Follow-ups Due"
                  loading={followUps.isPending}
                  value={followUps.data?.total}
                  href="/crm/follow-ups"
                />
              )}
              {canReadEngineering && (
                <MetricCard
                  attention={(pendingReviewDesigns.data?.total ?? 0) > 0}
                  detail={`${pendingReviewDesigns.data?.total ?? 0} awaiting design review`}
                  icon={DraftingCompass}
                  accentColor="blue"
                  label="CAD Design Jobs"
                  loading={designJobs.isPending}
                  value={designJobs.data?.total}
                  href="/engineering/design-jobs"
                />
              )}
              {canReadQuotation && (
                <MetricCard
                  attention={(pendingQuotations.data?.total ?? 0) > 0}
                  detail={`${pendingQuotations.data?.total ?? 0} submitted for approval`}
                  icon={FileText}
                  accentColor="violet"
                  label="Commercial Quotes"
                  loading={quotations.isPending}
                  value={quotations.data?.total}
                  href="/engineering/quotations"
                />
              )}
              {canReadProjects && (
                <MetricCard
                  detail="Active customer baselines"
                  icon={FolderKanban}
                  accentColor="purple"
                  label="Active Projects"
                  loading={activeProjects.isPending}
                  value={activeProjects.data?.total}
                  href="/projects"
                />
              )}
              {canReadProcurement && (
                <MetricCard
                  attention={(pendingPos.data?.total ?? 0) > 0}
                  detail={`${pendingPos.data?.total ?? 0} awaiting purchase review`}
                  icon={ShoppingBag}
                  accentColor="rose"
                  label="PO Approvals Queue"
                  loading={pendingPos.isPending}
                  value={pendingPos.data?.total}
                  href="/procurement/purchase-orders?status=pending_approval"
                />
              )}
              {canReadProcurement && (
                <MetricCard
                  attention={(partialPos.data?.total ?? 0) > 0}
                  detail={`${partialPos.data?.total ?? 0} in partial shipment`}
                  icon={Truck}
                  accentColor="amber"
                  label="In-Transit Deliveries"
                  loading={partialPos.isPending}
                  value={partialPos.data?.total}
                  href="/procurement/purchase-orders"
                />
              )}
              {canReadCustomers && (
                <MetricCard
                  detail="Active registered accounts"
                  icon={Building2}
                  accentColor="emerald"
                  label="Customer Accounts"
                  loading={customers.isPending}
                  value={customers.data?.total}
                  href="/crm/customers"
                />
              )}
            </section>

            {/* Operational Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-4 pt-1"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-flex sm:w-auto bg-muted/40 border border-border/60">
                <TabsTrigger
                  value="overview"
                  className="gap-2 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
                >
                  Overview
                  {pendingActionsCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4.5 px-1.5 text-[10px] font-mono font-semibold"
                    >
                      {pendingActionsCount}
                    </Badge>
                  )}
                </TabsTrigger>
                {hasCrm && (
                  <TabsTrigger
                    value="crm"
                    className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
                  >
                    CRM & Follow-ups
                  </TabsTrigger>
                )}
                {hasEngineering && (
                  <TabsTrigger
                    value="engineering"
                    className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
                  >
                    Design & Quotes
                  </TabsTrigger>
                )}
                {hasProcurement && (
                  <TabsTrigger
                    value="procurement"
                    className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
                  >
                    Procurement & Deliveries
                  </TabsTrigger>
                )}
                {hasProjects && (
                  <TabsTrigger
                    value="projects"
                    className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
                  >
                    Projects Register
                  </TabsTrigger>
                )}
              </TabsList>

              {/* TAB 1: OVERVIEW */}
              <TabsContent
                value="overview"
                className="space-y-5 outline-hidden"
              >
                {/* Critical Attention Banner */}
                {pendingActionsCount > 0 && (
                  <Card className="border-amber-500/30 bg-amber-500/[0.04] dark:border-amber-500/20 dark:bg-amber-950/[0.15] shadow-2xs overflow-hidden">
                    <CardHeader className="py-3 px-4 sm:px-5 border-b border-amber-500/20 bg-amber-500/[0.02]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                          <CardTitle className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200">
                            Immediate Action Required ({pendingActionsCount}{" "}
                            pending checkpoints)
                          </CardTitle>
                        </div>
                        <span className="text-[11px] font-mono text-amber-700/80 dark:text-amber-400/80">
                          Priority Queue
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-2.5 p-4 sm:p-5 sm:grid-cols-2 lg:grid-cols-4">
                      {Boolean((followUps.data?.total ?? 0) > 0) && (
                        <Link
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-background/90 p-3 shadow-2xs transition-all hover:border-amber-500/40 hover:bg-background hover:shadow-xs group"
                          to="/crm/follow-ups"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              CRM Follow-ups
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {followUps.data?.total} customer reminder
                              {followUps.data?.total === 1 ? "" : "s"} due
                            </p>
                          </div>
                          <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      )}

                      {Boolean((pendingReviewDesigns.data?.total ?? 0) > 0) && (
                        <Link
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-background/90 p-3 shadow-2xs transition-all hover:border-amber-500/40 hover:bg-background hover:shadow-xs group"
                          to="/engineering/design-jobs"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              Design Reviews
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {pendingReviewDesigns.data?.total} package
                              {pendingReviewDesigns.data?.total === 1
                                ? ""
                                : "s"}{" "}
                              awaiting review
                            </p>
                          </div>
                          <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      )}

                      {Boolean((pendingPos.data?.total ?? 0) > 0) && (
                        <Link
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-background/90 p-3 shadow-2xs transition-all hover:border-amber-500/40 hover:bg-background hover:shadow-xs group"
                          to="/procurement/purchase-orders?status=pending_approval"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              Purchase Orders
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {pendingPos.data?.total} order
                              {pendingPos.data?.total === 1 ? "" : "s"} pending
                              sign-off
                            </p>
                          </div>
                          <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      )}

                      {Boolean((pendingQuotations.data?.total ?? 0) > 0) && (
                        <Link
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-background/90 p-3 shadow-2xs transition-all hover:border-amber-500/40 hover:bg-background hover:shadow-xs group"
                          to="/engineering/quotations?status=submitted"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              Quotations Queue
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {pendingQuotations.data?.total} commercial review
                              {pendingQuotations.data?.total === 1 ? "" : "s"}
                            </p>
                          </div>
                          <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 2-Column Split Operational Cards */}
                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Left Column: CRM Leads & CAD Design Pipeline */}
                  <div className="space-y-5">
                    {canReadLeads && (
                      <Card className="overflow-hidden shadow-2xs border-border/80">
                        <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-card/60 p-4 pb-3">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                              <Target className="size-4 text-primary" />
                              Active CRM Leads
                            </CardTitle>
                            <CardDescription className="text-xs">
                              Recent enquiry status updates within your scope.
                            </CardDescription>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                          >
                            <Link to="/crm/leads">
                              View all{" "}
                              <ChevronRight className="size-3.5 ml-1" />
                            </Link>
                          </Button>
                        </CardHeader>

                        <CardContent className="p-0">
                          {leads.isPending ? (
                            <div className="space-y-2.5 p-4">
                              {Array.from({ length: 4 }, (_, i) => (
                                <Skeleton
                                  className="h-11 w-full rounded-lg"
                                  key={i}
                                />
                              ))}
                            </div>
                          ) : leads.data?.items.length ? (
                            <div className="divide-y divide-border/60">
                              {leads.data.items.slice(0, 4).map((lead) => (
                                <Link
                                  className="flex items-center justify-between gap-3 p-3 sm:px-4 hover:bg-muted/30 transition-colors group"
                                  key={lead.id}
                                  to={`/crm/leads?search=${encodeURIComponent(lead.leadNumber)}`}
                                >
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                      {lead.inquiryName}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                                      {lead.leadNumber} · {lead.contactName}
                                      {lead.companyName
                                        ? ` (${lead.companyName})`
                                        : ""}
                                    </p>
                                  </div>
                                  <StatusBadge
                                    status={lead.stage}
                                    className="shrink-0"
                                  />
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="p-8 text-center text-xs text-muted-foreground">
                              No active leads found in scope.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {canReadEngineering && (
                      <Card className="overflow-hidden shadow-2xs border-border/80">
                        <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-card/60 p-4 pb-3">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                              <DraftingCompass className="size-4 text-blue-600 dark:text-blue-400" />
                              CAD Design Pipeline
                            </CardTitle>
                            <CardDescription className="text-xs">
                              Live drawing packages and technical revisions.
                            </CardDescription>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                          >
                            <Link to="/engineering/design-jobs">
                              View all{" "}
                              <ChevronRight className="size-3.5 ml-1" />
                            </Link>
                          </Button>
                        </CardHeader>

                        <CardContent className="p-0">
                          {designJobs.isPending ? (
                            <div className="space-y-2.5 p-4">
                              {Array.from({ length: 4 }, (_, i) => (
                                <Skeleton
                                  className="h-11 w-full rounded-lg"
                                  key={i}
                                />
                              ))}
                            </div>
                          ) : designJobs.data?.items.length ? (
                            <div className="divide-y divide-border/60">
                              {designJobs.data.items.slice(0, 4).map((job) => (
                                <Link
                                  className="flex items-center justify-between gap-3 p-3 sm:px-4 hover:bg-muted/30 transition-colors group"
                                  key={job.id}
                                  to={`/engineering/design-jobs/${job.id}`}
                                >
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                      {job.title}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                                      {job.leadNumber} · Designer:{" "}
                                      <span className="text-foreground/80 font-sans">
                                        {job.designerName || "Unassigned"}
                                      </span>
                                    </p>
                                  </div>
                                  <StatusBadge
                                    status={job.status}
                                    className="shrink-0"
                                  />
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="p-8 text-center text-xs text-muted-foreground">
                              No active design packages in queue.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Right Column: Procurement Orders & Started Projects */}
                  <div className="space-y-5">
                    {canReadProcurement && (
                      <Card className="overflow-hidden shadow-2xs border-border/80">
                        <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-card/60 p-4 pb-3">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                              <ShoppingBag className="size-4 text-emerald-600 dark:text-emerald-400" />
                              Purchase Orders Queue
                            </CardTitle>
                            <CardDescription className="text-xs">
                              Orders pending review, issued commitments and
                              shipments.
                            </CardDescription>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                          >
                            <Link to="/procurement/purchase-orders">
                              View all{" "}
                              <ChevronRight className="size-3.5 ml-1" />
                            </Link>
                          </Button>
                        </CardHeader>

                        <CardContent className="p-0">
                          {activePos.isPending ? (
                            <div className="space-y-2.5 p-4">
                              {Array.from({ length: 4 }, (_, i) => (
                                <Skeleton
                                  className="h-11 w-full rounded-lg"
                                  key={i}
                                />
                              ))}
                            </div>
                          ) : activePos.data?.items.length ? (
                            <div className="divide-y divide-border/60">
                              {activePos.data.items.slice(0, 4).map((po) => (
                                <Link
                                  className="flex items-center justify-between gap-3 p-3 sm:px-4 hover:bg-muted/30 transition-colors group"
                                  key={po.id}
                                  to={`/procurement/purchase-orders/${po.id}`}
                                >
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                      {po.poNumber} · {po.title}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                                      Vendor: {po.vendorName} ·{" "}
                                      <span className="font-semibold text-foreground">
                                        {money(po.grandTotal)}
                                      </span>
                                    </p>
                                  </div>
                                  <StatusBadge
                                    status={po.status}
                                    className="shrink-0"
                                  />
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="p-8 text-center text-xs text-muted-foreground">
                              No purchase orders in current scope.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {canReadProjects && (
                      <Card className="overflow-hidden shadow-2xs border-border/80">
                        <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-card/60 p-4 pb-3">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                              <FolderKanban className="size-4 text-purple-600 dark:text-purple-400" />
                              Active Started Projects
                            </CardTitle>
                            <CardDescription className="text-xs">
                              Projects executing from approved design baselines.
                            </CardDescription>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                          >
                            <Link to="/projects">
                              View all{" "}
                              <ChevronRight className="size-3.5 ml-1" />
                            </Link>
                          </Button>
                        </CardHeader>

                        <CardContent className="p-0">
                          {activeProjects.isPending ? (
                            <div className="space-y-2.5 p-4">
                              {Array.from({ length: 4 }, (_, i) => (
                                <Skeleton
                                  className="h-11 w-full rounded-lg"
                                  key={i}
                                />
                              ))}
                            </div>
                          ) : activeProjects.data?.items.length ? (
                            <div className="divide-y divide-border/60">
                              {activeProjects.data.items
                                .slice(0, 4)
                                .map((proj) => (
                                  <Link
                                    className="flex items-center justify-between gap-3 p-3 sm:px-4 hover:bg-muted/30 transition-colors group"
                                    key={proj.id}
                                    to={`/projects/${proj.id}`}
                                  >
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                        {proj.projectNumber} · {proj.title}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                                        {proj.customerName} · Site:{" "}
                                        {proj.siteName || "N/A"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] h-4.5 px-1.5"
                                      >
                                        {proj.commercialState}
                                      </Badge>
                                      <StatusBadge status={proj.status} />
                                    </div>
                                  </Link>
                                ))}
                            </div>
                          ) : (
                            <p className="p-8 text-center text-xs text-muted-foreground">
                              No active projects launched yet.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: CRM & FOLLOW-UPS */}
              {hasCrm && (
                <TabsContent value="crm" className="space-y-4 outline-hidden">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Card className="overflow-hidden shadow-2xs border-border/80">
                      <CardHeader className="border-b bg-card/60 p-4 pb-3">
                        <CardTitle className="text-sm font-semibold">
                          Assigned Lead Pipeline
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Inquiries ordered by recent touchpoints and
                          communication logs.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {leads.isPending ? (
                          <div className="space-y-2.5 p-4">
                            {Array.from({ length: 4 }, (_, i) => (
                              <Skeleton
                                className="h-12 w-full rounded-lg"
                                key={i}
                              />
                            ))}
                          </div>
                        ) : leads.data?.items.length ? (
                          <div className="divide-y divide-border/60">
                            {leads.data.items.map((lead) => (
                              <Link
                                className="flex items-center justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                                key={lead.id}
                                to={`/crm/leads?search=${encodeURIComponent(lead.leadNumber)}`}
                              >
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                    {lead.inquiryName}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                                    {lead.leadNumber} · {lead.contactName} ·{" "}
                                    {lead.companyName || "Direct Client"}
                                  </p>
                                </div>
                                <StatusBadge
                                  status={lead.stage}
                                  className="shrink-0"
                                />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-8 text-center text-xs text-muted-foreground">
                            No assigned leads.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden shadow-2xs border-border/80">
                      <CardHeader className="border-b bg-card/60 p-4 pb-3">
                        <CardTitle className="text-sm font-semibold">
                          Scheduled Customer Follow-ups
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Upcoming milestones and scheduled client commitments.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {followUps.isPending ? (
                          <div className="space-y-2.5 p-4">
                            {Array.from({ length: 4 }, (_, i) => (
                              <Skeleton
                                className="h-12 w-full rounded-lg"
                                key={i}
                              />
                            ))}
                          </div>
                        ) : followUps.data?.items.length ? (
                          <div className="divide-y divide-border/60">
                            {followUps.data.items.map((rem) => (
                              <Link
                                className="flex items-start justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                                key={rem.id}
                                to={`/crm/leads?search=${encodeURIComponent(rem.leadNumber ?? "")}`}
                              >
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                    {rem.title}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    Lead: {rem.leadName}
                                  </p>
                                  <p className="text-[10px] font-mono tabular-nums text-muted-foreground flex items-center gap-1 pt-0.5">
                                    <Clock className="size-3 text-amber-500" />
                                    Due: {new Date(rem.dueAt).toLocaleString()}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase font-mono shrink-0"
                                >
                                  Pending
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-8 text-center text-xs text-muted-foreground">
                            No follow-ups due.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              )}

              {/* TAB 3: ENGINEERING & QUOTATIONS */}
              {hasEngineering && (
                <TabsContent
                  value="engineering"
                  className="space-y-4 outline-hidden"
                >
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Card className="overflow-hidden shadow-2xs border-border/80">
                      <CardHeader className="border-b bg-card/60 p-4 pb-3">
                        <CardTitle className="text-sm font-semibold">
                          CAD Drawing Packages
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Active design jobs and engineering review stages.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {designJobs.isPending ? (
                          <div className="space-y-2.5 p-4">
                            {Array.from({ length: 4 }, (_, i) => (
                              <Skeleton
                                className="h-12 w-full rounded-lg"
                                key={i}
                              />
                            ))}
                          </div>
                        ) : designJobs.data?.items.length ? (
                          <div className="divide-y divide-border/60">
                            {designJobs.data.items.map((job) => (
                              <Link
                                className="flex items-center justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                                key={job.id}
                                to={`/engineering/design-jobs/${job.id}`}
                              >
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                    {job.title}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                                    Enquiry: {job.leadNumber} · Designer:{" "}
                                    {job.designerName || "Unassigned"}
                                  </p>
                                </div>
                                <StatusBadge
                                  status={job.status}
                                  className="shrink-0"
                                />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-8 text-center text-xs text-muted-foreground">
                            No design jobs found.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden shadow-2xs border-border/80">
                      <CardHeader className="border-b bg-card/60 p-4 pb-3">
                        <CardTitle className="text-sm font-semibold">
                          Commercial Quotations Queue
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Quotation revisions and commercial review status.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {quotations.isPending ? (
                          <div className="space-y-2.5 p-4">
                            {Array.from({ length: 4 }, (_, i) => (
                              <Skeleton
                                className="h-12 w-full rounded-lg"
                                key={i}
                              />
                            ))}
                          </div>
                        ) : quotations.data?.items.length ? (
                          <div className="divide-y divide-border/60">
                            {quotations.data.items.map((q) => (
                              <Link
                                className="flex items-center justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                                key={q.jobId}
                                to={`/engineering/quotations/${q.jobId}`}
                              >
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                    {q.quotationNumber || "Draft Quote"} ·{" "}
                                    {q.jobTitle}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                                    Enquiry: {q.leadNumber} ·{" "}
                                    <span className="font-semibold text-foreground">
                                      {q.grandTotal
                                        ? money(q.grandTotal)
                                        : "Rates unconfirmed"}
                                    </span>
                                  </p>
                                </div>
                                {q.status ? (
                                  <StatusBadge
                                    status={q.status}
                                    className="shrink-0"
                                  />
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0"
                                  >
                                    Unquoted
                                  </Badge>
                                )}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-8 text-center text-xs text-muted-foreground">
                            No quotations in scope.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              )}

              {/* TAB 4: PROCUREMENT */}
              {hasProcurement && (
                <TabsContent
                  value="procurement"
                  className="space-y-4 outline-hidden"
                >
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Card className="overflow-hidden shadow-2xs border-border/80">
                      <CardHeader className="border-b bg-card/60 p-4 pb-3">
                        <CardTitle className="text-sm font-semibold">
                          Active Purchase Orders
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Authorized commercial orders and vendor commitments.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {activePos.isPending ? (
                          <div className="space-y-2.5 p-4">
                            {Array.from({ length: 4 }, (_, i) => (
                              <Skeleton
                                className="h-12 w-full rounded-lg"
                                key={i}
                              />
                            ))}
                          </div>
                        ) : activePos.data?.items.length ? (
                          <div className="divide-y divide-border/60">
                            {activePos.data.items.map((po) => (
                              <Link
                                className="flex items-center justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                                key={po.id}
                                to={`/procurement/purchase-orders/${po.id}`}
                              >
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                    {po.poNumber} · {po.title}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                                    Vendor: {po.vendorName} ·{" "}
                                    <span className="font-semibold text-foreground">
                                      {money(po.grandTotal)}
                                    </span>
                                  </p>
                                </div>
                                <StatusBadge
                                  status={po.status}
                                  className="shrink-0"
                                />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-8 text-center text-xs text-muted-foreground">
                            No purchase orders found.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden shadow-2xs border-border/80">
                      <CardHeader className="border-b bg-card/60 p-4 pb-3">
                        <CardTitle className="text-sm font-semibold">
                          Partial Shipments & In-Transit Deliveries
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Material orders with pending or ongoing site receipts.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        {partialPos.isPending ? (
                          <div className="space-y-2.5 p-4">
                            {Array.from({ length: 4 }, (_, i) => (
                              <Skeleton
                                className="h-12 w-full rounded-lg"
                                key={i}
                              />
                            ))}
                          </div>
                        ) : partialPos.data?.items.length ? (
                          <div className="divide-y divide-border/60">
                            {partialPos.data.items.map((po) => (
                              <Link
                                className="flex items-center justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                                key={po.id}
                                to={`/procurement/purchase-orders/${po.id}`}
                              >
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                    {po.poNumber} · Partial Delivery
                                  </p>
                                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                                    Vendor: {po.vendorName} · Due:{" "}
                                    {po.deliveryDueDate || "Open"}
                                  </p>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] shrink-0 font-medium"
                                >
                                  In Transit
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-8 text-center text-xs text-muted-foreground">
                            No partial shipments active.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              )}

              {/* TAB 5: PROJECTS */}
              {hasProjects && (
                <TabsContent
                  value="projects"
                  className="space-y-4 outline-hidden"
                >
                  <Card className="overflow-hidden shadow-2xs border-border/80">
                    <CardHeader className="border-b bg-card/60 p-4 pb-3">
                      <CardTitle className="text-sm font-semibold">
                        Started Projects Register
                      </CardTitle>
                      <CardDescription className="text-xs">
                        All project workspaces initiated from customer-approved
                        design baselines.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {activeProjects.isPending ? (
                        <div className="space-y-2.5 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton
                              className="h-12 w-full rounded-lg"
                              key={i}
                            />
                          ))}
                        </div>
                      ) : activeProjects.data?.items.length ? (
                        <div className="divide-y divide-border/60">
                          {activeProjects.data.items.map((proj) => (
                            <Link
                              className="flex items-center justify-between gap-3 p-3.5 sm:px-4 hover:bg-muted/30 transition-colors group"
                              key={proj.id}
                              to={`/projects/${proj.id}`}
                            >
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <p className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                  {proj.projectNumber} · {proj.title}
                                </p>
                                <p className="text-[11px] text-muted-foreground font-mono truncate">
                                  Client: {proj.customerName} · Site:{" "}
                                  {proj.siteName || "Unspecified"} · Start:{" "}
                                  {proj.startDate}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4.5 px-1.5"
                                >
                                  {proj.commercialState}
                                </Badge>
                                <StatusBadge status={proj.status} />
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">
                          No active projects assigned.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </>
        ) : (
          <Alert>
            <AlertCircle className="size-4 text-primary" />
            <AlertTitle className="text-xs font-semibold">
              No Business Workspace Assigned
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-0.5">
              Your account is active, but no operational record scopes are
              assigned to your profile. Please contact an administrator or
              project manager to assign appropriate permissions.
            </AlertDescription>
          </Alert>
        )}
      </main>
    </TooltipProvider>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  attention = false,
  accentColor = "primary",
  href,
}: {
  icon: typeof Target;
  label: string;
  value?: number;
  detail: string;
  loading: boolean;
  attention?: boolean;
  accentColor?:
    | "primary"
    | "amber"
    | "blue"
    | "emerald"
    | "purple"
    | "violet"
    | "rose";
  href?: string;
}) {
  const iconColorMap = {
    primary: "bg-primary/10 text-primary border-primary/20",
    amber:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    emerald:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    purple:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    violet:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };

  const Content = (
    <Card
      className={cn(
        "shadow-2xs transition-all border-border/80 group",
        href && "hover:border-primary/40 hover:shadow-xs cursor-pointer",
        attention && "border-amber-500/30 bg-amber-500/[0.02]",
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-lg border",
              iconColorMap[accentColor],
            )}
          >
            <Icon className="size-3.5" />
          </div>
        </div>

        <div className="mt-2.5 flex items-baseline justify-between">
          {loading ? (
            <Skeleton className="h-8 w-16 rounded-md" />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">
                {value ?? 0}
              </span>
              {attention && (
                <span className="flex size-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </div>
          )}

          {href && (
            <ArrowRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          )}
        </div>

        <p className="mt-1 text-[11px] text-muted-foreground truncate leading-normal">
          {detail}
        </p>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} className="block outline-hidden">
        {Content}
      </Link>
    );
  }

  return Content;
}
