import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  CheckCircle,
  FileCheck,
  GitPullRequest,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createProjectVariation,
  projectVariationsQuery,
  recordProjectVariationCustomerApproval,
  reviewProjectVariationInternal,
  type ProjectVariation,
  type VariationStatus,
} from '@/api/execution';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

const variationStatusBadges: Record<
  VariationStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'outline' },
  under_review: { label: 'Under Review', variant: 'secondary' },
  approved_internal: { label: 'Internal Approved', variant: 'secondary' },
  submitted_to_customer: { label: 'Sent to Client', variant: 'outline' },
  customer_approved: { label: 'Client Accepted', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  superseded: { label: 'Superseded', variant: 'outline' },
};

const reasonCategoryLabels: Record<string, string> = {
  customer_request: 'Customer Change Request',
  site_condition: 'Site Condition Deviation',
  regulatory_compliance: 'Fire Dept / CFO Compliance',
  design_optimization: 'Engineering Optimization',
  error_omission: 'Design Error / Omission',
  other: 'Other Scope Change',
};

export function VariationsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const variationsQuery = useQuery(projectVariationsQuery(projectId));

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<ProjectVariation | null>(null);

  // Form states - Create
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reasonCategory, setReasonCategory] = useState('customer_request');
  const [scopeDeltaSummary, setScopeDeltaSummary] = useState('');
  const [scheduleImpactDays, setScheduleImpactDays] = useState('0');
  const [costImpactAmount, setCostImpactAmount] = useState('0');

  // Form states - Technical Review
  const [reviewAction, setReviewAction] = useState<'approve_internal' | 'reject'>('approve_internal');
  const [designReviewNotes, setDesignReviewNotes] = useState('');

  // Form states - Customer Approval
  const [customerEvidenceSnapshot, setCustomerEvidenceSnapshot] = useState('');

  const createVariationMutation = useMutation({
    mutationFn: (input: Parameters<typeof createProjectVariation>[1]) =>
      createProjectVariation(projectId, input),
    onSuccess: () => {
      toast.success('Site variation initiated successfully');
      setCreateDialogOpen(false);
      setTitle('');
      setDescription('');
      setScopeDeltaSummary('');
      setScheduleImpactDays('0');
      setCostImpactAmount('0');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'variations'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to create variation'));
    },
  });

  const reviewVariationMutation = useMutation({
    mutationFn: (input: { action: 'approve_internal' | 'reject'; designReviewNotes: string }) =>
      reviewProjectVariationInternal(projectId, selectedVariation!.id, input),
    onSuccess: () => {
      toast.success('Technical design review completed');
      setReviewDialogOpen(false);
      setDesignReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'variations'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to complete review'));
    },
  });

  const customerApprovalMutation = useMutation({
    mutationFn: (input: { customerEvidenceSnapshot: string }) =>
      recordProjectVariationCustomerApproval(projectId, selectedVariation!.id, input),
    onSuccess: () => {
      toast.success('Customer variation approval recorded & baseline updated');
      setCustomerDialogOpen(false);
      setCustomerEvidenceSnapshot('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'variations'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to record customer approval'));
    },
  });

  const variations = variationsQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Scope Variations & Deviations</h2>
          <p className="text-sm text-muted-foreground">
            Changes to approved design or BOQ triggering schedule review, technical authorization, and customer change order baseline.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Initiate Variation
        </Button>
      </div>

      {variations.length === 0 ? (
        <Card className="border-dashed py-8 text-center text-muted-foreground">
          <GitPullRequest className="mx-auto mb-2 size-8 opacity-40" />
          <p>No site variations or scope changes initiated.</p>
          <p className="text-xs">
            Site additions or client requests are logged here to preserve technical baselines.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variation #</TableHead>
                <TableHead>Title & Reason</TableHead>
                <TableHead>Scope Delta</TableHead>
                <TableHead>Schedule Delta</TableHead>
                <TableHead>Cost Delta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Initiator</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variations.map((v) => {
                const badge = variationStatusBadges[v.status] || {
                  label: v.status,
                  variant: 'outline',
                };
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {v.variationNumber}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-xs">{v.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {reasonCategoryLabels[v.reasonCategory] || v.reasonCategory}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {v.scopeDeltaSummary}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.scheduleImpactDays > 0 ? `+${v.scheduleImpactDays} days` : '0 days'}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      ₹{Number(v.costImpactAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.initiatorName}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {(v.status === 'draft' || v.status === 'under_review') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedVariation(v);
                              setReviewDialogOpen(true);
                            }}
                          >
                            <ShieldCheck className="mr-1 size-3.5" />
                            Review
                          </Button>
                        )}
                        {(v.status === 'approved_internal' || v.status === 'submitted_to_customer') && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setSelectedVariation(v);
                              setCustomerDialogOpen(true);
                            }}
                          >
                            <FileCheck className="mr-1 size-3.5" />
                            Record Client Order
                          </Button>
                        )}
                        {v.status === 'customer_approved' && (
                          <span className="text-xs font-medium text-primary flex items-center gap-1">
                            <CheckCheck className="size-3.5" /> Baseline Updated
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog: Initiate Variation */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Initiate Project Variation</DialogTitle>
            <DialogDescription>
              Draft a scope deviation or client addition with schedule and commercial impact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="var-title">Variation Title *</Label>
              <Input
                id="var-title"
                placeholder="e.g. Basement 2 Car Park Additional Smoke Detectors"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Reason Category *</Label>
              <Select value={reasonCategory} onValueChange={setReasonCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_request">Customer Request / Scope Addition</SelectItem>
                  <SelectItem value="site_condition">Site Condition / Routing Obstacle</SelectItem>
                  <SelectItem value="regulatory_compliance">Fire Department / CFO Compliance</SelectItem>
                  <SelectItem value="design_optimization">Engineering Optimization</SelectItem>
                  <SelectItem value="error_omission">Design Error / Drawing Revision</SelectItem>
                  <SelectItem value="other">Other Scope Change</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="var-days">Schedule Impact (Days)</Label>
                <Input
                  id="var-days"
                  type="number"
                  min="0"
                  value={scheduleImpactDays}
                  onChange={(e) => setScheduleImpactDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="var-cost">Estimated Cost Impact (₹)</Label>
                <Input
                  id="var-cost"
                  type="number"
                  min="0"
                  step="1000"
                  value={costImpactAmount}
                  onChange={(e) => setCostImpactAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="var-delta">Scope Delta Summary *</Label>
              <Textarea
                id="var-delta"
                rows={3}
                placeholder="List items, piping meters, cabling additions, or demolition needed..."
                value={scopeDeltaSummary}
                onChange={(e) => setScopeDeltaSummary(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="var-desc">Technical Justification</Label>
              <Textarea
                id="var-desc"
                rows={2}
                placeholder="Why is this change necessary and what are the engineering implications..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || !scopeDeltaSummary.trim() || createVariationMutation.isPending}
              onClick={() =>
                createVariationMutation.mutate({
                  title: title.trim(),
                  description: description.trim() || 'Scope variation initiated',
                  reasonCategory,
                  scopeDeltaSummary: scopeDeltaSummary.trim(),
                  scheduleImpactDays: Number(scheduleImpactDays) || 0,
                  costImpactAmount: Number(costImpactAmount) || 0,
                })
              }
            >
              {createVariationMutation.isPending ? 'Initiating...' : 'Submit Variation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Technical Review */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Engineering & Design Review</DialogTitle>
            <DialogDescription>
              {selectedVariation?.variationNumber}: {selectedVariation?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select
                value={reviewAction}
                onValueChange={(val) => setReviewAction(val as 'approve_internal' | 'reject')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve_internal">Approve Internally & Prepare Quote</SelectItem>
                  <SelectItem value="reject">Reject Variation Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-rev-notes">Technical Review Notes *</Label>
              <Textarea
                id="var-rev-notes"
                rows={3}
                placeholder="Verify hydraulic load, detector spacing, or cable capacity compliance..."
                value={designReviewNotes}
                onChange={(e) => setDesignReviewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approve_internal' ? 'default' : 'destructive'}
              disabled={!designReviewNotes.trim() || reviewVariationMutation.isPending}
              onClick={() =>
                reviewVariationMutation.mutate({
                  action: reviewAction,
                  designReviewNotes: designReviewNotes.trim(),
                })
              }
            >
              {reviewVariationMutation.isPending ? 'Processing...' : 'Confirm Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Record Customer Approval */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Client Change Order Acceptance</DialogTitle>
            <DialogDescription>
              {selectedVariation?.variationNumber}: Record signed change order evidence to update project baseline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-evidence">Customer Evidence / PO Reference *</Label>
              <Textarea
                id="cust-evidence"
                rows={3}
                placeholder="e.g. Signed Change Order #CO-2026-004 received via email from client representative on 2026-11-12..."
                value={customerEvidenceSnapshot}
                onChange={(e) => setCustomerEvidenceSnapshot(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomerDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!customerEvidenceSnapshot.trim() || customerApprovalMutation.isPending}
              onClick={() =>
                customerApprovalMutation.mutate({
                  customerEvidenceSnapshot: customerEvidenceSnapshot.trim(),
                })
              }
            >
              {customerApprovalMutation.isPending ? 'Recording...' : 'Update Baseline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

