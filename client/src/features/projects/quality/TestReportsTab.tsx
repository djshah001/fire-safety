import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileBadge,
  Gauge,
  Plus,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createTestReport,
  projectTestReportsQueryOptions,
  type QualityTestReport,
  type TestReportStatus,
  type TestReportType,
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

const testTypeNames: Record<TestReportType, string> = {
  hydrostatic_pressure: 'Hydrostatic Pressure Test',
  flushing: 'Pipe Flushing & Cleaning',
  smoke_detector_response: 'Smoke Detector Response Time',
  sounder_db_level: 'Alarm Sounder dB Level',
  insulation_resistance: 'Electrical Insulation Resistance',
  pump_flow_head: 'Fire Pump Flow & Head Test',
  other: 'Other Protocol Test',
};

const reportStatusBadges: Record<
  TestReportStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'outline' },
  verified: { label: 'Verified', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export function TestReportsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Form states
  const [testType, setTestType] = useState<TestReportType>('hydrostatic_pressure');
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [testLocation, setTestLocation] = useState('');
  const [witnessedBy, setWitnessedBy] = useState('');
  const [certificateUrl, setCertificateUrl] = useState('');
  const [remarks, setRemarks] = useState('');

  // Specific parameters for hydrostatic pressure
  const [pressureBar, setPressureBar] = useState('10.5');
  const [durationHours, setDurationHours] = useState('2.0');
  const [pressureDropBar, setPressureDropBar] = useState('0.05');

  // Specific parameters for sounder dB
  const [ambientDb, setAmbientDb] = useState('55');
  const [alarmDb, setAlarmDb] = useState('85');

  const testReportsQuery = useQuery(projectTestReportsQueryOptions(projectId));

  const logMutation = useMutation({
    mutationFn: (payload: {
      testType: TestReportType;
      testDate: string;
      testLocation: string;
      parameters: Record<string, unknown>;
      witnessedBy?: string | null;
      certificateUrl?: string | null;
      remarks?: string | null;
      status: TestReportStatus;
    }) => createTestReport(projectId, payload),
    onSuccess: () => {
      toast.success('Protocol test report logged successfully');
      setIsLogOpen(false);
      setTestLocation('');
      setWitnessedBy('');
      setCertificateUrl('');
      setRemarks('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'test-reports'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to log test report'));
    },
  });

  const testReports = testReportsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Protocol Test Reports</h2>
          <p className="text-sm text-muted-foreground">
            Hydrostatic pressure, flushing, sounder dB, and detector response certifications.
          </p>
        </div>
        <Button onClick={() => setIsLogOpen(true)} className="flex items-center gap-1.5">
          <Plus className="size-4" />
          Log Test Report
        </Button>
      </div>

      {testReports.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <Gauge className="mx-auto size-10 text-muted-foreground" />
            <CardTitle>No test reports recorded</CardTitle>
            <CardDescription>
              Log hydrostatic pressure and system performance test certificates.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {testReports.map((tr) => {
            const badge = reportStatusBadges[tr.status] ?? {
              label: tr.status,
              variant: 'outline',
            };
            return (
              <Card key={tr.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-primary">{tr.reportNumber}</p>
                      <CardTitle className="text-base mt-0.5">
                        {testTypeNames[tr.testType] ?? tr.testType}
                      </CardTitle>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {tr.testDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {tr.conductedByName ?? 'Engineer'}
                    </span>
                    {tr.witnessedBy && <span>Witness: {tr.witnessedBy}</span>}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="rounded-md border p-2.5 text-xs bg-muted/40 space-y-1">
                    <p className="font-medium text-foreground">Location: {tr.testLocation}</p>
                    {tr.parameters && Object.keys(tr.parameters).length > 0 && (
                      <div className="mt-1 pt-1 border-t border-border grid grid-cols-2 gap-1 text-muted-foreground">
                        {Object.entries(tr.parameters).map(([k, v]) => (
                          <div key={k}>
                            <span className="font-medium capitalize">{k.replace(/([A-Z])/g, ' $1')}: </span>
                            <span>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {tr.remarks && (
                      <p className="text-muted-foreground italic pt-1">{tr.remarks}</p>
                    )}
                  </div>

                  {tr.certificateUrl && (
                    <div className="pt-1">
                      <a
                        href={tr.certificateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        View Signed Certificate
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Log Test Report Dialog */}
      <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Protocol Test Report</DialogTitle>
            <DialogDescription>
              Record hydrostatic, sounder, or detector testing parameters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Test Protocol</Label>
              <Select value={testType} onValueChange={(val: any) => setTestType(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hydrostatic_pressure">Hydrostatic Pressure Test</SelectItem>
                  <SelectItem value="flushing">Pipe Flushing & Cleaning</SelectItem>
                  <SelectItem value="sounder_db_level">Alarm Sounder dB Level</SelectItem>
                  <SelectItem value="smoke_detector_response">
                    Smoke Detector Response Time
                  </SelectItem>
                  <SelectItem value="insulation_resistance">
                    Electrical Insulation Resistance
                  </SelectItem>
                  <SelectItem value="pump_flow_head">Fire Pump Flow & Head</SelectItem>
                  <SelectItem value="other">Other Protocol</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Test Location / Section</Label>
              <Input
                placeholder="e.g. Tower A - Riser 1 (Floors 1 to 10)"
                value={testLocation}
                onChange={(e) => setTestLocation(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Test Date</Label>
              <Input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
              />
            </div>

            {testType === 'hydrostatic_pressure' && (
              <div className="rounded-md border p-3 bg-muted/40 space-y-3">
                <p className="text-xs font-semibold">Hydrostatic Parameters</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Pressure (Bar)</Label>
                    <Input
                      value={pressureBar}
                      onChange={(e) => setPressureBar(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duration (Hours)</Label>
                    <Input
                      value={durationHours}
                      onChange={(e) => setDurationHours(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observed Pressure Drop (Bar)</Label>
                  <Input
                    value={pressureDropBar}
                    onChange={(e) => setPressureDropBar(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            {testType === 'sounder_db_level' && (
              <div className="rounded-md border p-3 bg-muted/40 space-y-3">
                <p className="text-xs font-semibold">Sound Level Parameters</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Ambient dB</Label>
                    <Input
                      value={ambientDb}
                      onChange={(e) => setAmbientDb(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Alarm Sounder dB</Label>
                    <Input
                      value={alarmDb}
                      onChange={(e) => setAlarmDb(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Witnessed By (Optional)</Label>
              <Input
                placeholder="e.g. Chief Fire Consultant"
                value={witnessedBy}
                onChange={(e) => setWitnessedBy(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Signed Certificate File URL (Optional)</Label>
              <Input
                placeholder="https://..."
                value={certificateUrl}
                onChange={(e) => setCertificateUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Remarks / Observations</Label>
              <Textarea
                placeholder="Test observations, pressure gauges calibrated, etc."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!testLocation.trim() || logMutation.isPending}
              onClick={() => {
                let params: Record<string, unknown> = {};
                if (testType === 'hydrostatic_pressure') {
                  params = {
                    testPressureBar: parseFloat(pressureBar) || 10.5,
                    durationHours: parseFloat(durationHours) || 2.0,
                    pressureDropBar: parseFloat(pressureDropBar) || 0.05,
                    result: 'pass',
                  };
                } else if (testType === 'sounder_db_level') {
                  params = {
                    ambientDb: parseFloat(ambientDb) || 55,
                    alarmDb: parseFloat(alarmDb) || 85,
                    result: 'pass',
                  };
                }

                logMutation.mutate({
                  testType,
                  testDate,
                  testLocation: testLocation.trim(),
                  parameters: params,
                  witnessedBy: witnessedBy.trim() || null,
                  certificateUrl: certificateUrl.trim() || null,
                  remarks: remarks.trim() || null,
                  status: 'verified',
                });
              }}
            >
              {logMutation.isPending ? 'Logging...' : 'Log & Certify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
