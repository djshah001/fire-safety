import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  BellRing,
  BriefcaseBusiness,
  Building2,
  Clock3,
  DraftingCompass,
  FileText,
  FolderKanban,
  PackageCheck,
  Plus,
  ShoppingBag,
  Sparkles,
  Target,
  Truck,
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { CurrentUser } from '@/api/auth';
import { customersQuery, leadsQuery, opportunitiesQuery, remindersQuery } from '@/api/crm';
import { designJobsQuery } from '@/api/engineering';
import { projectsQuery } from '@/api/projects';
import { purchaseOrdersQuery } from '@/api/purchaseOrders';
import { quotationQueueQuery } from '@/api/quotations';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function DashboardPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();

  // Permission flags
  const canReadLeads = user.permissions.includes('crm.lead.read');
  const canWriteLeads = user.permissions.includes('crm.lead.write');
  const canReadCustomers = user.permissions.includes('crm.customer.read');
  const canReadOpportunities = user.permissions.includes('crm.opportunity.read');
  const canReadEngineering = user.permissions.includes('engineering.design.read');
  const canReadQuotation = user.permissions.includes('engineering.quotation.read');
  const canReadProjects = user.permissions.includes('project.read');
  const canReadProcurement =
    user.permissions.includes('procurement.purchase_order.read') ||
    user.permissions.includes('procurement.goods_receipt.read');

  const hasCrm = canReadLeads || canReadCustomers || canReadOpportunities;
  const hasEngineering = canReadEngineering || canReadQuotation;
  const hasProcurement = canReadProcurement;
  const hasProjects = canReadProjects;
  const hasAnyWorkspace = hasCrm || hasEngineering || hasProcurement || hasProjects;

  // CRM queries
  const leads = useQuery({
    ...leadsQuery({ page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadLeads,
  });
  const newLeads = useQuery({
    ...leadsQuery({ stage: 'new', page: 1, pageSize: 1 }),
    enabled: canReadLeads,
  });
  const followUps = useQuery({
    ...remindersQuery({ status: 'pending', page: 1, pageSize: 5, sort: 'dueAt', direction: 'asc' }),
    enabled: canReadLeads,
  });
  const customers = useQuery({
    ...customersQuery({ status: 'active', page: 1, pageSize: 1 }),
    enabled: canReadCustomers,
  });
  const opportunities = useQuery({
    ...opportunitiesQuery({ state: 'unawarded', page: 1, pageSize: 1 }),
    enabled: canReadOpportunities,
  });

  // Engineering queries
  const designJobs = useQuery({
    ...designJobsQuery({ page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadEngineering,
  });
  const pendingReviewDesigns = useQuery({
    ...designJobsQuery({ status: 'under_review', page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadEngineering,
  });
  const quotations = useQuery({
    ...quotationQueueQuery({ page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadQuotation,
  });
  const pendingQuotations = useQuery({
    ...quotationQueueQuery({ status: 'submitted', page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadQuotation,
  });

  // Project queries
  const activeProjects = useQuery({
    ...projectsQuery({ status: 'started', page: 1, pageSize: 5, sort: 'startDate', direction: 'desc' }),
    enabled: canReadProjects,
  });

  // Procurement queries
  const pendingPos = useQuery({
    ...purchaseOrdersQuery({ status: 'pending_approval', page: 1, pageSize: 5, sort: 'createdAt', direction: 'desc' }),
    enabled: canReadProcurement,
  });
  const activePos = useQuery({
    ...purchaseOrdersQuery({ page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadProcurement,
  });
  const partialPos = useQuery({
    ...purchaseOrdersQuery({ status: 'partially_delivered', page: 1, pageSize: 5, sort: 'updatedAt', direction: 'desc' }),
    enabled: canReadProcurement,
  });

  // Actionable count for high-priority badge
  const pendingActionsCount =
    (followUps.data?.total ?? 0) +
    (pendingReviewDesigns.data?.total ?? 0) +
    (pendingPos.data?.total ?? 0) +
    (pendingQuotations.data?.total ?? 0);

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Operations overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome back, {user.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-functional operations command center. Metrics are strictly filtered to your assignments and scoped grants.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWriteLeads && (
            <Button asChild size="sm">
              <Link to="/crm/leads">
                <Plus className="size-4 mr-1" /> New lead
              </Link>
            </Button>
          )}
          {canReadEngineering && (
            <Button asChild size="sm" variant="outline">
              <Link to="/engineering/design-jobs">
                <DraftingCompass className="size-4 mr-1" /> Design jobs
              </Link>
            </Button>
          )}
          {canReadProcurement && (
            <Button asChild size="sm" variant="outline">
              <Link to="/procurement/purchase-orders">
                <ShoppingBag className="size-4 mr-1" /> Purchase orders
              </Link>
            </Button>
          )}
          {canReadProjects && (
            <Button asChild size="sm" variant="outline">
              <Link to="/projects">
                <FolderKanban className="size-4 mr-1" /> Projects
              </Link>
            </Button>
          )}
        </div>
      </div>

      {user.mustChangePassword && (
        <Alert>
          <AlertTitle>Temporary password</AlertTitle>
          <AlertDescription>
            Change it from My account before continuing. An administrator can also issue a new temporary password.
          </AlertDescription>
        </Alert>
      )}

      {hasAnyWorkspace ? (
        <>
          {/* Executive KPI Grid */}
          <section aria-label="Executive KPIs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {canReadLeads && (
              <MetricCard
                attention={(newLeads.data?.total ?? 0) > 0}
                detail={`${newLeads.data?.total ?? 0} awaiting first contact`}
                icon={Target}
                label="Visible leads"
                loading={leads.isPending}
                value={leads.data?.total}
              />
            )}
            {canReadLeads && (
              <MetricCard
                attention={(followUps.data?.total ?? 0) > 0}
                detail="Assigned follow-ups due"
                icon={BellRing}
                label="Pending follow-ups"
                loading={followUps.isPending}
                value={followUps.data?.total}
              />
            )}
            {canReadEngineering && (
              <MetricCard
                attention={(pendingReviewDesigns.data?.total ?? 0) > 0}
                detail={`${pendingReviewDesigns.data?.total ?? 0} awaiting review`}
                icon={DraftingCompass}
                label="CAD Design jobs"
                loading={designJobs.isPending}
                value={designJobs.data?.total}
              />
            )}
            {canReadQuotation && (
              <MetricCard
                attention={(pendingQuotations.data?.total ?? 0) > 0}
                detail={`${pendingQuotations.data?.total ?? 0} submitted for review`}
                icon={FileText}
                label="Commercial quotes"
                loading={quotations.isPending}
                value={quotations.data?.total}
              />
            )}
            {canReadProjects && (
              <MetricCard
                detail="Active started projects"
                icon={FolderKanban}
                label="Projects"
                loading={activeProjects.isPending}
                value={activeProjects.data?.total}
              />
            )}
            {canReadProcurement && (
              <MetricCard
                attention={(pendingPos.data?.total ?? 0) > 0}
                detail={`${pendingPos.data?.total ?? 0} awaiting manager approval`}
                icon={ShoppingBag}
                label="PO Approval queue"
                loading={pendingPos.isPending}
                value={pendingPos.data?.total}
              />
            )}
            {canReadProcurement && (
              <MetricCard
                attention={(partialPos.data?.total ?? 0) > 0}
                detail={`${partialPos.data?.total ?? 0} partial shipments`}
                icon={Truck}
                label="In-transit deliveries"
                loading={partialPos.isPending}
                value={partialPos.data?.total}
              />
            )}
            {canReadCustomers && (
              <MetricCard
                detail="Within active scope"
                icon={Building2}
                label="Active customers"
                loading={customers.isPending}
                value={customers.data?.total}
              />
            )}
          </section>

          {/* Operational Tabs */}
          <Tabs className="space-y-4" defaultValue="overview">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-flex sm:w-auto">
              <TabsTrigger className="gap-2" value="overview">
                Overview
                {pendingActionsCount > 0 && (
                  <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">
                    {pendingActionsCount}
                  </Badge>
                )}
              </TabsTrigger>
              {hasCrm && <TabsTrigger value="crm">CRM & Follow-ups</TabsTrigger>}
              {hasEngineering && <TabsTrigger value="engineering">Design & Quotes</TabsTrigger>}
              {hasProcurement && <TabsTrigger value="procurement">Procurement & Deliveries</TabsTrigger>}
              {hasProjects && <TabsTrigger value="projects">Projects</TabsTrigger>}
            </TabsList>

            {/* TAB: OVERVIEW */}
            <TabsContent className="space-y-4" value="overview">
              {/* Critical Attention Banner */}
              {pendingActionsCount > 0 && (
                <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <CardHeader className="py-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-5 text-amber-600 dark:text-amber-400" />
                      <CardTitle className="text-base text-amber-900 dark:text-amber-200">
                        Immediate attention required ({pendingActionsCount} pending items)
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    {Boolean((followUps.data?.total ?? 0) > 0) && (
                      <Link
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-background/80 p-3 transition-colors hover:bg-background dark:border-amber-900/40"
                        to="/crm/follow-ups"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-xs">CRM Follow-ups</p>
                          <p className="text-xs text-muted-foreground">{followUps.data?.total} reminders due</p>
                        </div>
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                    )}
                    {Boolean((pendingReviewDesigns.data?.total ?? 0) > 0) && (
                      <Link
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-background/80 p-3 transition-colors hover:bg-background dark:border-amber-900/40"
                        to="/engineering/design-jobs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-xs">CAD Design Reviews</p>
                          <p className="text-xs text-muted-foreground">{pendingReviewDesigns.data?.total} packages submitted</p>
                        </div>
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                    )}
                    {Boolean((pendingPos.data?.total ?? 0) > 0) && (
                      <Link
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-background/80 p-3 transition-colors hover:bg-background dark:border-amber-900/40"
                        to="/procurement/purchase-orders?status=pending_approval"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-xs">PO Approvals</p>
                          <p className="text-xs text-muted-foreground">{pendingPos.data?.total} orders pending review</p>
                        </div>
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                    )}
                    {Boolean((pendingQuotations.data?.total ?? 0) > 0) && (
                      <Link
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-background/80 p-3 transition-colors hover:bg-background dark:border-amber-900/40"
                        to="/engineering/quotations?status=submitted"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-xs">Quotations</p>
                          <p className="text-xs text-muted-foreground">{pendingQuotations.data?.total} awaiting review</p>
                        </div>
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 2-Column Split: Pipeline Activity & Fulfillment */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Left: Recent CRM Leads & Design Jobs */}
                <div className="space-y-4">
                  {canReadLeads && (
                    <Card className="overflow-hidden">
                      <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
                        <div>
                          <CardTitle className="text-sm font-semibold">Active CRM Leads</CardTitle>
                          <CardDescription className="text-xs">Recent enquiry updates in your scope.</CardDescription>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/crm/leads">
                            View all <ArrowUpRight className="size-3.5 ml-1" />
                          </Link>
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {leads.isPending ? (
                          <div className="space-y-3 p-4">
                            {Array.from({ length: 3 }, (_, i) => (
                              <Skeleton className="h-10 w-full" key={i} />
                            ))}
                          </div>
                        ) : leads.data?.items.length ? (
                          <div className="divide-y text-sm">
                            {leads.data.items.slice(0, 4).map((lead) => (
                              <Link
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                                key={lead.id}
                                to={`/crm/leads?search=${encodeURIComponent(lead.leadNumber)}`}
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded bg-primary/10 text-primary">
                                  <Target className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-xs">{lead.inquiryName}</span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {lead.leadNumber} · {lead.contactName}
                                  </span>
                                </span>
                                <StatusBadge status={lead.stage} />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-6 text-center text-xs text-muted-foreground">No leads in scope.</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {canReadEngineering && (
                    <Card className="overflow-hidden">
                      <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
                        <div>
                          <CardTitle className="text-sm font-semibold">CAD Design Pipeline</CardTitle>
                          <CardDescription className="text-xs">Packages under review and revisions.</CardDescription>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/engineering/design-jobs">
                            View all <ArrowUpRight className="size-3.5 ml-1" />
                          </Link>
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {designJobs.isPending ? (
                          <div className="space-y-3 p-4">
                            {Array.from({ length: 3 }, (_, i) => (
                              <Skeleton className="h-10 w-full" key={i} />
                            ))}
                          </div>
                        ) : designJobs.data?.items.length ? (
                          <div className="divide-y text-sm">
                            {designJobs.data.items.slice(0, 4).map((job) => (
                              <Link
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                                key={job.id}
                                to={`/engineering/design-jobs/${job.id}`}
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                  <DraftingCompass className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-xs">{job.title}</span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {job.leadNumber} · Designer: {job.designerName || 'Unassigned'}
                                  </span>
                                </span>
                                <StatusBadge status={job.status} />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-6 text-center text-xs text-muted-foreground">No active design jobs.</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right: Procurement Orders & Projects */}
                <div className="space-y-4">
                  {canReadProcurement && (
                    <Card className="overflow-hidden">
                      <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
                        <div>
                          <CardTitle className="text-sm font-semibold">Procurement & Purchase Orders</CardTitle>
                          <CardDescription className="text-xs">Orders awaiting approval and shipments.</CardDescription>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/procurement/purchase-orders">
                            View all <ArrowUpRight className="size-3.5 ml-1" />
                          </Link>
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {activePos.isPending ? (
                          <div className="space-y-3 p-4">
                            {Array.from({ length: 3 }, (_, i) => (
                              <Skeleton className="h-10 w-full" key={i} />
                            ))}
                          </div>
                        ) : activePos.data?.items.length ? (
                          <div className="divide-y text-sm">
                            {activePos.data.items.slice(0, 4).map((po) => (
                              <Link
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                                key={po.id}
                                to={`/procurement/purchase-orders/${po.id}`}
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                  <ShoppingBag className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-xs">
                                    {po.poNumber} · {po.title}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {po.vendorName} · ₹{Number(po.grandTotal).toLocaleString('en-IN')}
                                  </span>
                                </span>
                                <StatusBadge status={po.status} />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-6 text-center text-xs text-muted-foreground">No purchase orders found.</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {canReadProjects && (
                    <Card className="overflow-hidden">
                      <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
                        <div>
                          <CardTitle className="text-sm font-semibold">Active Started Projects</CardTitle>
                          <CardDescription className="text-xs">Projects launched from customer-approved designs.</CardDescription>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/projects">
                            View all <ArrowUpRight className="size-3.5 ml-1" />
                          </Link>
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {activeProjects.isPending ? (
                          <div className="space-y-3 p-4">
                            {Array.from({ length: 3 }, (_, i) => (
                              <Skeleton className="h-10 w-full" key={i} />
                            ))}
                          </div>
                        ) : activeProjects.data?.items.length ? (
                          <div className="divide-y text-sm">
                            {activeProjects.data.items.slice(0, 4).map((proj) => (
                              <Link
                                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                                key={proj.id}
                                to={`/projects/${proj.id}`}
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                  <FolderKanban className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-xs">
                                    {proj.projectNumber} · {proj.title}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {proj.customerName} · Site: {proj.siteName || 'N/A'}
                                  </span>
                                </span>
                                <Badge className="text-[10px]" variant="outline">
                                  {proj.commercialState}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="p-6 text-center text-xs text-muted-foreground">No active projects found.</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* TAB: CRM & FOLLOW-UPS */}
            {hasCrm && (
              <TabsContent className="space-y-4" value="crm">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b py-3">
                      <CardTitle className="text-sm font-semibold">Assigned Enquiry Pipeline</CardTitle>
                      <CardDescription className="text-xs">Leads sorted by recent communication activity.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {leads.isPending ? (
                        <div className="space-y-3 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton className="h-10 w-full" key={i} />
                          ))}
                        </div>
                      ) : leads.data?.items.length ? (
                        <div className="divide-y text-sm">
                          {leads.data.items.map((lead) => (
                            <Link
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                              key={lead.id}
                              to={`/crm/leads?search=${encodeURIComponent(lead.leadNumber)}`}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <Target className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs">{lead.inquiryName}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {lead.leadNumber} · {lead.contactName} · {lead.companyName || 'Individual'}
                                </span>
                              </span>
                              <StatusBadge status={lead.stage} />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">No leads assigned.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden">
                    <CardHeader className="border-b py-3">
                      <CardTitle className="text-sm font-semibold">Scheduled Follow-up Reminders</CardTitle>
                      <CardDescription className="text-xs">Next communication milestones assigned to you.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {followUps.isPending ? (
                        <div className="space-y-3 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton className="h-10 w-full" key={i} />
                          ))}
                        </div>
                      ) : followUps.data?.items.length ? (
                        <div className="divide-y text-sm">
                          {followUps.data.items.map((rem) => (
                            <Link
                              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                              key={rem.id}
                              to={`/crm/leads?search=${encodeURIComponent(rem.leadNumber ?? '')}`}
                            >
                              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <Clock3 className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs">{rem.title}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{rem.leadName}</span>
                                <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                                  Due: {new Date(rem.dueAt).toLocaleString()}
                                </span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">No pending reminders.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {/* TAB: ENGINEERING & QUOTES */}
            {hasEngineering && (
              <TabsContent className="space-y-4" value="engineering">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b py-3">
                      <CardTitle className="text-sm font-semibold">CAD Drawing Packages & Jobs</CardTitle>
                      <CardDescription className="text-xs">Design workflow and internal review queue.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {designJobs.isPending ? (
                        <div className="space-y-3 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton className="h-10 w-full" key={i} />
                          ))}
                        </div>
                      ) : designJobs.data?.items.length ? (
                        <div className="divide-y text-sm">
                          {designJobs.data.items.map((job) => (
                            <Link
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                              key={job.id}
                              to={`/engineering/design-jobs/${job.id}`}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                <DraftingCompass className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs">{job.title}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  Enquiry: {job.leadNumber} · Designer: {job.designerName || 'Unassigned'}
                                </span>
                              </span>
                              <StatusBadge status={job.status} />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">No design jobs available.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden">
                    <CardHeader className="border-b py-3">
                      <CardTitle className="text-sm font-semibold">Commercial Quotations Queue</CardTitle>
                      <CardDescription className="text-xs">Quotation revisions and commercial proposal status.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {quotations.isPending ? (
                        <div className="space-y-3 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton className="h-10 w-full" key={i} />
                          ))}
                        </div>
                      ) : quotations.data?.items.length ? (
                        <div className="divide-y text-sm">
                          {quotations.data.items.map((q) => (
                            <Link
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                              key={q.jobId}
                              to={`/engineering/quotations/${q.jobId}`}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <FileText className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs">
                                  {q.quotationNumber || 'Draft'} · {q.jobTitle}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  Enquiry: {q.leadNumber} · {q.grandTotal ? `₹${Number(q.grandTotal).toLocaleString('en-IN')}` : 'No rate'}
                                </span>
                              </span>
                              {q.status ? (
                                <StatusBadge status={q.status} />
                              ) : (
                                <Badge className="text-[10px]" variant="outline">
                                  Unquoted
                                </Badge>
                              )}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">No quotations in scope.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {/* TAB: PROCUREMENT */}
            {hasProcurement && (
              <TabsContent className="space-y-4" value="procurement">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b py-3">
                      <CardTitle className="text-sm font-semibold">Purchase Order Queue</CardTitle>
                      <CardDescription className="text-xs">Recent issued orders and commercial commitments.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {activePos.isPending ? (
                        <div className="space-y-3 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton className="h-10 w-full" key={i} />
                          ))}
                        </div>
                      ) : activePos.data?.items.length ? (
                        <div className="divide-y text-sm">
                          {activePos.data.items.map((po) => (
                            <Link
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                              key={po.id}
                              to={`/procurement/purchase-orders/${po.id}`}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <ShoppingBag className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs">
                                  {po.poNumber} · {po.title}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  Vendor: {po.vendorName} · ₹{Number(po.grandTotal).toLocaleString('en-IN')}
                                </span>
                              </span>
                              <StatusBadge status={po.status} />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">No purchase orders found.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden">
                    <CardHeader className="border-b py-3">
                      <CardTitle className="text-sm font-semibold">Fulfillment & Partial Shipments</CardTitle>
                      <CardDescription className="text-xs">Orders with partial or active deliveries.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {partialPos.isPending ? (
                        <div className="space-y-3 p-4">
                          {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton className="h-10 w-full" key={i} />
                          ))}
                        </div>
                      ) : partialPos.data?.items.length ? (
                        <div className="divide-y text-sm">
                          {partialPos.data.items.map((po) => (
                            <Link
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                              key={po.id}
                              to={`/procurement/purchase-orders/${po.id}`}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <Truck className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs">
                                  {po.poNumber} · Partial delivery
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  Vendor: {po.vendorName} · Due: {po.deliveryDueDate || 'Open'}
                                </span>
                              </span>
                              <Badge className="text-[10px]" variant="secondary">
                                Active delivery
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-xs text-muted-foreground">No partial deliveries in progress.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {/* TAB: PROJECTS */}
            {hasProjects && (
              <TabsContent className="space-y-4" value="projects">
                <Card className="overflow-hidden">
                  <CardHeader className="border-b py-3">
                    <CardTitle className="text-sm font-semibold">Started Projects Register</CardTitle>
                    <CardDescription className="text-xs">
                      All projects initiated from customer-approved design baselines.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {activeProjects.isPending ? (
                      <div className="space-y-3 p-4">
                        {Array.from({ length: 4 }, (_, i) => (
                          <Skeleton className="h-10 w-full" key={i} />
                        ))}
                      </div>
                    ) : activeProjects.data?.items.length ? (
                      <div className="divide-y text-sm">
                        {activeProjects.data.items.map((proj) => (
                          <Link
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                            key={proj.id}
                            to={`/projects/${proj.id}`}
                          >
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                              <FolderKanban className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-xs">
                                {proj.projectNumber} · {proj.title}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                Customer: {proj.customerName} · Site: {proj.siteName || 'Unspecified'} · Start: {proj.startDate}
                              </span>
                            </span>
                            <Badge className="text-[10px]" variant="outline">
                              {proj.commercialState}
                            </Badge>
                            <StatusBadge status={proj.status} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="p-8 text-center text-xs text-muted-foreground">No active projects assigned.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </>
      ) : (
        <Alert>
          <AlertTitle>No business workspace assigned</AlertTitle>
          <AlertDescription>
            Your account is active, but it does not currently have operational record scopes. Ask an administrator or manager for appropriate role assignments.
          </AlertDescription>
        </Alert>
      )}
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  attention = false,
}: {
  icon: typeof Target;
  label: string;
  value?: number;
  detail: string;
  loading: boolean;
  attention?: boolean;
}) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className={attention ? 'size-4 text-amber-600 dark:text-amber-400' : 'size-4 text-muted-foreground'} />
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-20" />
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value ?? 0}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
