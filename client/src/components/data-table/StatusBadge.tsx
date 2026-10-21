import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  progress: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  attention: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

function toneFor(status: string): keyof typeof tones {
  if (['won', 'active', 'completed', 'awarded', 'approved', 'accepted', 'design_authorized', 'internally_approved', 'customer_approved'].includes(status)) return 'success';
  if (['lost', 'cancelled', 'inactive', 'failed', 'declined'].includes(status)) return 'danger';
  if (['on_hold', 'pending', 'unawarded', 'returned', 'changes_requested', 'awaiting_designer'].includes(status)) return 'attention';
  if (['contacted', 'qualified', 'quoted', 'commercial_negotiation', 'committing', 'draft', 'under_review', 'submitted', 'costing', 'purchase_review', 'admin_review', 'sent_to_customer', 'issued'].includes(status)) return 'progress';
  return 'neutral';
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <Badge className={cn('capitalize shadow-none', tones[toneFor(status)], className)} variant="outline">
      {label ?? status.replaceAll('_', ' ')}
    </Badge>
  );
}
