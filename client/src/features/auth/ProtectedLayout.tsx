import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { currentUserQuery } from "@/api/auth";
import { AppShell } from "@/app/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProtectedLayout() {
  const session = useQuery(currentUserQuery);
  const location = useLocation();
  if (session.isPending)
    return (
      <main className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="animate-spin" size={20} /> Checking your
          session…
        </div>
      </main>
    );
  if (
    session.isError &&
    axios.isAxiosError(session.error) &&
    session.error.response?.status === 401
  ) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}` }}
        to="/login"
      />
    );
  }
  if (session.isError)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Cannot reach the application</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Alert variant="destructive">
              <AlertTitle>Connection failed</AlertTitle>
              <AlertDescription>Check that the API and database are running, then try again.</AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => session.refetch()} size="lg" type="button">Try again</Button>
          </CardContent>
        </Card>
      </main>
    );
  if (session.data.mustChangePassword && location.pathname !== "/account") {
    return <Navigate replace to="/account" />;
  }
  return <AppShell user={session.data} />;
}
