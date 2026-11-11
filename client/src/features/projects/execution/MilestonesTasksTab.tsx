import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flag,
  ListTodo,
  Plus,
  Sliders,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createProjectMilestone,
  createProjectTask,
  projectMilestonesQuery,
  projectTasksQuery,
  updateProjectTask,
  type MilestoneStatus,
  type ProjectMilestone,
  type ProjectTask,
  type TaskStatus,
} from '@/api/execution';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const milestoneStatusBadges: Record<MilestoneStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { label: 'Pending', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'default' },
  delayed: { label: 'Delayed', variant: 'destructive' },
};

const taskStatusBadges: Record<TaskStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  not_started: { label: 'Not Started', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'default' },
  blocked: { label: 'Blocked', variant: 'destructive' },
};

export function MilestonesTasksTab({
  projectId,
  members,
}: {
  projectId: string;
  members: Array<{ userId: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const milestonesQuery = useQuery(projectMilestonesQuery(projectId));
  const tasksQuery = useQuery(projectTasksQuery(projectId));

  // Dialog states
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);

  // Form states - Milestone
  const [msName, setMsName] = useState('');
  const [msDescription, setMsDescription] = useState('');
  const [msTargetDate, setMsTargetDate] = useState('');
  const [msBillingPercentage, setMsBillingPercentage] = useState('0');

  // Form states - Task
  const [taskMilestoneId, setTaskMilestoneId] = useState<string>('none');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>('none');
  const [taskPlannedStart, setTaskPlannedStart] = useState('');
  const [taskPlannedEnd, setTaskPlannedEnd] = useState('');
  const [taskWeightage, setTaskWeightage] = useState('1.0');
  const [taskPlannedQty, setTaskPlannedQty] = useState('');
  const [taskUnit, setTaskUnit] = useState('');

  // Form states - Update Progress
  const [updateProgressPct, setUpdateProgressPct] = useState(0);
  const [updateActualQty, setUpdateActualQty] = useState('0');
  const [updateStatus, setUpdateStatus] = useState<TaskStatus>('in_progress');
  const [updateBlockedReason, setUpdateBlockedReason] = useState('');

  const createMilestoneMutation = useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      targetDate: string;
      billingPercentage: number;
    }) => createProjectMilestone(projectId, input),
    onSuccess: () => {
      toast.success('Milestone created successfully');
      setMilestoneDialogOpen(false);
      setMsName('');
      setMsDescription('');
      setMsTargetDate('');
      setMsBillingPercentage('0');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to create milestone'));
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (input: {
      milestoneId?: string | null;
      title: string;
      description?: string;
      assignedUserId?: string | null;
      plannedStartDate: string;
      plannedEndDate: string;
      weightage: number;
      plannedQuantity?: number | null;
      unitSymbol?: string | null;
    }) => createProjectTask(projectId, input),
    onSuccess: () => {
      toast.success('Task created successfully');
      setTaskDialogOpen(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskPlannedStart('');
      setTaskPlannedEnd('');
      setTaskWeightage('1.0');
      setTaskPlannedQty('');
      setTaskUnit('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to create task'));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: (input: {
      taskId: string;
      progressPercentage: number;
      actualQuantity?: number;
      status: TaskStatus;
      blockedReason?: string | null;
    }) =>
      updateProjectTask(projectId, input.taskId, {
        progressPercentage: input.progressPercentage,
        actualQuantity: input.actualQuantity,
        status: input.status,
        blockedReason: input.blockedReason,
      }),
    onSuccess: () => {
      toast.success('Task progress updated');
      setProgressDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to update task progress'));
    },
  });

  const openProgressDialog = (task: ProjectTask) => {
    setSelectedTask(task);
    setUpdateProgressPct(task.progressPercentage);
    setUpdateActualQty(task.actualQuantity || '0');
    setUpdateStatus(task.status);
    setUpdateBlockedReason(task.blockedReason || '');
    setProgressDialogOpen(true);
  };

  const milestones: ProjectMilestone[] = milestonesQuery.data || [];
  const tasksData = tasksQuery.data;
  const tasks: ProjectTask[] = tasksData?.tasks || [];
  const overallProgress = tasksData?.overallProgress ?? 0;

  return (
    <div className="space-y-6">
      {/* Overall Progress Banner */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Project Execution Progress</CardTitle>
              <CardDescription>
                Weighted completion calculated across all authorized execution tasks.
              </CardDescription>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold tracking-tight text-primary">
                {overallProgress}%
              </span>
              <p className="text-xs text-muted-foreground">Overall Weighted Completion</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Milestones Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Key Milestones</h2>
          </div>
          <Button onClick={() => setMilestoneDialogOpen(true)} size="sm">
            <Plus className="mr-1.5 size-4" />
            Add Milestone
          </Button>
        </div>

        {milestones.length === 0 ? (
          <Card className="border-dashed py-8 text-center text-muted-foreground">
            <Flag className="mx-auto mb-2 size-8 opacity-40" />
            <p>No milestones created yet.</p>
            <p className="text-xs">Define stages like Rough-in, Equipment Mounting, or Commissioning.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {milestones.map((ms) => {
              const badge = milestoneStatusBadges[ms.status] || {
                label: ms.status,
                variant: 'outline',
              };
              return (
                <Card key={ms.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-primary">
                          {ms.milestoneNumber}
                        </span>
                        <CardTitle className="text-base">{ms.name}</CardTitle>
                      </div>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {ms.description && (
                      <p className="text-xs text-muted-foreground">{ms.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        Target: {ms.targetDate}
                      </span>
                      {Number(ms.billingPercentage) > 0 && (
                        <span className="font-medium text-foreground">
                          Billing: {ms.billingPercentage}%
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Tasks Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Execution Tasks</h2>
          </div>
          <Button onClick={() => setTaskDialogOpen(true)} size="sm">
            <Plus className="mr-1.5 size-4" />
            Add Task
          </Button>
        </div>

        {tasks.length === 0 ? (
          <Card className="border-dashed py-8 text-center text-muted-foreground">
            <ListTodo className="mx-auto mb-2 size-8 opacity-40" />
            <p>No tasks planned yet.</p>
            <p className="text-xs">Break down project work into measurable site tasks.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const badge = taskStatusBadges[task.status] || {
                label: task.status,
                variant: 'outline',
              };
              return (
                <Card key={task.id} className="transition-colors hover:bg-muted/20">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1 md:max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {task.taskNumber}
                          </span>
                          {task.milestoneName && (
                            <Badge variant="outline" className="text-[10px]">
                              {task.milestoneName}
                            </Badge>
                          )}
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        <h4 className="font-medium">{task.title}</h4>
                        {task.description && (
                          <p className="text-xs text-muted-foreground">{task.description}</p>
                        )}
                        {task.blockedReason && (
                          <p className="text-xs font-medium text-destructive">
                            Blocked: {task.blockedReason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="size-3.5" />
                          <span>{task.assignedUserName || 'Unassigned'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="size-3.5" />
                          <span>
                            {task.plannedStartDate} → {task.plannedEndDate}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <div className="flex justify-between text-[10px]">
                              <span>Progress</span>
                              <span className="font-semibold text-foreground">
                                {task.progressPercentage}%
                              </span>
                            </div>
                            <div className="mt-1 h-2 w-full rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${task.progressPercentage}%` }}
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => openProgressDialog(task)}
                          >
                            <Sliders className="mr-1 size-3.5" />
                            Update
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog: Add Milestone */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project Milestone</DialogTitle>
            <DialogDescription>
              Create a critical delivery checkpoint or milestone stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ms-name">Milestone Name *</Label>
              <Input
                id="ms-name"
                placeholder="e.g. Piping & Conduit Installation"
                value={msName}
                onChange={(e) => setMsName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-target-date">Target Date *</Label>
              <Input
                id="ms-target-date"
                type="date"
                value={msTargetDate}
                onChange={(e) => setMsTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-billing">Billing Milestone % (Optional)</Label>
              <Input
                id="ms-billing"
                type="number"
                min="0"
                max="100"
                step="5"
                placeholder="0"
                value={msBillingPercentage}
                onChange={(e) => setMsBillingPercentage(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-desc">Description</Label>
              <Textarea
                id="ms-desc"
                placeholder="Scope and acceptance criteria for this milestone..."
                value={msDescription}
                onChange={(e) => setMsDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMilestoneDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!msName.trim() || !msTargetDate || createMilestoneMutation.isPending}
              onClick={() =>
                createMilestoneMutation.mutate({
                  name: msName.trim(),
                  description: msDescription.trim() || undefined,
                  targetDate: msTargetDate,
                  billingPercentage: Number(msBillingPercentage) || 0,
                })
              }
            >
              {createMilestoneMutation.isPending ? 'Saving...' : 'Create Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add Task */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Execution Task</DialogTitle>
            <DialogDescription>
              Assign a work package with planned dates and progress weighting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Task Title *</Label>
              <Input
                id="task-title"
                placeholder="e.g. Lay 65mm MS riser pipe in Shaft B"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Milestone (Optional)</Label>
              <Select value={taskMilestoneId} onValueChange={setTaskMilestoneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select milestone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Milestone</SelectItem>
                  {milestones.map((ms) => (
                    <SelectItem key={ms.id} value={ms.id}>
                      {ms.milestoneNumber} - {ms.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned Engineer / Member</Label>
              <Select value={taskAssigneeId} onValueChange={setTaskAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-start">Start Date *</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={taskPlannedStart}
                  onChange={(e) => setTaskPlannedStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-end">End Date *</Label>
                <Input
                  id="task-end"
                  type="date"
                  value={taskPlannedEnd}
                  onChange={(e) => setTaskPlannedEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-weight">Weightage</Label>
                <Input
                  id="task-weight"
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={taskWeightage}
                  onChange={(e) => setTaskWeightage(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-qty">Planned Qty</Label>
                <Input
                  id="task-qty"
                  type="number"
                  step="1"
                  placeholder="e.g. 50"
                  value={taskPlannedQty}
                  onChange={(e) => setTaskPlannedQty(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-unit">Unit</Label>
                <Input
                  id="task-unit"
                  placeholder="m / Nos"
                  value={taskUnit}
                  onChange={(e) => setTaskUnit(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                placeholder="Details of the work package..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !taskTitle.trim() ||
                !taskPlannedStart ||
                !taskPlannedEnd ||
                createTaskMutation.isPending
              }
              onClick={() =>
                createTaskMutation.mutate({
                  milestoneId: taskMilestoneId !== 'none' ? taskMilestoneId : null,
                  title: taskTitle.trim(),
                  description: taskDescription.trim() || undefined,
                  assignedUserId: taskAssigneeId !== 'none' ? taskAssigneeId : null,
                  plannedStartDate: taskPlannedStart,
                  plannedEndDate: taskPlannedEnd,
                  weightage: Number(taskWeightage) || 1.0,
                  plannedQuantity: taskPlannedQty ? Number(taskPlannedQty) : null,
                  unitSymbol: taskUnit.trim() || null,
                })
              }
            >
              {createTaskMutation.isPending ? 'Saving...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Update Progress */}
      <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Task Progress</DialogTitle>
            <DialogDescription>
              {selectedTask?.taskNumber}: {selectedTask?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <Label>Completion Percentage</Label>
                <span className="font-semibold text-primary">{updateProgressPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                className="w-full accent-primary"
                value={updateProgressPct}
                onChange={(e) => setUpdateProgressPct(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Task Status</Label>
              <Select
                value={updateStatus}
                onValueChange={(val) => setUpdateStatus(val as TaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="actual-qty">Actual Installed Quantity</Label>
              <Input
                id="actual-qty"
                type="number"
                step="0.1"
                value={updateActualQty}
                onChange={(e) => setUpdateActualQty(e.target.value)}
              />
            </div>
            {updateStatus === 'blocked' && (
              <div className="space-y-1.5">
                <Label htmlFor="blocked-reason" className="text-destructive">
                  Obstacle / Blocked Reason *
                </Label>
                <Input
                  id="blocked-reason"
                  placeholder="e.g. Waiting for site ceiling clearance from builder"
                  value={updateBlockedReason}
                  onChange={(e) => setUpdateBlockedReason(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProgressDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={updateTaskMutation.isPending}
              onClick={() => {
                if (!selectedTask) return;
                updateTaskMutation.mutate({
                  taskId: selectedTask.id,
                  progressPercentage: updateProgressPct,
                  actualQuantity: Number(updateActualQty) || 0,
                  status: updateStatus,
                  blockedReason: updateStatus === 'blocked' ? updateBlockedReason : null,
                });
              }}
            >
              {updateTaskMutation.isPending ? 'Updating...' : 'Save Progress'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

