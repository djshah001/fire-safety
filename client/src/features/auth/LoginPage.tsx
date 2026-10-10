import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flame, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { currentUserQuery, login } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type Fields = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const mutation = useMutation({
    mutationFn: login,
    onSuccess(user) {
      queryClient.setQueryData(currentUserQuery.queryKey, user);
      const destination = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(destination, { replace: true });
    },
  });

  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 font-semibold">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-foreground/15"><Flame size={22} /></span>
          Fire Safety
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] opacity-75">Internal operations</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight">One accountable path from enquiry to safe delivery.</h1>
          <p className="mt-5 text-lg leading-8 opacity-80">Employee access is assigned by an administrator and checked on every request.</p>
        </div>
        <p className="text-sm opacity-70">CRM · Engineering · Procurement</p>
      </section>

      <section className="flex min-h-screen flex-col">
        <div className="flex justify-end p-4 sm:p-6"><ThemeToggle /></div>
        <div className="m-auto w-full max-w-md px-5 pb-24">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Flame size={22} /></span>
            <span className="font-semibold">Fire Safety</span>
          </div>
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold text-primary">Employee sign in</p>
              <CardTitle className="text-3xl tracking-tight">Welcome back</CardTitle>
              <CardDescription>Use the account created for you by your administrator.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input aria-invalid={Boolean(form.formState.errors.email)} autoComplete="username" className="min-h-11" id="login-email" type="email" {...form.register("email")} />
                  {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="login-password">Password</Label>
                    <Button asChild className="h-auto p-0" variant="link"><Link to="/forgot-password">Forgot password?</Link></Button>
                  </div>
                  <Input aria-invalid={Boolean(form.formState.errors.password)} autoComplete="current-password" className="min-h-11" id="login-password" type="password" {...form.register("password")} />
                  {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
                </div>
                {mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error, "Sign in failed. Check the server and try again.")}</AlertDescription></Alert>}
                <Button className="min-h-11 w-full" disabled={mutation.isPending} size="lg" type="submit">
                  {mutation.isPending && <LoaderCircle className="animate-spin" />}
                  {mutation.isPending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">Need access? Contact your administrator. Local development captures reset messages in its private test mailbox.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
