import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DesignJob } from '@/api/engineering';
import { Badge } from '@/components/ui/badge';

function duration(milliseconds: number) {
  const absolute = Math.abs(milliseconds);
  const days = Math.floor(absolute / 86_400_000);
  const hours = Math.floor((absolute % 86_400_000) / 3_600_000);
  const minutes = Math.floor((absolute % 3_600_000) / 60_000);
  const seconds = Math.floor((absolute % 60_000) / 1_000);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export function DesignDeadline({ job, compact = false }: { job: DesignJob; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!job.designDueAt || job.designerCompletedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [job.designDueAt, job.designerCompletedAt]);

  if (!job.designDueAt) return <span className="text-sm text-muted-foreground">Starts when assigned</span>;
  const dueAt = new Date(job.designDueAt).getTime();
  const completedAt = job.designerCompletedAt ? new Date(job.designerCompletedAt).getTime() : undefined;
  const overdue = (completedAt ?? now) > dueAt;
  const label = completedAt
    ? `Completed ${duration(completedAt - dueAt)} ${overdue ? 'late' : 'early'}`
    : `${overdue ? 'Overdue by' : 'Due in'} ${duration(dueAt - now)}`;

  if (compact) return <Badge variant={overdue ? 'destructive' : completedAt ? 'secondary' : 'outline'} className="whitespace-nowrap tabular-nums">{label}</Badge>;
  return <div className={overdue ? 'text-destructive' : 'text-foreground'}><div className="flex items-center gap-2 font-semibold"><Clock3 className="size-4" />{label}</div><p className="mt-1 text-xs text-muted-foreground">Deadline {new Date(job.designDueAt).toLocaleString()} · {job.bufferExtensionsUsed}/3 buffers used</p></div>;
}
