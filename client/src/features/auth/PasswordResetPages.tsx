import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { confirmPasswordReset, requestPasswordReset } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const emailSchema = z.object({ email: z.email("Enter a valid email address.") });
const passwordSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters.").regex(/[a-z]/, "Add a lowercase letter.").regex(/[A-Z]/, "Add an uppercase letter.").regex(/\d/, "Add a number."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

function ResetFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <div className="flex justify-end"><ThemeToggle /></div>
      <Card className="mx-auto mt-[8vh] w-full max-w-md">{children}</Card>
    </main>
  );
}

function BackToLogin() {
  return <Button asChild className="h-auto w-fit p-0 text-muted-foreground" variant="link"><Link to="/login"><ArrowLeft />Back to sign in</Link></Button>;
}

function SuccessState({ title, description, action }: { title: string; description: string; action: string }) {
  return (
    <><CardHeader className="items-center text-center"><CheckCircle2 className="size-9 text-emerald-600" /><CardTitle className="text-2xl">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><Button asChild className="w-full" size="lg"><Link to="/login">{action}</Link></Button></CardContent></>
  );
}

export function ForgotPasswordPage() {
  const form = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });
  const mutation = useMutation({ mutationFn: ({ email }: { email: string }) => requestPasswordReset(email) });
  if (mutation.isSuccess) return <ResetFrame><SuccessState action="Return to sign in" description="If the account is active, reset instructions have been queued. Local development writes them to the private test mailbox." title="Check the configured mailbox" /></ResetFrame>;
  return (
    <ResetFrame>
      <CardHeader><BackToLogin /><CardTitle className="mt-4 text-2xl">Reset your password</CardTitle><CardDescription>Enter your employee email. The response is the same whether an account exists or not.</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input aria-invalid={Boolean(form.formState.errors.email)} autoComplete="username" className="min-h-11" id="reset-email" type="email" {...form.register("email")} />{form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}</div>
          {mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}
          <Button className="min-h-11 w-full" disabled={mutation.isPending} size="lg" type="submit">{mutation.isPending && <LoaderCircle className="animate-spin" />}Queue reset instructions</Button>
        </form>
      </CardContent>
    </ResetFrame>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "", confirmPassword: "" } });
  const mutation = useMutation({ mutationFn: ({ password }: z.infer<typeof passwordSchema>) => confirmPasswordReset({ token, password }) });
  if (mutation.isSuccess) return <ResetFrame><SuccessState action="Continue to sign in" description="Every previous session has been revoked. Sign in with the new password." title="Password updated" /></ResetFrame>;
  return (
    <ResetFrame>
      <CardHeader><BackToLogin /><CardTitle className="mt-4 text-2xl">Choose a new password</CardTitle></CardHeader>
      <CardContent>
        {!token && <Alert className="mb-5" variant="destructive"><AlertTitle>Reset token missing</AlertTitle><AlertDescription>Request a new reset message.</AlertDescription></Alert>}
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          {([['password', 'New password'], ['confirmPassword', 'Confirm new password']] as const).map(([name, label]) => <div className="space-y-2" key={name}><Label htmlFor={name}>{label}</Label><Input aria-invalid={Boolean(form.formState.errors[name])} autoComplete="new-password" className="min-h-11" id={name} type="password" {...form.register(name)} />{form.formState.errors[name] && <p className="text-sm text-destructive">{form.formState.errors[name]?.message}</p>}</div>)}
          {mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}
          <Button className="min-h-11 w-full" disabled={!token || mutation.isPending} size="lg" type="submit">{mutation.isPending && <LoaderCircle className="animate-spin" />}Set new password</Button>
        </form>
      </CardContent>
    </ResetFrame>
  );
}
