import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Filter,
  MapPin,
  Plus,
  ShieldCheck,
  User,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  closePunchItem,
  createPunchItem,
  projectPunchItemsQueryOptions,
  rectifyPunchItem,
  type ProjectPunchItem,
  type PunchSeverity,
  type PunchStatus,
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

const severityBadges: Record<
  PunchSeverity,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  critical: { label: 'Critical', variant: 'destructive' },
  major: { label: 'Major', variant: 'secondary' },
  minor: { label: 'Minor', variant: 'outline' },
};

const statusBadges: Record<
  PunchStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  open: { label: 'Open', variant: 'destructive' },
  assigned: { label: 'Assigned', variant: 'secondary' },
  rectified: { label: 'Rectified (Pending Review)', variant: 'outline' },
  verified_closed: { label: 'Closed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
};

export function PunchItemsTab({
  projectId,
  members,
}: {
  projectId: string;
  members: Array<{ userId: string; name: string; email: string }>;
}) {
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Dialog states
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [rectifyingItem, setRectifyingItem] = useState<ProjectPunchItem | null>(null);
  const [closingItem, setClosingItem] = useState<ProjectPunchItem | null>(null);

  // Form states for creating punch item
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<PunchSeverity>('major');
  const [assignedUserId, setAssignedUserId] = useState<string>('none');
  const [dueDate, setDueDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Form states for rectification
  const [rectificationNotes, setRectificationNotes] = useState('');
  const [rectificationPhotoUrl, setRectificationPhotoUrl] = useState('');

  // Form states for closing
  const [closureStatus, setClosureStatus] = useState<'verified_closed' | 'assigned'>('verified_closed');
  const [closureRemarks, setClosureRemarks] = useState('');

  const punchItemsQuery = useQuery(
    projectPunchItemsQueryOptions(projectId, {
      severity: severityFilter === 'all' ? undefined : (severityFilter as PunchSeverity),
      status: statusFilter === 'all' ? undefined : (statusFilter as PunchStatus),
    }),
  );

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description: string;
      location: string;
      severity: PunchSeverity;
      assignedToUserId?: string | null;
      dueDate?: string | null;
      photoUrl?: string | null;
    }) => createPunchItem(projectId, payload),
    onSuccess: () => {
      toast.success('Punch item logged successfully');
      setIsLogOpen(false);
      setTitle('');
      setDescription('');
      setLocation('');
      setPhotoUrl('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'punch-items'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'handover'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to log punch item'));
    },
  });

  const rectifyMutation = useMutation({
    mutationFn: (payload: {
      itemId: string;
      data: { rectificationNotes: string; rectificationPhotoUrl?: string | null };
    }) => rectifyPunchItem(projectId, payload.itemId, payload.data),
    onSuccess: () => {
      toast.success('Punch item marked as rectified');
      setRectifyingItem(null);
      setRectificationNotes('');
      setRectificationPhotoUrl('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'punch-items'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to record rectification'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: (payload: {
      itemId: string;
      data: { closureRemarks: string; status: 'verified_closed' | 'assigned' };
    }) => closePunchItem(projectId, payload.itemId, payload.data),
    onSuccess: () => {
      toast.success('Punch item closure recorded');
      setClosingItem(null);
      setClosureRemarks('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'punch-items'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'handover'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to close punch item'));
    },
  });

  const punchItems = punchItemsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Snag List & Punch Items</h2>
          <p className="text-sm text-muted-foreground">
            Track site defects, rectification assignments, and independent closure sign-offs.
          </p>
        </div>
        <Button onClick={() => setIsLogOpen(true)} className="flex items-center gap-1.5">
          <Plus className="size-4" />
          Log Punch Item
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-lg border">
        <Filter className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Filters:</span>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="rectified">Rectified</SelectItem>
            <SelectItem value="verified_closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {punchItems.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto size-10 text-muted-foreground" />
            <CardTitle>No punch items found</CardTitle>
            <CardDescription>
              All installation snags and defects are resolved, or none have been logged yet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {punchItems.map((item) => {
            const sevBadge = severityBadges[item.severity] ?? {
              label: item.severity,
              variant: 'outline',
            };
            const statBadge = statusBadges[item.status] ?? {
              label: item.status,
              variant: 'outline',
            };

            return (
              <Card key={item.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-primary">{item.itemNumber}</p>
                      <CardTitle className="text-base mt-0.5">{item.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={sevBadge.variant}>{sevBadge.label}</Badge>
                      <Badge variant={statBadge.variant}>{statBadge.label}</Badge>
                    </div>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {item.location}
                    </span>
                    {item.assignedToName && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.assignedToName}
                      </span>
                    )}
                    {item.dueDate && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        Due: {item.dueDate}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{item.description}</p>

                  {item.rectificationNotes && (
                    <div className="rounded-md border p-2 text-xs bg-muted/40 space-y-1">
                      <p className="font-medium text-foreground">Rectification Details:</p>
                      <p className="text-muted-foreground">{item.rectificationNotes}</p>
                      {item.rectificationPhotoUrl && (
                        <a
                          href={item.rectificationPhotoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          View Rectification Photo
                        </a>
                      )}
                    </div>
                  )}

                  {item.closureRemarks && (
                    <div className="rounded-md border p-2 text-xs bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200">
                      <p className="font-medium">Closure Verification:</p>
                      <p className="text-xs">{item.closureRemarks}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    {item.status !== 'verified_closed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRectifyingItem(item);
                          setRectificationNotes(item.rectificationNotes ?? '');
                          setRectificationPhotoUrl(item.rectificationPhotoUrl ?? '');
                        }}
                      >
                        <Wrench className="size-3.5 mr-1" />
                        Rectify
                      </Button>
                    )}
                    {item.status !== 'verified_closed' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setClosingItem(item);
                          setClosureRemarks(item.closureRemarks ?? '');
                        }}
                      >
                        <ShieldCheck className="size-3.5 mr-1" />
                        Verify & Close
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Log Punch Item Dialog */}
      <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Punch Item / Snag</DialogTitle>
            <DialogDescription>
              Record an installation defect or snag requiring rectification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                placeholder="e.g. Loose flange bolts on 3rd floor riser"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                placeholder="Detailed description of defect and required corrective action..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                placeholder="e.g. Block B, Shaft 2, Level 3"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={(val: any) => setSeverity(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical (Blocks Handover)</SelectItem>
                    <SelectItem value="major">Major (Blocks Handover)</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Assignee</Label>
                <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
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
            </div>

            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Defect Photo URL (Optional)</Label>
              <Input
                placeholder="https://..."
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || !description.trim() || !location.trim() || createMutation.isPending}
              onClick={() => {
                createMutation.mutate({
                  title: title.trim(),
                  description: description.trim(),
                  location: location.trim(),
                  severity,
                  assignedToUserId: assignedUserId === 'none' ? null : assignedUserId,
                  dueDate: dueDate || null,
                  photoUrl: photoUrl.trim() || null,
                });
              }}
            >
              {createMutation.isPending ? 'Logging...' : 'Log Punch Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rectify Dialog */}
      <Dialog
        open={Boolean(rectifyingItem)}
        onOpenChange={(open) => !open && setRectifyingItem(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as Rectified</DialogTitle>
            <DialogDescription>
              Record corrective work completed for {rectifyingItem?.itemNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Rectification Notes</Label>
              <Textarea
                placeholder="Describe corrective actions taken (e.g. tightened bolts to 85 Nm torque)..."
                value={rectificationNotes}
                onChange={(e) => setRectificationNotes(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Rectification Photo URL (Optional)</Label>
              <Input
                placeholder="https://..."
                value={rectificationPhotoUrl}
                onChange={(e) => setRectificationPhotoUrl(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRectifyingItem(null)}>
              Cancel
            </Button>
            <Button
              disabled={!rectificationNotes.trim() || rectifyMutation.isPending}
              onClick={() => {
                if (!rectifyingItem) return;
                rectifyMutation.mutate({
                  itemId: rectifyingItem.id,
                  data: {
                    rectificationNotes: rectificationNotes.trim(),
                    rectificationPhotoUrl: rectificationPhotoUrl.trim() || null,
                  },
                });
              }}
            >
              {rectifyMutation.isPending ? 'Saving...' : 'Submit Rectification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify & Close Dialog */}
      <Dialog
        open={Boolean(closingItem)}
        onOpenChange={(open) => !open && setClosingItem(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify & Sign Off Punch Item</DialogTitle>
            <DialogDescription>
              Independent verification for {closingItem?.itemNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Verification Outcome</Label>
              <Select
                value={closureStatus}
                onValueChange={(val: any) => setClosureStatus(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verified_closed">
                    Verified & Closed (Satisfactory)
                  </SelectItem>
                  <SelectItem value="assigned">
                    Rejected Rectification (Re-assign)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Closure Remarks</Label>
              <Textarea
                placeholder="Verification notes or reasons for re-assignment..."
                value={closureRemarks}
                onChange={(e) => setClosureRemarks(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingItem(null)}>
              Cancel
            </Button>
            <Button
              disabled={!closureRemarks.trim() || closeMutation.isPending}
              onClick={() => {
                if (!closingItem) return;
                closeMutation.mutate({
                  itemId: closingItem.id,
                  data: {
                    closureRemarks: closureRemarks.trim(),
                    status: closureStatus,
                  },
                });
              }}
            >
              {closeMutation.isPending ? 'Saving...' : 'Confirm Sign Off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
