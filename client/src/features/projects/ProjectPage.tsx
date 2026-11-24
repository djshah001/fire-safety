import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FileText,
  Gauge,
  GitPullRequest,
  ListTodo,
  Receipt,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  addProjectMember,
  eligibleProjectMembersQuery,
  projectQuery,
  removeProjectMember,
} from '@/api/projects';
import { StatusBadge } from '@/components/data-table/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DailyProgressReportsTab } from './execution/DailyProgressReportsTab';
import { DelaysTab } from './execution/DelaysTab';
import { ExpensesTab } from './execution/ExpensesTab';
import { MilestonesTasksTab } from './execution/MilestonesTasksTab';
import { VariationsTab } from './execution/VariationsTab';
import { InspectionsTab } from './quality/InspectionsTab';
import { TestReportsTab } from './quality/TestReportsTab';
import { PunchItemsTab } from './quality/PunchItemsTab';
import { HandoverTab } from './quality/HandoverTab';

export function ProjectPage() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  // Team member dialog states
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');

  const query = useQuery(projectQuery(projectId));
  const eligibleQuery = useQuery(eligibleProjectMembersQuery(projectId));

  const addMemberMutation = useMutation({
    mutationFn: (input: { userId: string; role?: string }) =>
      addProjectMember(projectId!, input),
    onSuccess: () => {
      toast.success('Team member added successfully');
      setAddMemberOpen(false);
      setSelectedUserId('');
      setSelectedRole('member');
      queryClient.invalidateQueries({ queryKey: projectQuery(projectId).queryKey });
      queryClient.invalidateQueries({ queryKey: eligibleProjectMembersQuery(projectId).queryKey });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to add team member'));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId!, userId),
    onSuccess: () => {
      toast.success('Team member removed');
      queryClient.invalidateQueries({ queryKey: projectQuery(projectId).queryKey });
      queryClient.invalidateQueries({ queryKey: eligibleProjectMembersQuery(projectId).queryKey });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to remove team member'));
    },
  });

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
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <FileCheck2 className="size-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <ListTodo className="size-4" />
            <span>Tasks</span>
          </TabsTrigger>
          <TabsTrigger value="dpr" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <FileText className="size-4" />
            <span>DPR</span>
          </TabsTrigger>
          <TabsTrigger value="delays" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <Clock className="size-4" />
            <span>Delays</span>
          </TabsTrigger>
          <TabsTrigger value="variations" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <GitPullRequest className="size-4" />
            <span>Variations</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <Receipt className="size-4" />
            <span>Expenses</span>
          </TabsTrigger>
          <TabsTrigger value="inspections" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <ClipboardCheck className="size-4" />
            <span>Inspections</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <Gauge className="size-4" />
            <span>Tests</span>
          </TabsTrigger>
          <TabsTrigger value="snags" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <Wrench className="size-4" />
            <span>Punch List</span>
          </TabsTrigger>
          <TabsTrigger value="handover" className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm">
            <ShieldCheck className="size-4" />
            <span>Handover</span>
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
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="size-5" />
                      Assigned team
                    </CardTitle>
                    <CardDescription>Only explicit members can open this project.</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setAddMemberOpen(true)}
                  >
                    <UserPlus className="size-3.5" />
                    Add Member
                  </Button>
                </div>
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
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{member.role.replaceAll('_', ' ')}</Badge>
                      {members.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title={`Remove ${member.name}`}
                          disabled={removeMemberMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${member.name} from this project?`)) {
                              removeMemberMutation.mutate(member.userId);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
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

        {/* Tab 7: Inspections */}
        <TabsContent value="inspections">
          <InspectionsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 8: Test Reports */}
        <TabsContent value="tests">
          <TestReportsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 9: Punch List */}
        <TabsContent value="snags">
          <PunchItemsTab projectId={projectId!} members={members} />
        </TabsContent>

        {/* Tab 10: Handover */}
        <TabsContent value="handover">
          <HandoverTab projectId={projectId!} />
        </TabsContent>
      </Tabs>

      {/* Add Team Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Select an active company employee to add to this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select active employee" />
                </SelectTrigger>
                <SelectContent>
                  {!eligibleQuery.data || eligibleQuery.data.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No other eligible employees found
                    </SelectItem>
                  ) : (
                    eligibleQuery.data.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} ({emp.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Project Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Team Member</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="design">Design Engineer</SelectItem>
                  <SelectItem value="purchase">Purchase Executive</SelectItem>
                  <SelectItem value="sales">Sales Liaison</SelectItem>
                  <SelectItem value="viewer">Viewer (Read-Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedUserId || selectedUserId === 'none' || addMemberMutation.isPending}
              onClick={() => {
                addMemberMutation.mutate({ userId: selectedUserId, role: selectedRole });
              }}
            >
              {addMemberMutation.isPending ? 'Adding...' : 'Add to Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
