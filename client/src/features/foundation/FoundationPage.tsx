import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Flame, LoaderCircle } from 'lucide-react';
import { healthQuery } from '@/api/health';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function FoundationPage() {
  const health = useQuery(healthQuery);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Flame aria-hidden="true" size={22} />
            </span>
            <div>
              <p className="font-semibold">Fire Safety</p>
              <p className="text-sm text-muted-foreground">Internal operations platform</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:py-20">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Foundation</p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            A secure base for CRM, engineering, and procurement.
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            The workspace, API boundary, responsive theme, and health contract are ready. Business modules will be added one at a time after their database and permission rules are implemented.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {['Assigned-record access', 'Immutable revisions', 'No self-approval'].map((item) => (
              <Card key={item} size="sm"><CardContent className="font-medium">{item}</CardContent></Card>
            ))}
          </div>
        </div>

        <Card className="self-start">
          <CardHeader><CardTitle>API status</CardTitle></CardHeader>
          <CardContent><div className="flex items-start gap-3">
            {health.isPending ? (
              <LoaderCircle aria-hidden="true" className="mt-0.5 animate-spin text-muted-foreground" size={20} />
            ) : health.isSuccess ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 text-emerald-600 dark:text-emerald-400" size={20} />
            ) : (
              <CircleAlert aria-hidden="true" className="mt-0.5 text-destructive" size={20} />
            )}
            <div>
              <p className="font-medium">
                {health.isPending ? 'Checking API…' : health.isSuccess ? 'API is responding' : 'API is unavailable'}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {health.isSuccess
                  ? `Last response ${new Date(health.data.timestamp).toLocaleTimeString()}`
                  : 'Start the Express server to connect this client.'}
              </p>
            </div>
          </div>{health.isPending && <Skeleton className="mt-4 h-4 w-2/3" />}{health.isError && <Alert className="mt-4" variant="destructive"><AlertTitle>API unavailable</AlertTitle><AlertDescription>Start the Express server to connect this client.</AlertDescription></Alert>}</CardContent>
        </Card>
      </section>
    </main>
  );
}
