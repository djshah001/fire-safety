import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BellRing, BriefcaseBusiness, Building2, Clock3, Plus, Target } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { CurrentUser } from '@/api/auth';
import { customersQuery, leadsQuery, opportunitiesQuery, remindersQuery } from '@/api/crm';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const canReadLeads = user.permissions.includes('crm.lead.read');
  const canWriteLeads = user.permissions.includes('crm.lead.write');
  const canReadCustomers = user.permissions.includes('crm.customer.read');
  const canReadOpportunities = user.permissions.includes('crm.opportunity.read');
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
  const hasCrmWorkspace = canReadLeads || canReadCustomers || canReadOpportunities;

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Operations overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome back, {user.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your counts include only records currently visible through assignment or an explicit grant.</p>
        </div>
        {canWriteLeads && <Button asChild><Link to="/crm/leads"><Plus />New lead</Link></Button>}
      </div>

      {user.mustChangePassword && (
        <Alert><AlertTitle>Temporary password</AlertTitle><AlertDescription>Change it from My account before continuing. An administrator can also issue a new temporary password.</AlertDescription></Alert>
      )}

      {hasCrmWorkspace ? (
        <>
          <section aria-label="CRM metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canReadLeads && <MetricCard icon={Target} label="Visible leads" loading={leads.isPending} value={leads.data?.total} detail={`${newLeads.data?.total ?? 0} awaiting first contact`} />}
            {canReadLeads && <MetricCard icon={BellRing} label="Pending follow-ups" loading={followUps.isPending} value={followUps.data?.total} detail="Assigned to you" attention={(followUps.data?.total ?? 0) > 0} />}
            {canReadOpportunities && <MetricCard icon={BriefcaseBusiness} label="Unawarded opportunities" loading={opportunities.isPending} value={opportunities.data?.total} detail="Commercial award still pending" />}
            {canReadCustomers && <MetricCard icon={Building2} label="Active customers" loading={customers.isPending} value={customers.data?.total} detail="Within your current scope" />}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
            {canReadLeads && (
              <Card aria-label="Recently updated leads" className="overflow-hidden" role="region">
                <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
                  <div><CardTitle className="text-base">Recently updated leads</CardTitle><CardDescription>Assigned enquiries ordered by latest change.</CardDescription></div>
                  <Button asChild size="sm" variant="ghost"><Link to="/crm/leads">View all <ArrowUpRight /></Link></Button>
                </CardHeader>
                <CardContent className="p-0">
                  {leads.isPending ? <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-12 w-full" key={index} />)}</div> : leads.data?.items.length ? (
                    <div className="divide-y">
                      {leads.data.items.map((lead) => (
                        <Link className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50" key={lead.id} to={`/crm/leads?search=${encodeURIComponent(lead.leadNumber)}`}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Target className="size-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{lead.inquiryName}</span><span className="block truncate text-xs text-muted-foreground">{lead.leadNumber} · {lead.contactName}</span></span>
                          <StatusBadge status={lead.stage} />
                          <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{new Date(lead.updatedAt).toLocaleDateString()}</span>
                        </Link>
                      ))}
                    </div>
                  ) : <p className="p-8 text-center text-sm text-muted-foreground">No leads are assigned in your current scope.</p>}
                </CardContent>
              </Card>
            )}

            {canReadLeads && (
              <Card aria-label="Next follow-ups" className="overflow-hidden" role="region">
                <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
                  <div><CardTitle className="text-base">Next follow-ups</CardTitle><CardDescription>Your nearest pending reminders.</CardDescription></div>
                  <Button asChild size="sm" variant="ghost"><Link to="/crm/follow-ups">Open list <ArrowUpRight /></Link></Button>
                </CardHeader>
                <CardContent className="p-0">
                  {followUps.isPending ? <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-12 w-full" key={index} />)}</div> : followUps.data?.items.length ? (
                    <div className="divide-y">
                      {followUps.data.items.map((reminder) => (
                        <Link className="flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50" key={reminder.id} to={`/crm/leads?search=${encodeURIComponent(reminder.leadNumber ?? '')}`}>
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><Clock3 className="size-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{reminder.title}</span><span className="block truncate text-xs text-muted-foreground">{reminder.leadName}</span><span className="mt-1 block text-xs tabular-nums text-muted-foreground">{new Date(reminder.dueAt).toLocaleString()}</span></span>
                        </Link>
                      ))}
                    </div>
                  ) : <p className="p-8 text-center text-sm text-muted-foreground">No pending follow-ups are assigned to you.</p>}
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : (
        <Alert><AlertTitle>No business workspace assigned</AlertTitle><AlertDescription>Your account is active, but it does not currently have a CRM record scope. Ask an administrator or manager for the appropriate role and assignment.</AlertDescription></Alert>
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><Icon className={attention ? 'size-4 text-amber-600 dark:text-amber-400' : 'size-4 text-muted-foreground'} /></div>
        {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value ?? 0}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
