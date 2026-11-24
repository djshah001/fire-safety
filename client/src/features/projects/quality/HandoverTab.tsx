import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  certifyOperationalCompletion,
  executeCommercialClosure,
  projectHandoverQueryOptions,
  updateClearanceCertificate,
  updateCompletionDocument,
  updateNocCertificate,
  type HandoverDocStatus,
} from '@/api/quality';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

const docStatusBadges: Record<
  HandoverDocStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  uploaded: { label: 'Uploaded (Review Needed)', variant: 'secondary' },
  accepted: { label: 'Accepted & Verified', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export function HandoverTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  // Dialogs
  const [isClearanceOpen, setIsClearanceOpen] = useState(false);
  const [isNocOpen, setIsNocOpen] = useState(false);
  const [isCompDocOpen, setIsCompDocOpen] = useState(false);
  const [isCertifyOpen, setIsCertifyOpen] = useState(false);
  const [isCommercialOpen, setIsCommercialOpen] = useState(false);

  // Clearance form
  const [clrNum, setClrNum] = useState('');
  const [clrIssuer, setClrIssuer] = useState('');
  const [clrDate, setClrDate] = useState(new Date().toISOString().slice(0, 10));
  const [clrUrl, setClrUrl] = useState('');
  const [clrStatus, setClrStatus] = useState<HandoverDocStatus>('accepted');

  // NOC form
  const [nocNum, setNocNum] = useState('');
  const [nocIssuer, setNocIssuer] = useState('');
  const [nocDate, setNocDate] = useState(new Date().toISOString().slice(0, 10));
  const [nocExp, setNocExp] = useState('');
  const [nocUrl, setNocUrl] = useState('');
  const [nocStatus, setNocStatus] = useState<HandoverDocStatus>('accepted');

  // Completion doc form
  const [compNum, setCompNum] = useState('');
  const [compSignatory, setCompSignatory] = useState('');
  const [compDate, setCompDate] = useState(new Date().toISOString().slice(0, 10));
  const [compUrl, setCompUrl] = useState('');
  const [compStatus, setCompStatus] = useState<HandoverDocStatus>('accepted');

  // Operational Completion form
  const [completionNotes, setCompletionNotes] = useState('');

  // Commercial closure form
  const [commercialNotes, setCommercialNotes] = useState('');

  const handoverQuery = useQuery(projectHandoverQueryOptions(projectId));

  const clearanceMutation = useMutation({
    mutationFn: (payload: {
      clearanceCertificateNumber: string;
      clearanceCertificateIssuer: string;
      clearanceCertificateDate: string;
      clearanceCertificateFileUrl: string;
      clearanceCertificateStatus: HandoverDocStatus;
    }) => updateClearanceCertificate(projectId, payload),
    onSuccess: () => {
      toast.success('Clearance certificate updated');
      setIsClearanceOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'handover'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to update clearance certificate'));
    },
  });

  const nocMutation = useMutation({
    mutationFn: (payload: {
      nocNumber: string;
      nocIssuer: string;
      nocDate: string;
      nocExpiryDate?: string | null;
      nocFileUrl: string;
      nocStatus: HandoverDocStatus;
    }) => updateNocCertificate(projectId, payload),
    onSuccess: () => {
      toast.success('Fire Department NOC updated');
      setIsNocOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'handover'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to update NOC'));
    },
  });

  const compDocMutation = useMutation({
    mutationFn: (payload: {
      completionDocumentNumber: string;
      completionSignatoryName: string;
      completionDate: string;
      completionDocumentFileUrl: string;
      completionDocumentStatus: HandoverDocStatus;
    }) => updateCompletionDocument(projectId, payload),
    onSuccess: () => {
      toast.success('Practical completion document updated');
      setIsCompDocOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'handover'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to update completion document'));
    },
  });

  const certifyMutation = useMutation({
    mutationFn: (payload: { completionNotes?: string | null }) =>
      certifyOperationalCompletion(projectId, payload),
    onSuccess: () => {
      toast.success('Operational completion certified successfully!');
      setIsCertifyOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to certify operational completion'));
    },
  });

  const commercialMutation = useMutation({
    mutationFn: (payload: { commercialClosureNotes?: string | null }) =>
      executeCommercialClosure(projectId, payload),
    onSuccess: () => {
      toast.success('Commercial closure finalized');
      setIsCommercialOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to execute commercial closure'));
    },
  });

  const handover = handoverQuery.data;

  const handleOpenClearance = () => {
    setClrNum(handover?.clearanceCertificateNumber ?? '');
    setClrIssuer(handover?.clearanceCertificateIssuer ?? '');
    setClrDate(handover?.clearanceCertificateDate ?? new Date().toISOString().slice(0, 10));
    setClrUrl(handover?.clearanceCertificateFileUrl ?? '');
    setClrStatus(handover?.clearanceCertificateStatus ?? 'accepted');
    setIsClearanceOpen(true);
  };

  const handleOpenNoc = () => {
    setNocNum(handover?.nocNumber ?? '');
    setNocIssuer(handover?.nocIssuer ?? '');
    setNocDate(handover?.nocDate ?? new Date().toISOString().slice(0, 10));
    setNocExp(handover?.nocExpiryDate ?? '');
    setNocUrl(handover?.nocFileUrl ?? '');
    setNocStatus(handover?.nocStatus ?? 'accepted');
    setIsNocOpen(true);
  };

  const handleOpenCompDoc = () => {
    setCompNum(handover?.completionDocumentNumber ?? '');
    setCompSignatory(handover?.completionSignatoryName ?? '');
    setCompDate(handover?.completionDate ?? new Date().toISOString().slice(0, 10));
    setCompUrl(handover?.completionDocumentFileUrl ?? '');
    setCompStatus(handover?.completionDocumentStatus ?? 'accepted');
    setIsCompDocOpen(true);
  };

  if (!handover) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Loading handover status...
      </div>
    );
  }

  const isOperationallyComplete = handover.status === 'operationally_complete' || handover.status === 'closed';
  const isCommerciallyClosed = handover.status === 'closed';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Handover & Statutory Compliance</h2>
        <p className="text-sm text-muted-foreground">
          Mandatory statutory evidence: Fire Dept Clearance, NOC, and Practical Completion Document.
        </p>
      </div>

      {/* Operational Completion Readiness Banner */}
      <Card className={isOperationallyComplete ? 'border-emerald-500 bg-emerald-50/20' : 'border-primary/40'}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isOperationallyComplete ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="size-5 text-primary" />
                )}
                Operational Completion Gate
              </CardTitle>
              <CardDescription>
                {isOperationallyComplete
                  ? `Certified operationally complete on ${new Date(handover.operationalCompletionDate!).toLocaleDateString()}`
                  : 'All 3 statutory certificates must be accepted and all critical/major snags resolved.'}
              </CardDescription>
            </div>

            {!isOperationallyComplete && (
              <Button
                disabled={!handover.isReadyForOperationalCompletion || certifyMutation.isPending}
                onClick={() => setIsCertifyOpen(true)}
                className="flex items-center gap-1.5"
              >
                <ShieldCheck className="size-4" />
                Certify Operational Completion
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="flex items-center gap-2 rounded-md border p-2.5 bg-background">
              {handover.clearanceCertificateStatus === 'accepted' ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              )}
              <div>
                <p className="font-semibold">Clearance Certificate</p>
                <p className="text-muted-foreground capitalize">{handover.clearanceCertificateStatus}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border p-2.5 bg-background">
              {handover.nocStatus === 'accepted' ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              )}
              <div>
                <p className="font-semibold">Fire Department NOC</p>
                <p className="text-muted-foreground capitalize">{handover.nocStatus}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border p-2.5 bg-background">
              {handover.completionDocumentStatus === 'accepted' ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              )}
              <div>
                <p className="font-semibold">Completion Document</p>
                <p className="text-muted-foreground capitalize">{handover.completionDocumentStatus}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border p-2.5 bg-background">
              {handover.unresolvedCriticalMajorCount === 0 ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 text-destructive shrink-0" />
              )}
              <div>
                <p className="font-semibold">Punch List Quality Gate</p>
                <p className="text-muted-foreground">
                  {handover.unresolvedCriticalMajorCount === 0
                    ? '0 critical/major snags'
                    : `${handover.unresolvedCriticalMajorCount} open critical/major`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* The 3 Statutory Documents */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Document 1: Fire Dept Clearance */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <FileCheck2 className="size-4 text-primary" />
                1. Clearance Certificate
              </CardTitle>
              <Badge variant={docStatusBadges[handover.clearanceCertificateStatus].variant}>
                {docStatusBadges[handover.clearanceCertificateStatus].label}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Statutory fire department site clearance inspection certificate.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="rounded-md border p-2.5 text-xs bg-muted/30 space-y-1">
              <p>
                <span className="font-medium text-muted-foreground">Number: </span>
                <span className="font-semibold">{handover.clearanceCertificateNumber ?? 'Not provided'}</span>
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Issuer: </span>
                <span>{handover.clearanceCertificateIssuer ?? 'Not provided'}</span>
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Date: </span>
                <span>{handover.clearanceCertificateDate ?? 'Not provided'}</span>
              </p>
              {handover.clearanceCertificateFileUrl && (
                <p className="pt-1">
                  <a
                    href={handover.clearanceCertificateFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="size-3" />
                    View Certificate File
                  </a>
                </p>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={handleOpenClearance}>
              <Upload className="size-3.5 mr-1" />
              Update Certificate
            </Button>
          </CardContent>
        </Card>

        {/* Document 2: Fire Department NOC */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Building2 className="size-4 text-primary" />
                2. Fire Dept NOC
              </CardTitle>
              <Badge variant={docStatusBadges[handover.nocStatus].variant}>
                {docStatusBadges[handover.nocStatus].label}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Official Fire Department No Objection Certificate (NOC).
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="rounded-md border p-2.5 text-xs bg-muted/30 space-y-1">
              <p>
                <span className="font-medium text-muted-foreground">NOC Number: </span>
                <span className="font-semibold">{handover.nocNumber ?? 'Not provided'}</span>
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Authority: </span>
                <span>{handover.nocIssuer ?? 'Not provided'}</span>
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Issued: </span>
                <span>{handover.nocDate ?? 'Not provided'}</span>
              </p>
              {handover.nocExpiryDate && (
                <p>
                  <span className="font-medium text-muted-foreground">Valid Till: </span>
                  <span>{handover.nocExpiryDate}</span>
                </p>
              )}
              {handover.nocFileUrl && (
                <p className="pt-1">
                  <a
                    href={handover.nocFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="size-3" />
                    View NOC Document
                  </a>
                </p>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={handleOpenNoc}>
              <Upload className="size-3.5 mr-1" />
              Update NOC
            </Button>
          </CardContent>
        </Card>

        {/* Document 3: Practical Completion Document */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <FileText className="size-4 text-primary" />
                3. Completion Document
              </CardTitle>
              <Badge variant={docStatusBadges[handover.completionDocumentStatus].variant}>
                {docStatusBadges[handover.completionDocumentStatus].label}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Client-accepted practical completion handover certificate.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="rounded-md border p-2.5 text-xs bg-muted/30 space-y-1">
              <p>
                <span className="font-medium text-muted-foreground">Document Number: </span>
                <span className="font-semibold">{handover.completionDocumentNumber ?? 'Not provided'}</span>
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Client Signatory: </span>
                <span>{handover.completionSignatoryName ?? 'Not provided'}</span>
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Completion Date: </span>
                <span>{handover.completionDate ?? 'Not provided'}</span>
              </p>
              {handover.completionDocumentFileUrl && (
                <p className="pt-1">
                  <a
                    href={handover.completionDocumentFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="size-3" />
                    View Signed Handover
                  </a>
                </p>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={handleOpenCompDoc}>
              <Upload className="size-3.5 mr-1" />
              Update Completion Doc
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Commercial Closure Card (Independent) */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="size-4 text-muted-foreground" />
                Commercial Settlement & Final Closure
              </CardTitle>
              <CardDescription>
                Commercial settlement proceeds independently following operational handover.
              </CardDescription>
            </div>

            {isCommerciallyClosed ? (
              <Badge variant="default">Commercially Closed</Badge>
            ) : (
              <Button
                variant="secondary"
                disabled={!isOperationallyComplete || commercialMutation.isPending}
                onClick={() => setIsCommercialOpen(true)}
              >
                Execute Commercial Closure
              </Button>
            )}
          </div>
        </CardHeader>

        {isCommerciallyClosed && (
          <CardContent className="text-xs text-muted-foreground">
            Closed on {new Date(handover.commercialClosureDate!).toLocaleDateString()}.{' '}
            {handover.commercialClosureNotes && `Notes: ${handover.commercialClosureNotes}`}
          </CardContent>
        )}
      </Card>

      {/* Clearance Dialog */}
      <Dialog open={isClearanceOpen} onOpenChange={setIsClearanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Fire Clearance Certificate</DialogTitle>
            <DialogDescription>
              Record statutory fire department clearance details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Certificate Number</Label>
              <Input
                placeholder="e.g. FDC-2026-9812"
                value={clrNum}
                onChange={(e) => setClrNum(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Issuing Authority / Officer</Label>
              <Input
                placeholder="e.g. Chief Fire Officer, Municipal Corp"
                value={clrIssuer}
                onChange={(e) => setClrIssuer(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Date of Issue</Label>
              <Input type="date" value={clrDate} onChange={(e) => setClrDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Certificate File URL</Label>
              <Input
                placeholder="https://..."
                value={clrUrl}
                onChange={(e) => setClrUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={clrStatus} onValueChange={(val: any) => setClrStatus(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accepted & Verified</SelectItem>
                  <SelectItem value="uploaded">Uploaded (Pending Verification)</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClearanceOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!clrNum.trim() || !clrIssuer.trim() || !clrUrl.trim() || clearanceMutation.isPending}
              onClick={() => {
                clearanceMutation.mutate({
                  clearanceCertificateNumber: clrNum.trim(),
                  clearanceCertificateIssuer: clrIssuer.trim(),
                  clearanceCertificateDate: clrDate,
                  clearanceCertificateFileUrl: clrUrl.trim(),
                  clearanceCertificateStatus: clrStatus,
                });
              }}
            >
              {clearanceMutation.isPending ? 'Saving...' : 'Save Certificate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NOC Dialog */}
      <Dialog open={isNocOpen} onOpenChange={setIsNocOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Fire Department NOC</DialogTitle>
            <DialogDescription>
              Record Fire Department No Objection Certificate details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>NOC Number</Label>
              <Input
                placeholder="e.g. NOC-FIRE-2026-4410"
                value={nocNum}
                onChange={(e) => setNocNum(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Issuing Authority</Label>
              <Input
                placeholder="e.g. State Fire Prevention Authority"
                value={nocIssuer}
                onChange={(e) => setNocIssuer(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Issue Date</Label>
                <Input type="date" value={nocDate} onChange={(e) => setNocDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Expiry Date (Optional)</Label>
                <Input type="date" value={nocExp} onChange={(e) => setNocExp(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>NOC Document File URL</Label>
              <Input
                placeholder="https://..."
                value={nocUrl}
                onChange={(e) => setNocUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={nocStatus} onValueChange={(val: any) => setNocStatus(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accepted & Verified</SelectItem>
                  <SelectItem value="uploaded">Uploaded (Pending Verification)</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNocOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!nocNum.trim() || !nocIssuer.trim() || !nocUrl.trim() || nocMutation.isPending}
              onClick={() => {
                nocMutation.mutate({
                  nocNumber: nocNum.trim(),
                  nocIssuer: nocIssuer.trim(),
                  nocDate,
                  nocExpiryDate: nocExp || null,
                  nocFileUrl: nocUrl.trim(),
                  nocStatus,
                });
              }}
            >
              {nocMutation.isPending ? 'Saving...' : 'Save NOC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion Doc Dialog */}
      <Dialog open={isCompDocOpen} onOpenChange={setIsCompDocOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Practical Completion Document</DialogTitle>
            <DialogDescription>
              Record client-signed completion document details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Document Number</Label>
              <Input
                placeholder="e.g. COMP-2026-ALPHA"
                value={compNum}
                onChange={(e) => setCompNum(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Client Authorized Signatory</Label>
              <Input
                placeholder="e.g. Rajesh Mehta (Project Director, Alpha Corp)"
                value={compSignatory}
                onChange={(e) => setCompSignatory(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Completion Date</Label>
              <Input type="date" value={compDate} onChange={(e) => setCompDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Signed Document File URL</Label>
              <Input
                placeholder="https://..."
                value={compUrl}
                onChange={(e) => setCompUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={compStatus} onValueChange={(val: any) => setCompStatus(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accepted & Verified</SelectItem>
                  <SelectItem value="uploaded">Uploaded (Pending Verification)</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompDocOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!compNum.trim() || !compSignatory.trim() || !compUrl.trim() || compDocMutation.isPending}
              onClick={() => {
                compDocMutation.mutate({
                  completionDocumentNumber: compNum.trim(),
                  completionSignatoryName: compSignatory.trim(),
                  completionDate: compDate,
                  completionDocumentFileUrl: compUrl.trim(),
                  completionDocumentStatus: compStatus,
                });
              }}
            >
              {compDocMutation.isPending ? 'Saving...' : 'Save Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certify Operational Completion Dialog */}
      <Dialog open={isCertifyOpen} onOpenChange={setIsCertifyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Certify Operational Completion</DialogTitle>
            <DialogDescription>
              This will transition the project status to completed and lock statutory requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Alert className="border-emerald-500 bg-emerald-50/20">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <AlertTitle>All Verification Gates Passed</AlertTitle>
              <AlertDescription className="text-xs">
                Fire Clearance, NOC, and Practical Completion certificates are accepted, and 0
                critical or major snags remain.
              </AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label>Completion Notes (Optional)</Label>
              <Textarea
                placeholder="Operational handover notes, client remarks..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCertifyOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={certifyMutation.isPending}
              onClick={() => {
                certifyMutation.mutate({ completionNotes: completionNotes.trim() || null });
              }}
            >
              {certifyMutation.isPending ? 'Certifying...' : 'Certify & Complete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commercial Closure Dialog */}
      <Dialog open={isCommercialOpen} onOpenChange={setIsCommercialOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Execute Commercial Closure</DialogTitle>
            <DialogDescription>
              Finalize commercial settlement and mark project commercially closed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Commercial Settlement Notes</Label>
              <Textarea
                placeholder="Final invoicing status, retention payment terms, etc."
                value={commercialNotes}
                onChange={(e) => setCommercialNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommercialOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={commercialMutation.isPending}
              onClick={() => {
                commercialMutation.mutate({
                  commercialClosureNotes: commercialNotes.trim() || null,
                });
              }}
            >
              {commercialMutation.isPending ? 'Finalizing...' : 'Confirm Closure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
