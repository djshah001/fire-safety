import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Plus,
  ShieldAlert,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createProjectDelay,
  projectDelaysQuery,
  reviewProjectDelay,
  type DelayStatus,
  type ProjectDelay,
} from '@/api/execution';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const delayStatusBadges: Record<DelayStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  reported: { label: 'Reported', variant: 'outline' },
  under_review: { label: 'Under Review', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

const reasonLabels: Record<string, string> = {
  client_delay: 'Client Site Clearance',
  site_access: 'Site Access Restriction',
  material_unavailability: 'Material Shortage',
  contractor_delay: 'Civil Contractor Delay',
  force_majeure: 'Force Majeure / Weather',
  design_clarification: 'Design Clarification',
  other: 'Other Obstacle',
};

export function DelaysTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const delaysQuery = useQuery(projectDelaysQuery(projectId));

  // Dialogs
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedDelay, setSelectedDelay] = useState<ProjectDelay | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');

  // Form states
  const [reasonCategory, setReasonCategory] = useState('client_delay');
  const [responsibleParty, setResponsibleParty] = useState('customer');
  const [delayDays, setDelayDays] = useState('5');
  const [originalTargetDate, setOriginalTargetDate] = useState('');
  const [revisedTargetDate, setRevisedTargetDate] = useState('');
  const [impactDescription, setImpactDescription] = useState('');
  const [mitigationPlan, setMitigationPlan] = useState('');

  const createDelayMutation = useMutation({
    mutationFn: (input: Parameters<typeof createProjectDelay>[1]) =>
      createProjectDelay(projectId, input),
    onSuccess: () => {
      toast.success('Site delay logged successfully');
      setReportDialogOpen(false);
      setImpactDescription('');
      setMitigationPlan('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'delays'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to log site delay'));
    },
  });

  const reviewDelayMutation = useMutation({
    mutationFn: (input: { action: 'approve' | 'reject'; reviewNotes: string }) =>
      reviewProjectDelay(projectId, selectedDelay!.id, input),
    onSuccess: () => {
      toast.success(
        reviewAction === 'approve' ? 'Delay impact approved' : 'Delay claim rejected',
      );
      setReviewDialogOpen(false);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'delays'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to review delay'));
    },
  });

  const delays = delaysQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Project Delays & Obstacles</h2>
          <p className="text-sm text-muted-foreground">
            Audited records of client clearances, material shortages, and schedule impact adjustments.
          </p>
        </div>
        <Button onClick={() => setReportDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Report Delay
        </Button>
      </div>

      {delays.length === 0 ? (
        <Card className="border-dashed py-8 text-center text-muted-foreground">
          <Clock className="mx-auto mb-2 size-8 opacity-40" />
          <p>No site delays reported for this project.</p>
          <p className="text-xs">Schedule is tracking on time according to current baseline.</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delay Number</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Days Impact</TableHead>
                <TableHead>Target Revised</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reported By</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {delays.map((delay) => {
                const badge = delayStatusBadges[delay.status] || {
                  label: delay.status,
                  variant: 'outline',
                };
                return (
                  <TableRow key={delay.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {delay.delayNumber}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-xs">
                        {reasonLabels[delay.reasonCategory] || delay.reasonCategory}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize text-xs">
                      <Badge variant="outline">{delay.responsibleParty}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      +{delay.delayDays} days
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>{delay.originalTargetDate}</span>
                        <span>→</span>
                        <span className="font-semibold text-foreground">
                          {delay.revisedTargetDate}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {delay.reportedByName}
                    </TableCell>
                    <TableCell className="text-right">
                      {delay.status === 'reported' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDelay(delay);
                            setReviewDialogOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      )}
                      {delay.status !== 'reported' && delay.reviewNotes && (
                        <span className="text-xs text-muted-foreground truncate max-w-[150px] inline-block">
                          {delay.reviewNotes}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog: Report Delay */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report Site Delay</DialogTitle>
            <DialogDescription>
              Record an obstacle and assess its impact on the schedule baseline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Reason Category *</Label>
              <Select value={reasonCategory} onValueChange={setReasonCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_delay">Client Site Handover Delay</SelectItem>
                  <SelectItem value="site_access">Site Access / Entry Blocked</SelectItem>
                  <SelectItem value="material_unavailability">Material / Transit Delay</SelectItem>
                  <SelectItem value="contractor_delay">Civil / Electrical Contractor Stoppage</SelectItem>
                  <SelectItem value="force_majeure">Force Majeure / Rain / Flood</SelectItem>
                  <SelectItem value="design_clarification">Design Clarification Pending</SelectItem>
                  <SelectItem value="other">Other Obstacle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Responsible Party *</Label>
              <Select value={responsibleParty} onValueChange={setResponsibleParty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer / Client</SelectItem>
                  <SelectItem value="company">Company Internal</SelectItem>
                  <SelectItem value="vendor">Vendor / Supplier</SelectItem>
                  <SelectItem value="third_party">Third Party / Civil Authority</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="del-days">Days *</Label>
                <Input
                  id="del-days"
                  type="number"
                  min="1"
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="del-orig">Original Target Date *</Label>
                <Input
                  id="del-orig"
                  type="date"
                  value={originalTargetDate}
                  onChange={(e) => setOriginalTargetDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-rev">Proposed Revised Target Date *</Label>
              <Input
                id="del-rev"
                type="date"
                value={revisedTargetDate}
                onChange={(e) => setRevisedTargetDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-impact">Impact Description *</Label>
              <Textarea
                id="del-impact"
                rows={2}
                placeholder="Explain how the critical path or specific milestone is impacted..."
                value={impactDescription}
                onChange={(e) => setImpactDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-mitig">Mitigation Action Plan *</Label>
              <Textarea
                id="del-mitig"
                rows={2}
                placeholder="Steps taken to recover lost time or expedite work..."
                value={mitigationPlan}
                onChange={(e) => setMitigationPlan(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !originalTargetDate ||
                !revisedTargetDate ||
                !impactDescription.trim() ||
                !mitigationPlan.trim() ||
                createDelayMutation.isPending
              }
              onClick={() =>
                createDelayMutation.mutate({
                  reasonCategory,
                  responsibleParty,
                  delayDays: Number(delayDays) || 1,
                  originalTargetDate,
                  revisedTargetDate,
                  impactDescription: impactDescription.trim(),
                  mitigationPlan: mitigationPlan.trim(),
                })
              }
            >
              {createDelayMutation.isPending ? 'Logging...' : 'Log Delay Notice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Review Delay */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Site Delay Claim</DialogTitle>
            <DialogDescription>
              {selectedDelay?.delayNumber}: +{selectedDelay?.delayDays} days requested
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select
                value={reviewAction}
                onValueChange={(val) => setReviewAction(val as 'approve' | 'reject')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve Schedule Adjustment</SelectItem>
                  <SelectItem value="reject">Reject Delay Claim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rev-notes">Review Decision Comments *</Label>
              <Textarea
                id="rev-notes"
                rows={3}
                placeholder="Assessment of delay responsibility and formal response..."
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
              disabled={!reviewNotes.trim() || reviewDelayMutation.isPending}
              onClick={() =>
                reviewDelayMutation.mutate({
                  action: reviewAction,
                  reviewNotes: reviewNotes.trim(),
                })
              }
            >
              {reviewDelayMutation.isPending ? 'Processing...' : 'Confirm Decision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

