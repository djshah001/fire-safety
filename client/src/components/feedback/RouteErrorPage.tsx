import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertCircle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function RouteErrorPage() {
  const error = useRouteError();

  let title = 'An unexpected error occurred';
  let message = 'Something went wrong while displaying this page.';
  let details: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText || 'Error'}`;
    message = (error.data as { message?: string })?.message || error.statusText || 'The requested page failed to load.';
  } else if (error instanceof Error) {
    message = error.message;
    details = error.stack;
  } else if (typeof error === 'string') {
    message = error;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <Card className="max-w-lg w-full shadow-lg border-destructive/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription className="text-sm mt-1.5 text-muted-foreground">{message}</CardDescription>
        </CardHeader>

        {details && import.meta.env.DEV && (
          <CardContent className="pt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
              Developer Diagnostics
            </p>
            <div className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {details}
            </div>
          </CardContent>
        )}

        <CardFooter className="flex flex-wrap items-center justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Go Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Reload Page
          </Button>
          <Button asChild size="sm">
            <Link to="/">
              <Home className="h-4 w-4 mr-1.5" /> Return Home
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

