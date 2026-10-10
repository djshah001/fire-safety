import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate, useOutletContext } from "react-router-dom";
import { z } from "zod";
import type { CurrentUser } from "@/api/auth";
import { changePassword } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  password: z.string().min(12, "Use at least 12 characters.").regex(/[a-z]/, "Add a lowercase letter.").regex(/[A-Z]/, "Add an uppercase letter.").regex(/\d/, "Add a number."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });
type Fields = z.infer<typeof schema>;

export function AccountPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", password: "", confirmPassword: "" } });
  const mutation = useMutation({
    mutationFn: ({ currentPassword, password }: Fields) => changePassword({ currentPassword, password }),
    onSuccess() { queryClient.clear(); navigate("/login", { replace: true, state: { passwordChanged: true } }); },
  });

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <p className="text-sm font-semibold text-primary">My account</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Password and session</h1>
      <Card className="mt-6"><CardHeader><CardTitle>{user.name}</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader></Card>
      <Card className="mt-6">
        <CardHeader><CardTitle>Change password</CardTitle><CardDescription>Changing your password revokes every active session, including this one.</CardDescription></CardHeader>
        <CardContent>
          {user.mustChangePassword && <Alert className="mb-5"><AlertTitle>Temporary password</AlertTitle><AlertDescription>Change it before using the rest of the application.</AlertDescription></Alert>}
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            {([['currentPassword', 'Current password', 'current-password'], ['password', 'New password', 'new-password'], ['confirmPassword', 'Confirm new password', 'new-password']] as const).map(([name, label, autoComplete]) => (
              <div className="space-y-2" key={name}>
                <Label htmlFor={name}>{label}</Label>
                <Input aria-invalid={Boolean(form.formState.errors[name])} autoComplete={autoComplete} className="min-h-11" id={name} type="password" {...form.register(name)} />
                {form.formState.errors[name] && <p className="text-sm text-destructive">{form.formState.errors[name]?.message}</p>}
              </div>
            ))}
            {mutation.isError && <Alert variant="destructive"><AlertDescription>{getApiErrorMessage(mutation.error)}</AlertDescription></Alert>}
            <Button className="min-h-11" disabled={mutation.isPending} size="lg" type="submit">{mutation.isPending && <LoaderCircle className="animate-spin" />}Change password</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
