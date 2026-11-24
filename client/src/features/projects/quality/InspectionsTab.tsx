import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Plus,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  checklistTemplatesQueryOptions,
  createInspection,
  executeInspection,
  projectInspectionsQueryOptions,
  reviewInspection,
  type ChecklistCategory,
  type InspectionStatus,
  type QualityInspection,
} from '@/api/quality';
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

const inspectionStatusBadges: Record<
  InspectionStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  scheduled: { label: 'Scheduled', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'secondary' },
  passed: { label: 'Passed', variant: 'default' },
  failed_with_punch_items: { label: 'Failed (Snags Logged)', variant: 'destructive' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export function InspectionsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [executingInspection, setExecutingInspection] = useState<QualityInspection | null>(null);
  const [reviewingInspection, setReviewingInspection] = useState<QualityInspection | null>(null);

  // Form states for scheduling
  const [scheduleCategory, setScheduleCategory] = useState<ChecklistCategory>('hydrant_piping');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleTemplateId, setScheduleTemplateId] = useState<string>('none');
  const [scheduleWitness, setScheduleWitness] = useState('');

  // Form states for executing checklist
  const [checklistResults, setChecklistResults] = useState<
    Array<{ itemKey: string; title: string; status: 'pass' | 'fail' | 'na'; remarks: string }>
  >([]);
  const [executeSummaryRemarks, setExecuteSummaryRemarks] = useState('');
  const [executeStatus, setExecuteStatus] = useState<
    'in_progress' | 'passed' | 'failed_with_punch_items' | 'rejected'
  >('passed');

  // Form states for review
  const [reviewStatus, setReviewStatus] = useState<
    'passed' | 'failed_with_punch_items' | 'rejected'
  >('passed');
  const [reviewRemarks, setReviewRemarks] = useState('');

  const inspectionsQuery = useQuery(projectInspectionsQueryOptions(projectId));
  const templatesQuery = useQuery(checklistTemplatesQueryOptions(scheduleCategory));

  const scheduleMutation = useMutation({
    mutationFn: (payload: {
      templateId?: string | null;
      title: string;
      category: ChecklistCategory;
      inspectionDate: string;
      witnessName?: string | null;
    }) => createInspection(projectId, payload),
    onSuccess: () => {
      toast.success('Inspection scheduled successfully');
      setIsScheduleOpen(false);
      setScheduleTitle('');
      setScheduleWitness('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'inspections'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to schedule inspection'));
    },
  });

  const executeMutation = useMutation({
    mutationFn: (payload: {
      inspectionId: string;
      data: {
        results: Array<{
          itemKey: string;
          title: string;
          status: 'pass' | 'fail' | 'na';
          remarks?: string | null;
        }>;
        summaryRemarks?: string | null;
        status: 'in_progress' | 'passed' | 'failed_with_punch_items' | 'rejected';
      };
    }) => executeInspection(projectId, payload.inspectionId, payload.data),
    onSuccess: () => {
      toast.success('Inspection execution updated');
      setExecutingInspection(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'inspections'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to record inspection execution'));
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: {
      inspectionId: string;
      data: {
        status: 'passed' | 'failed_with_punch_items' | 'rejected';
        summaryRemarks?: string | null;
      };
    }) => reviewInspection(projectId, payload.inspectionId, payload.data),
    onSuccess: () => {
      toast.success('Inspection reviewed and signed off');
      setReviewingInspection(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'inspections'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to sign off inspection'));
    },
  });

  const handleOpenExecute = (inspection: QualityInspection) => {
    setExecutingInspection(inspection);
    if (inspection.results && inspection.results.length > 0) {
      setChecklistResults(
        inspection.results.map((r) => ({
          itemKey: r.itemKey,
          title: r.title,
          status: r.status,
          remarks: r.remarks ?? '',
        })),
      );
    } else {
      setChecklistResults([
        { itemKey: 'visual_check', title: 'Visual & Alignment Check', status: 'pass', remarks: '' },
        { itemKey: 'material_spec', title: 'Material Specification Verification', status: 'pass', remarks: '' },
        { itemKey: 'pressure_integrity', title: 'Pressure & Joint Integrity', status: 'pass', remarks: '' },
      ]);
    }
    setExecuteSummaryRemarks(inspection.summaryRemarks ?? '');
    setExecuteStatus(
      inspection.status === 'scheduled' ? 'passed' : (inspection.status as any),
    );
  };

  const handleOpenReview = (inspection: QualityInspection) => {
    setReviewingInspection(inspection);
    setReviewStatus(
      inspection.status === 'passed' ? 'passed' : 'failed_with_punch_items',
    );
    setReviewRemarks(inspection.summaryRemarks ?? '');
  };

  const inspections = inspectionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Quality Inspections</h2>
          <p className="text-sm text-muted-foreground">
            Execute site checklists, record witness sign-offs, and track compliance.
          </p>
        </div>
        <Button onClick={() => setIsScheduleOpen(true)} className="flex items-center gap-1.5">
          <Plus className="size-4" />
          Schedule Inspection
        </Button>
      </div>

      {inspections.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <ClipboardCheck className="mx-auto size-10 text-muted-foreground" />
            <CardTitle>No inspections recorded</CardTitle>
            <CardDescription>
              Schedule quality inspections using standard engineering checklists.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {inspections.map((ins) => {
            const badge = inspectionStatusBadges[ins.status] ?? {
              label: ins.status,
              variant: 'outline',
            };
            return (
              <Card key={ins.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-primary">{ins.inspectionNumber}</p>
                      <CardTitle className="text-base mt-0.5">{ins.title}</CardTitle>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {ins.inspectionDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {ins.inspectorName ?? 'Inspector'}
                    </span>
                    {ins.witnessName && <span>Witness: {ins.witnessName}</span>}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="rounded-md border p-2.5 text-xs bg-muted/40">
                    <p className="font-medium text-foreground">
                      Category: <span className="capitalize">{ins.category.replaceAll('_', ' ')}</span>
                    </p>
                    {ins.summaryRemarks && (
                      <p className="text-muted-foreground mt-1">{ins.summaryRemarks}</p>
                    )}
                    {ins.results && ins.results.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border flex items-center gap-3 text-muted-foreground">
                        <span>Items: {ins.results.length}</span>
                        <span className="text-emerald-600 font-medium">
                          Passed: {ins.results.filter((r) => r.status === 'pass').length}
                        </span>
                        {ins.results.some((r) => r.status === 'fail') && (
                          <span className="text-destructive font-medium">
                            Failed: {ins.results.filter((r) => r.status === 'fail').length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenExecute(ins)}
                    >
                      Fill Checklist
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenReview(ins)}
                    >
                      Sign Off
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Schedule Dialog */}
      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Inspection</DialogTitle>
            <DialogDescription>
              Assign category and checklist template for site verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={scheduleCategory}
                onValueChange={(val: any) => setScheduleCategory(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hydrant_piping">Hydrant Piping</SelectItem>
                  <SelectItem value="fire_alarm">Fire Alarm & Detection</SelectItem>
                  <SelectItem value="sprinkler_system">Sprinkler System</SelectItem>
                  <SelectItem value="fire_pump">Fire Pump House</SelectItem>
                  <SelectItem value="extinguishers">Fire Extinguishers</SelectItem>
                  <SelectItem value="general">General Site Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Checklist Template</Label>
              <Select
                value={scheduleTemplateId}
                onValueChange={setScheduleTemplateId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template (Manual checklist)</SelectItem>
                  {(templatesQuery.data ?? []).map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.code} - {tpl.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Inspection Title</Label>
              <Input
                placeholder="e.g. 5th Floor Hydrant Riser Pressure & Joint Check"
                value={scheduleTitle}
                onChange={(e) => setScheduleTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Witness Name (Optional)</Label>
              <Input
                placeholder="e.g. Client Consultant / Safety Officer"
                value={scheduleWitness}
                onChange={(e) => setScheduleWitness(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!scheduleTitle.trim() || scheduleMutation.isPending}
              onClick={() => {
                scheduleMutation.mutate({
                  category: scheduleCategory,
                  title: scheduleTitle.trim(),
                  inspectionDate: scheduleDate,
                  templateId: scheduleTemplateId === 'none' ? null : scheduleTemplateId,
                  witnessName: scheduleWitness.trim() || null,
                });
              }}
            >
              {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute / Checklist Dialog */}
      <Dialog
        open={Boolean(executingInspection)}
        onOpenChange={(open) => !open && setExecutingInspection(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Execute Inspection Checklist</DialogTitle>
            <DialogDescription>
              Record verification results for {executingInspection?.inspectionNumber} -{' '}
              {executingInspection?.title}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Checklist Items</Label>
              {checklistResults.map((item, index) => (
                <div key={item.itemKey} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.title}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={item.status === 'pass' ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = [...checklistResults];
                          next[index]!.status = 'pass';
                          setChecklistResults(next);
                        }}
                      >
                        Pass
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={item.status === 'fail' ? 'destructive' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = [...checklistResults];
                          next[index]!.status = 'fail';
                          setChecklistResults(next);
                        }}
                      >
                        Fail
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={item.status === 'na' ? 'secondary' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = [...checklistResults];
                          next[index]!.status = 'na';
                          setChecklistResults(next);
                        }}
                      >
                        N/A
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Remarks or observation notes..."
                    value={item.remarks}
                    onChange={(e) => {
                      const next = [...checklistResults];
                      next[index]!.remarks = e.target.value;
                      setChecklistResults(next);
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label>Overall Status</Label>
              <Select
                value={executeStatus}
                onValueChange={(val: any) => setExecuteStatus(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed_with_punch_items">
                    Failed with Punch Items
                  </SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Summary Remarks</Label>
              <Textarea
                placeholder="Overall inspection findings and conclusions..."
                value={executeSummaryRemarks}
                onChange={(e) => setExecuteSummaryRemarks(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExecutingInspection(null)}>
              Cancel
            </Button>
            <Button
              disabled={executeMutation.isPending}
              onClick={() => {
                if (!executingInspection) return;
                executeMutation.mutate({
                  inspectionId: executingInspection.id,
                  data: {
                    results: checklistResults.map((r) => ({
                      itemKey: r.itemKey,
                      title: r.title,
                      status: r.status,
                      remarks: r.remarks || null,
                    })),
                    summaryRemarks: executeSummaryRemarks || null,
                    status: executeStatus,
                  },
                });
              }}
            >
              {executeMutation.isPending ? 'Saving...' : 'Save Results'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog
        open={Boolean(reviewingInspection)}
        onOpenChange={(open) => !open && setReviewingInspection(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review & Sign Off Inspection</DialogTitle>
            <DialogDescription>
              Independent verification for {reviewingInspection?.inspectionNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Sign-off Status</Label>
              <Select
                value={reviewStatus}
                onValueChange={(val: any) => setReviewStatus(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed">Passed & Approved</SelectItem>
                  <SelectItem value="failed_with_punch_items">
                    Failed (Punch Items Mandatory)
                  </SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Review Remarks</Label>
              <Textarea
                placeholder="Sign-off notes..."
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingInspection(null)}>
              Cancel
            </Button>
            <Button
              disabled={reviewMutation.isPending}
              onClick={() => {
                if (!reviewingInspection) return;
                reviewMutation.mutate({
                  inspectionId: reviewingInspection.id,
                  data: {
                    status: reviewStatus,
                    summaryRemarks: reviewRemarks || null,
                  },
                });
              }}
            >
              {reviewMutation.isPending ? 'Signing Off...' : 'Confirm Sign Off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
