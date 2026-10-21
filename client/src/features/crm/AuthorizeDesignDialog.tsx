import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Ruler } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { authorizeLeadDesign, designAssigneesQuery, type Lead } from '@/api/crm';
import { getApiErrorMessage } from '@/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function AuthorizeDesignDialog({ lead, open, onOpenChange }: {
  lead?: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [surveyRequested, setSurveyRequested] = useState(false);
  const heads = useQuery({ ...designAssigneesQuery('design_head'), enabled: open });
  const authorization = useMutation({
    mutationFn: (form: FormData) => authorizeLeadDesign({
      leadId: lead!.id,
      expectedVersion: lead!.rowVersion,
      title: String(form.get('title')),
      designHeadUserId: String(form.get('designHeadUserId')),
      surveyRequested,
      authorizationNotes: String(form.get('authorizationNotes')),
    }),
    async onSuccess(result) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] }),
        queryClient.invalidateQueries({ queryKey: ['crm', 'lead', lead?.id] }),
        queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] }),
      ]);
      toast.success(result.replayed ? 'Existing design authorization confirmed.' : 'Free design authorized.');
      onOpenChange(false);
    },
  });
  const missingConfiguration = !heads.isPending && (heads.data?.length ?? 0) === 0;

  return <Dialog open={open} onOpenChange={(next) => { if (!next) { authorization.reset(); setSurveyRequested(false); } onOpenChange(next); }}>
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={(event) => { event.preventDefault(); authorization.mutate(new FormData(event.currentTarget)); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ruler className="size-5 text-primary" />Authorize free design</DialogTitle>
          <DialogDescription>Assign the design head. That head will choose the design engineer before design work starts.</DialogDescription>
        </DialogHeader>
        <div className="mt-5 space-y-4">
          <div className="space-y-2"><Label htmlFor="design-title">Design job title</Label><Input defaultValue={lead?.inquiryName} id="design-title" maxLength={200} minLength={2} name="title" required /></div>
          <div className="space-y-2"><Label>Design head</Label><Select name="designHeadUserId" required><SelectTrigger aria-label="Design head"><SelectValue placeholder="Choose design head" /></SelectTrigger><SelectContent>{heads.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="authorization-notes">Authorization notes</Label><Textarea id="authorization-notes" maxLength={1_000} minLength={3} name="authorizationNotes" placeholder="Scope and customer context for the free design request" required /></div>
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={surveyRequested} onCheckedChange={(value) => setSurveyRequested(value === true)} />
            <span><span className="block text-sm font-medium">Request a site survey</span><span className="block text-xs font-normal text-muted-foreground">Optional. Leaving this clear never blocks design authorization.</span></span>
          </Label>
          {missingConfiguration && <Alert><AlertTitle>Design head is not configured</AlertTitle><AlertDescription>An administrator must assign an active design-head role before sales can authorize design.</AlertDescription></Alert>}
          {(heads.isError || authorization.isError) && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(heads.error ?? authorization.error)}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="mt-6">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
          <Button disabled={authorization.isPending || heads.isPending || missingConfiguration} type="submit">{authorization.isPending && <LoaderCircle className="animate-spin" />}Authorize design</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
