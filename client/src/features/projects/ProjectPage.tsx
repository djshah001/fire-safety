import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock,
  FileCheck2,
  FileText,
  GitPullRequest,
  ListTodo,
  Receipt,
  Users,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/api/client';
import { projectQuery } from '@/api/projects';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DailyProgressReportsTab } from './execution/DailyProgressReportsTab';
import { DelaysTab } from './execution/DelaysTab';
import { ExpensesTab } from './execution/ExpensesTab';
import { MilestonesTasksTab } from './execution/MilestonesTasksTab';
import { VariationsTab } from './execution/VariationsTab';

export function ProjectPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const query = useQuery(projectQuery(projectId));

  if (query.isPending) {
    return (
      <main className="mx-auto max-w-6xl space-y-5 p-6">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost">
          <Link to="/projects">
            <ArrowLeft className="mr-2 size-4" />
            Projects
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Project unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(query.error, 'This project is outside your assignment.')}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const { project, members, designBaseline, commercialBaseline } = query.data;

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Back button and Header */}
      <div>
        <Button asChild className="-ml-2" variant="ghost">
          <Link to="/projects">
            <ArrowLeft className="mr-2 size-4" />
            Projects
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">{project.projectNumber}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{project.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.customerName} · {project.siteName}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={project.status} />
            <StatusBadge status={project.commercialState} />
          </div>
        </div>
      </div>

      {/* Commercial State Notice */}
      {project.commercialState !== 'awarded' && (
        <Alert>
          <AlertTitle>Project started before commercial award</AlertTitle>
          <AlertDescription>
            Quotation acceptance or customer PO is not a project-start requirement. The commercial
            state remains {project.commercialState}; procurement and execution proceed independently.
          </AlertDescription>
        </Alert>
      )}

      {/* Execution Workspace Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <FileCheck2 className="size-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1.5">
            <ListTodo className="size-4" />
            <span className="hidden sm:inline">Milestones & Tasks</span>
          </TabsTrigger>
          <TabsTrigger value="dpr" className="flex items-center gap-1.5">
            <FileText className="size-4" />
            <span className="hidden sm:inline">Daily Reports</span>
          </TabsTrigger>
          <TabsTrigger value="delays" className="flex items-center gap-1.5">
            <Clock className="size-4" />
            <span className="hidden sm:inline">Delays</span>
          </TabsTrigger>
          <TabsTrigger value="variations" className="flex items-center gap-1.5">
            <GitPullRequest className="size-4" />
            <span className="hidden sm:inline">Variations</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-1.5">
            <Receipt className="size-4" />
            <span className="hidden sm:inline">Expenses</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Started</CardDescription>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4" />
                  {new Date(`${project.startDate}T00:00:00`).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {project.startReason}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Target completion</CardDescription>
                <CardTitle className="text-base">
                  {new Date(`${project.targetCompletionDate}T00:00:00`).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Commercial baseline</CardDescription>
                <CardTitle className="text-base">
                  {commercialBaseline
                    ? `Quotation R${commercialBaseline.quotationRevisionNumber}`
                    : 'Not yet accepted'}
                </CardTitle>
              </CardHeader>
              {commercialBaseline && (
                <CardContent className="text-sm text-muted-foreground">
                  Accepted {new Date(commercialBaseline.acceptedAt).toLocaleString()}
                </CardContent>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck2 className="size-5" />
                  Design baseline
                </CardTitle>
                <CardDescription>
                  Immutable technical authority used to start this project.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {designBaseline ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">
                      R{designBaseline.designRevisionNumber} · {designBaseline.designTitle}
                    </p>
                    <p className="text-muted-foreground">
                      Customer evidence: {designBaseline.customerEvidence}
                    </p>
                    <p>
                      <Badge variant="secondary">
                        {designBaseline.boqRevisionId
                          ? 'Approved BOQ linked'
                          : 'No BOQ required at start'}
                      </Badge>
                    </p>
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>Design baseline is unavailable.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-5" />
                  Assigned team
                </CardTitle>
                <CardDescription>Only explicit members can open this project.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.map((member) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    key={member.userId}
                  >
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <Badge variant="outline">{member.role.replaceAll('_', ' ')}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Milestones & Tasks */}
        <TabsContent value="tasks">
          <MilestonesTasksTab projectId={projectId!} members={members} />
        </TabsContent>

        {/* Tab 3: Daily Progress Reports */}
        <TabsContent value="dpr">
          <DailyProgressReportsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 4: Delays */}
        <TabsContent value="delays">
          <DelaysTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 5: Variations */}
        <TabsContent value="variations">
          <VariationsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 6: Expenses */}
        <TabsContent value="expenses">
          <ExpensesTab projectId={projectId!} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
