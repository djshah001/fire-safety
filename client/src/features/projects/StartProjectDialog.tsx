import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import { projectStartOptionsQuery, startProject } from '@/api/projects';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

function dateAfter(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }

export function StartProjectDialog({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [open, setOpen] = useState(false);
  const [designRevisionId, setDesignRevisionId] = useState(''); const [boqRevisionId, setBoqRevisionId] = useState('none'); const [managerId, setManagerId] = useState(''); const [members, setMembers] = useState<Set<string>>(new Set());
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const options = useQuery(projectStartOptionsQuery(jobId, open));
  const matchingBoqs = useMemo(() => options.data?.boqRevisions.filter((boq) => !designRevisionId || boq.designRevisionId === designRevisionId) ?? [], [options.data, designRevisionId]);
  const mutation = useMutation({ mutationFn: async (form: FormData) => startProject(jobId, { title: String(form.get('title')), designRevisionId, boqRevisionId: boqRevisionId === 'none' ? undefined : boqRevisionId, projectManagerUserId: managerId, memberUserIds: [...members].filter((id) => id !== managerId), startDate: String(form.get('startDate')), targetCompletionDate: String(form.get('targetCompletionDate')), startReason: String(form.get('startReason')), idempotencyKey }), async onSuccess(result) { await Promise.all([queryClient.invalidateQueries({ queryKey: ['projects'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]); toast.success('Project started from the approved design and accepted quotation baseline.'); setOpen(false); navigate(`/projects/${result.project.id}`); }, onError(error) { toast.error(getApiErrorMessage(error)); } });
  const changeOpen = (next: boolean) => { setOpen(next); if (next) setIdempotencyKey(crypto.randomUUID()); };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button><FolderKanban />Start project</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start project</DialogTitle>
          <DialogDescription>Both a customer-approved design and an accepted quotation revision are required to start a project.</DialogDescription>
        </DialogHeader>
        {options.isPending ? (
          <div className="space-y-3 py-5"><Skeleton className="h-12" /><Skeleton className="h-32" /><Skeleton className="h-12" /></div>
        ) : options.isError ? (
          <Alert variant="destructive"><AlertTitle>Cannot load project-start options</AlertTitle><AlertDescription>{getApiErrorMessage(options.error)}</AlertDescription></Alert>
        ) : options.data.existingProjectId ? (
          <div className="space-y-4">
            <Alert><AlertTitle>Project already started</AlertTitle><AlertDescription>This opportunity already has one project. Duplicate project creation is blocked.</AlertDescription></Alert>
            <Button className="w-full" onClick={() => navigate(`/projects/${options.data.existingProjectId}`)}>Open project</Button>
          </div>
        ) : !options.data.context.siteId || options.data.context.siteStatus !== 'active' ? (
          <Alert variant="destructive"><AlertTitle>Active site required</AlertTitle><AlertDescription>Link an active customer site to the opportunity before project start.</AlertDescription></Alert>
        ) : !options.data.acceptedQuotation ? (
          <div className="space-y-4 py-2">
            <Alert variant="destructive">
              <AlertTitle>Accepted quotation required</AlertTitle>
              <AlertDescription>
                A project can only be started after a quotation revision has been formally accepted by the customer. Approve, issue, and record customer acceptance in the Quotations workspace first.
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline" className="w-full" onClick={() => setOpen(false)}>
              <Link to={`/engineering/design-jobs/${jobId}/quotations`}>Open Quotations Workspace</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); }}>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <Alert className="sm:col-span-2 border-emerald-500/30 bg-emerald-500/5">
                <AlertTitle className="text-xs font-semibold">
                  Accepted Quotation: R{options.data.acceptedQuotation.revisionNumber} · {options.data.acceptedQuotation.title}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  {options.data.acceptedQuotation.currency} {options.data.acceptedQuotation.grandTotal} · Evidence: {options.data.acceptedQuotation.evidenceReference}
                </AlertDescription>
              </Alert>
              <Field label="Project title" name="title" defaultValue={jobTitle} required />
              <div className="space-y-2"><Label>Customer site</Label><Input value={`${options.data.context.customerName} · ${options.data.context.siteName}`} readOnly /></div>
              <div className="space-y-2"><Label>Approved design revision</Label><Select value={designRevisionId} onValueChange={(value) => { setDesignRevisionId(value); setBoqRevisionId('none'); }}><SelectTrigger><SelectValue placeholder="Choose exact revision" /></SelectTrigger><SelectContent>{options.data.designRevisions.map((revision) => <SelectItem value={revision.id} key={revision.id}>R{revision.revisionNumber} · {revision.title}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Approved BOQ (optional)</Label><Select value={boqRevisionId} onValueChange={setBoqRevisionId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No BOQ linked at start</SelectItem>{matchingBoqs.map((boq) => <SelectItem value={boq.id} key={boq.id}>R{boq.revisionNumber} · {boq.title}</SelectItem>)}</SelectContent></Select></div>
              <Field label="Actual start date" name="startDate" type="date" defaultValue={dateAfter(0)} required />
              <Field label="Target completion date" name="targetCompletionDate" type="date" defaultValue={dateAfter(30)} required />
              <div className="space-y-2 sm:col-span-2">
                <Label>Project manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger><SelectValue placeholder="Choose an eligible employee" /></SelectTrigger>
                  <SelectContent>
                    {options.data.eligibleMembers.map((member) => (
                      <SelectItem value={member.id} key={member.id}>
                        {member.name} · {member.email}{member.isOnLeave ? ' (On Leave)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Additional project members</Label>
                <div className="max-h-44 space-y-2 overflow-auto rounded-lg border p-3">
                  {options.data.eligibleMembers.filter((member) => member.id !== managerId).map((member) => (
                    <label className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted" key={member.id}>
                      <Checkbox checked={members.has(member.id)} onCheckedChange={(checked) => setMembers((current) => { const next = new Set(current); if (checked === true) next.add(member.id); else next.delete(member.id); return next; })} />
                      <span className="flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {member.name}
                          {member.isOnLeave && <Badge variant="outline" className="text-[10px]">On Leave</Badge>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{member.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="startReason">Start reason / authority</Label><Textarea id="startReason" name="startReason" minLength={5} maxLength={1000} required placeholder="Why work is authorized to begin from this approved design and accepted quotation" /></div>
              {mutation.isError && <Alert className="sm:col-span-2" variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !designRevisionId || !managerId}>{mutation.isPending ? 'Starting…' : 'Start project'}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...props} /></div>; }
