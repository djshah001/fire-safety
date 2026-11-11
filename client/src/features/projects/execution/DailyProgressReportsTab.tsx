import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  HardHat,
  Plus,
  RefreshCw,
  User,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createDailyReport,
  projectDailyReportQuery,
  projectDailyReportsQuery,
  projectTasksQuery,
  reviewDailyReport,
  submitDailyReportRevision,
  type DailyReportListItem,
  type DailyReportStatus,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const reportStatusBadges: Record<DailyReportStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  returned: { label: 'Returned', variant: 'destructive' },
};

export function DailyProgressReportsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const reportsQuery = useQuery(projectDailyReportsQuery(projectId));
  const tasksQuery = useQuery(projectTasksQuery(projectId));

  // Selection & Details Sheet
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const detailQuery = useQuery(projectDailyReportQuery(projectId, selectedReportId || undefined));

  // Modals
  const [newReportDialogOpen, setNewReportDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'return'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');

  // New Report Form
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]!);
  const [weatherCondition, setWeatherCondition] = useState('clear');
  const [workSummary, setWorkSummary] = useState('');
  const [obstacles, setObstacles] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [manpowerCount, setManpowerCount] = useState('4');
  const [skilLabor, setSkilLabor] = useState('2');
  const [unskilledLabor, setUnskilledLabor] = useState('2');
  const [equipmentList, setEquipmentList] = useState('');

  // Selected tasks progress inside report
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [taskWorkDone, setTaskWorkDone] = useState('');
  const [taskProgressPct, setTaskProgressPct] = useState('50');

  const createReportMutation = useMutation({
    mutationFn: (input: Parameters<typeof createDailyReport>[1]) =>
      createDailyReport(projectId, input),
    onSuccess: () => {
      toast.success('Daily progress report submitted successfully');
      setNewReportDialogOpen(false);
      setWorkSummary('');
      setObstacles('');
      setCorrectiveActions('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'daily-reports'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to submit daily report'));
    },
  });

  const reviewReportMutation = useMutation({
    mutationFn: (input: { action: 'approve' | 'return'; reviewNotes: string }) =>
      reviewDailyReport(projectId, selectedReportId!, input),
    onSuccess: (data) => {
      toast.success(
        reviewAction === 'approve'
          ? 'Daily progress report approved'
          : 'Daily progress report returned for revision',
      );
      setReviewDialogOpen(false);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'daily-reports'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to review daily report'));
    },
  });

  const reports = reportsQuery.data || [];
  const tasks = tasksQuery.data?.tasks || [];
  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Daily Progress Reports (DPR)</h2>
          <p className="text-sm text-muted-foreground">
            Site logs submitted by field engineers covering manpower, equipment, and work completed.
          </p>
        </div>
        <Button onClick={() => setNewReportDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Submit Daily Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card className="border-dashed py-8 text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 size-8 opacity-40" />
          <p>No daily progress reports logged for this project yet.</p>
          <p className="text-xs">
            Site engineers can log daily activities, obstacle notices, and manpower.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Report Number</TableHead>
                <TableHead>Site Engineer</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Review Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => {
                const badge = reportStatusBadges[report.status] || {
                  label: report.status,
                  variant: 'outline',
                };
                return (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="size-4 text-muted-foreground" />
                        {report.reportDate}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-primary">
                      {report.reportNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        <User className="size-3.5 text-muted-foreground" />
                        {report.siteEngineerName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        Rev {report.currentRevisionNumber}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {report.reviewNotes || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <Eye className="mr-1 size-3.5" />
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Sheet: View Report Details & Review */}
      <Sheet open={Boolean(selectedReportId)} onOpenChange={(open) => !open && setSelectedReportId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detail && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {detail.report.reportNumber}
                  </span>
                  <Badge
                    variant={reportStatusBadges[detail.report.status]?.variant || 'outline'}
                  >
                    {reportStatusBadges[detail.report.status]?.label || detail.report.status}
                  </Badge>
                </div>
                <SheetTitle className="text-xl">
                  Daily Report - {detail.report.reportDate}
                </SheetTitle>
                <SheetDescription>
                  Submitted by {detail.report.siteEngineerName} · Revision {detail.report.currentRevisionNumber}
                </SheetDescription>
              </SheetHeader>

              {detail.report.reviewNotes && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
                    Manager Review Feedback
                  </p>
                  <p className="mt-1">{detail.report.reviewNotes}</p>
                </div>
              )}

              {detail.latestRevision && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Work Summary</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detail.latestRevision.workSummary}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border p-2.5">
                      <span className="text-muted-foreground">Weather</span>
                      <p className="mt-0.5 font-medium capitalize">
                        {detail.latestRevision.weatherCondition}
                      </p>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <span className="text-muted-foreground">Site Manpower</span>
                      <p className="mt-0.5 font-medium">
                        {detail.latestRevision.manpowerCount} personnel
                      </p>
                    </div>
                  </div>

                  {detail.latestRevision.obstaclesEncountered && (
                    <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
                      <h4 className="flex items-center gap-1.5 font-medium text-destructive">
                        <AlertCircle className="size-4" />
                        Obstacles / Delays
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {detail.latestRevision.obstaclesEncountered}
                      </p>
                      {detail.latestRevision.correctiveActions && (
                        <p className="mt-1.5 text-xs text-foreground">
                          <strong>Action Plan:</strong> {detail.latestRevision.correctiveActions}
                        </p>
                      )}
                    </div>
                  )}

                  {detail.taskProgress.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Tasks Completed Today</h4>
                      <div className="space-y-1.5">
                        {detail.taskProgress.map((tp) => (
                          <div
                            key={tp.taskId}
                            className="flex items-center justify-between rounded-md border p-2 text-xs"
                          >
                            <div>
                              <p className="font-medium">{tp.taskTitle}</p>
                              <p className="text-muted-foreground">{tp.workCompletedToday}</p>
                            </div>
                            <Badge variant="secondary">{tp.progressPercentage}%</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.materialConsumption.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Material Consumed on Site</h4>
                      <div className="space-y-1.5">
                        {detail.materialConsumption.map((m) => (
                          <div
                            key={m.itemId}
                            className="flex items-center justify-between rounded-md border p-2 text-xs"
                          >
                            <div>
                              <p className="font-medium">{m.itemName}</p>
                              <span className="font-mono text-muted-foreground">{m.itemCode}</span>
                            </div>
                            <span className="font-semibold">{m.quantityConsumed} units</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manager Review Action Buttons */}
              {detail.report.status === 'submitted' && (
                <div className="border-t pt-4 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setReviewAction('approve');
                      setReviewDialogOpen(true);
                    }}
                  >
                    <CheckCircle2 className="mr-1.5 size-4" />
                    Approve Report
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setReviewAction('return');
                      setReviewDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="mr-1.5 size-4" />
                    Return for Revision
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog: Create Daily Report */}
      <Dialog open={newReportDialogOpen} onOpenChange={setNewReportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit Daily Progress Report</DialogTitle>
            <DialogDescription>
              Record manpower, tasks completed, and site conditions for the day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dpr-date">Report Date *</Label>
                <Input
                  id="dpr-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Weather</Label>
                <Select value={weatherCondition} onValueChange={setWeatherCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clear">Clear / Fair</SelectItem>
                    <SelectItem value="sunny">Sunny</SelectItem>
                    <SelectItem value="cloudy">Cloudy</SelectItem>
                    <SelectItem value="rainy">Rainy</SelectItem>
                    <SelectItem value="dust_storm">Dust Storm</SelectItem>
                    <SelectItem value="extreme_heat">Extreme Heat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dpr-work">Work Summary *</Label>
              <Textarea
                id="dpr-work"
                rows={3}
                placeholder="Summary of piping, cabling, or equipment installation performed today..."
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dpr-mp">Total Manpower</Label>
                <Input
                  id="dpr-mp"
                  type="number"
                  min="0"
                  value={manpowerCount}
                  onChange={(e) => setManpowerCount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dpr-skilled">Skilled</Label>
                <Input
                  id="dpr-skilled"
                  type="number"
                  min="0"
                  value={skilLabor}
                  onChange={(e) => setSkilLabor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dpr-unskilled">Helpers</Label>
                <Input
                  id="dpr-unskilled"
                  type="number"
                  min="0"
                  value={unskilledLabor}
                  onChange={(e) => setUnskilledLabor(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dpr-equip">Equipment & Machinery on Site</Label>
              <Input
                id="dpr-equip"
                placeholder="e.g. Scaffolding 3 sets, Pipe groover 1 no, Welding set"
                value={equipmentList}
                onChange={(e) => setEquipmentList(e.target.value)}
              />
            </div>

            {/* Task Progress Link */}
            {tasks.length > 0 && (
              <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Task Progress Update (Optional)
                </Label>
                <div className="space-y-2">
                  <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select task to advance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.taskNumber} - {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedTaskId !== 'none' && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">Work Performed</Label>
                        <Input
                          placeholder="e.g. Completed 12 joints"
                          value={taskWorkDone}
                          onChange={(e) => setTaskWorkDone(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">New Progress %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={taskProgressPct}
                          onChange={(e) => setTaskProgressPct(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="dpr-obstacles">Obstacles / Stoppages (Optional)</Label>
              <Textarea
                id="dpr-obstacles"
                rows={2}
                placeholder="Any client clearance issues, site access blocks, or material shortages..."
                value={obstacles}
                onChange={(e) => setObstacles(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewReportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!workSummary.trim() || createReportMutation.isPending}
              onClick={() => {
                const taskProgress =
                  selectedTaskId !== 'none'
                    ? [
                        {
                          taskId: selectedTaskId,
                          workCompletedToday: taskWorkDone.trim() || 'Work continued',
                          progressPercentage: Number(taskProgressPct) || 0,
                        },
                      ]
                    : [];

                const manpowerDetails = [
                  { trade: 'Skilled Technician', count: Number(skilLabor) || 0 },
                  { trade: 'Helper / Unskilled', count: Number(unskilledLabor) || 0 },
                ];

                const equipmentDetails = equipmentList
                  ? equipmentList.split(',').map((eq) => ({
                      equipmentName: eq.trim(),
                      count: 1,
                      status: 'operational',
                    }))
                  : [];

                createReportMutation.mutate({
                  reportDate,
                  weatherCondition,
                  workSummary: workSummary.trim(),
                  obstaclesEncountered: obstacles.trim() || undefined,
                  correctiveActions: correctiveActions.trim() || undefined,
                  manpowerCount: Number(manpowerCount) || 0,
                  manpowerDetails,
                  equipmentDetails,
                  taskProgress,
                });
              }}
            >
              {createReportMutation.isPending ? 'Submitting...' : 'Submit DPR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Review Report */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve'
                ? 'Approve Daily Progress Report'
                : 'Return Daily Progress Report'}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve'
                ? 'Verify and accept site reported progress into project records.'
                : 'Return report to site engineer for corrections or missing evidence.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="review-notes">Review Comments *</Label>
              <Textarea
                id="review-notes"
                rows={3}
                placeholder={
                  reviewAction === 'approve'
                    ? 'Verified against site visit notes...'
                    : 'Please detail reason for returning and required corrections...'
                }
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
              disabled={!reviewNotes.trim() || reviewReportMutation.isPending}
              onClick={() =>
                reviewReportMutation.mutate({
                  action: reviewAction,
                  reviewNotes: reviewNotes.trim(),
                })
              }
            >
              {reviewReportMutation.isPending
                ? 'Processing...'
                : reviewAction === 'approve'
                  ? 'Confirm Approval'
                  : 'Return Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

