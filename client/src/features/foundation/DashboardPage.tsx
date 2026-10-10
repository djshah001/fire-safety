import { CircleCheck, ShieldCheck, Workflow } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import type { CurrentUser } from '@/api/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <p className="text-sm font-semibold text-primary">Foundation</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">The secure employee and organization foundation is ready for the first CRM workflow.</p>
      {user.mustChangePassword && (
        <Alert className="mt-6"><AlertTitle>Temporary password</AlertTitle><AlertDescription>Change it from My account before continuing. An administrator can also issue a new temporary password.</AlertDescription></Alert>
      )}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          [ShieldCheck, 'Scoped access', 'Permissions are checked by the API and tied to explicit assignments.'],
          [Workflow, 'Audited lifecycle', 'Logins and employee access changes are recorded transactionally.'],
          [CircleCheck, 'Ready for CRM', 'No production dashboard data is mocked before the module exists.'],
        ].map(([Icon, title, description]) => {
          const CardIcon = Icon as typeof ShieldCheck;
          return <Card key={title as string}><CardHeader><CardIcon className="text-primary" size={22} /><CardTitle>{title as string}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{description as string}</p></CardContent></Card>;
        })}
      </div>
    </main>
  );
}
