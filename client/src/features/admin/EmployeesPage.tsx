import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useOutletContext } from "react-router-dom";
import { z } from "zod";

import {
  changeEmployeeAccess,
  createEmployee,
  employeesQuery,
  resetEmployeePassword,
  replaceEmployeeRoles,
  rolesQuery,
  type Employee,
} from "@/api/admin";
import type { CurrentUser } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/\d/, "Add a number.");

const schema = z.object({
  employeeCode: z.string().trim().max(40),
  name: z.string().trim().min(2, "Enter the employee name.").max(120),
  email: z.string().trim().email("Enter a valid email address."),
  temporaryPassword: passwordSchema,
  roleId: z.string().min(1, "Choose a role."),
});

type Fields = z.infer<typeof schema>;
type StatusFilter = "all" | "active" | "disabled";
type EmployeeAction = {
  employee: Employee;
  kind: "disable" | "enable" | "reset-password";
};

const defaultValues: Fields = {
  employeeCode: "",
  name: "",
  email: "",
  temporaryPassword: "",
  roleId: "",
};

const createFields = [
  {
    name: "name",
    label: "Full name",
    type: "text",
    autoComplete: "name",
    placeholder: "Enter full name",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    autoComplete: "off",
    placeholder: "employee@company.com",
  },
  {
    name: "employeeCode",
    label: "Employee code",
    type: "text",
    autoComplete: "off",
    placeholder: "e.g. EMP-001",
  },
  {
    name: "temporaryPassword",
    label: "Temporary password",
    type: "password",
    autoComplete: "new-password",
    placeholder: "Enter a temporary password",
  },
] as const;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function validReason(reason: string) {
  const length = reason.trim().length;
  return length >= 3 && length <= 500;
}

function ErrorMessage({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
    </Alert>
  );
}

function PendingIcon({ pending }: { pending: boolean }) {
  return pending ? (
    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
  ) : null;
}

export function EmployeesPage() {
  const { user } = useOutletContext<{ user: CurrentUser }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Preserve the permission requirement from the original page.
  const canManage =
    user.permissions.includes("identity.users.manage") &&
    user.permissions.includes("identity.roles.manage");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState("");

  const [action, setAction] = useState<EmployeeAction>();
  const [actionReason, setActionReason] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const [roleEmployee, setRoleEmployee] = useState<Employee>();
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roleReason, setRoleReason] = useState("");

  const employees = useQuery(employeesQuery);
  const roles = useQuery({ ...rolesQuery(), enabled: canManage });

  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  async function refreshEmployees() {
    await queryClient.invalidateQueries({
      queryKey: employeesQuery.queryKey,
    });
  }

  const creation = useMutation({
    mutationFn: (input: Fields) => {
      if (!canManage) throw new Error("You cannot manage employees.");

      return createEmployee({
        employeeCode: input.employeeCode || undefined,
        name: input.name,
        email: input.email,
        temporaryPassword: input.temporaryPassword,
        roleIds: [input.roleId],
      });
    },
    async onSuccess() {
      await refreshEmployees();
      form.reset(defaultValues);
      setShowCreate(false);
      setNotice("Employee account created successfully.");
    },
  });

  const employeeAction = useMutation({
    mutationFn: async (input: {
      action: EmployeeAction;
      reason: string;
      password: string;
    }) => {
      if (!canManage) throw new Error("You cannot manage employees.");
      if (input.action.employee.id === user.id) {
        throw new Error(
          "Use your account settings to change your own account.",
        );
      }
      if (!validReason(input.reason)) {
        throw new Error("Enter a reason between 3 and 500 characters.");
      }

      if (input.action.kind === "reset-password") {
        return resetEmployeePassword({
          employee: input.action.employee,
          temporaryPassword: passwordSchema.parse(input.password),
          reason: input.reason.trim(),
        });
      }

      return changeEmployeeAccess({
        employee: input.action.employee,
        action: input.action.kind,
        reason: input.reason.trim(),
      });
    },
    async onSuccess(_, input) {
      await refreshEmployees();
      setAction(undefined);
      setActionReason("");
      setTemporaryPassword("");
      setNotice(
        input.action.kind === "reset-password"
          ? "Temporary password reset successfully."
          : `Employee access ${
              input.action.kind === "disable" ? "disabled" : "enabled"
            } successfully.`,
      );
    },
  });

  const roleAssignment = useMutation({
    mutationFn: (input: {
      employee: Employee;
      roleIds: string[];
      reason: string;
    }) => {
      if (!canManage) throw new Error("You cannot manage roles.");
      if (!input.roleIds.length) throw new Error("Select at least one role.");
      if (!validReason(input.reason)) {
        throw new Error("Enter a reason between 3 and 500 characters.");
      }
      if (
        input.employee.id === user.id &&
        input.employee.roles.some((role) => !input.roleIds.includes(role.id))
      ) {
        throw new Error(
          "Another administrator must remove your existing roles.",
        );
      }

      return replaceEmployeeRoles({
        employee: input.employee,
        roleIds: input.roleIds,
        reason: input.reason.trim(),
      });
    },
    async onSuccess(_, input) {
      const changedOwnRoles = input.employee.id === user.id;
      await refreshEmployees();
      setRoleEmployee(undefined);
      setSelectedRoleIds([]);
      setRoleReason("");

      if (changedOwnRoles) {
        queryClient.clear();
        navigate("/login", { replace: true });
        return;
      }

      setNotice("Employee roles updated successfully.");
    },
  });

  function openCreate() {
    creation.reset();
    form.reset(defaultValues);
    setNotice("");
    setShowCreate(true);
  }

  function closeCreate() {
    if (creation.isPending) return;
    setShowCreate(false);
    form.reset(defaultValues);
    creation.reset();
  }

  function openAction(employee: Employee, kind: EmployeeAction["kind"]) {
    employeeAction.reset();
    setNotice("");
    setAction({ employee, kind });
    setActionReason("");
    setTemporaryPassword("");
  }

  function closeAction() {
    if (employeeAction.isPending) return;
    setAction(undefined);
    setActionReason("");
    setTemporaryPassword("");
    employeeAction.reset();
  }

  function openRoles(employee: Employee) {
    roleAssignment.reset();
    setNotice("");
    setRoleEmployee(employee);
    setSelectedRoleIds(employee.roles.map((role) => role.id));
    setRoleReason("");
  }

  function closeRoles() {
    if (roleAssignment.isPending) return;
    setRoleEmployee(undefined);
    setSelectedRoleIds([]);
    setRoleReason("");
    roleAssignment.reset();
  }

  const items = employees.data?.items ?? [];
  const activeCount = items.filter(
    (employee) => employee.status === "active",
  ).length;
  const disabledCount = items.filter(
    (employee) => employee.status === "disabled",
  ).length;
  const passwordCount = items.filter(
    (employee) => employee.mustChangePassword,
  ).length;

  const searchTerm = search.trim().toLowerCase();
  const filteredEmployees = items.filter((employee) => {
    const matchesStatus = status === "all" || employee.status === status;
    const searchableText = [
      employee.name,
      employee.email,
      employee.employeeCode ?? "",
      ...employee.roles.map((role) => role.name),
    ]
      .join(" ")
      .toLowerCase();

    return matchesStatus && searchableText.includes(searchTerm);
  });

  const passwordResult = passwordSchema.safeParse(temporaryPassword);
  const actionValid =
    validReason(actionReason) &&
    (action?.kind !== "reset-password" || passwordResult.success);

  const roleOptionsAvailable = roles.isSuccess && Boolean(roles.data.length);
  const rolesChanged =
    Boolean(roleEmployee) &&
    (selectedRoleIds.length !== roleEmployee!.roles.length ||
      roleEmployee!.roles.some((role) => !selectedRoleIds.includes(role.id)));

  const statistics = [
    {
      title: "Loaded employees",
      value: items.length,
      icon: Users,
      color: "bg-primary/10 text-primary",
    },
    {
      title: "Active accounts",
      value: activeCount,
      icon: UserRoundCheck,
      color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    {
      title: "Disabled accounts",
      value: disabledCount,
      icon: UserRoundX,
      color: "bg-destructive/10 text-destructive",
    },
    {
      title: "Password change required",
      value: passwordCount,
      icon: KeyRound,
      color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Administration
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Employees</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage employee accounts, role assignments, and access to your
            workspace.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="h-11 shrink-0">
            <Plus aria-hidden="true" className="size-4" />
            Add employee
          </Button>
        )}
      </header>

      {notice && (
        <Alert role="status" className="border-emerald-500/30 bg-emerald-500/5">
          <UserRoundCheck className="size-4" aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <section
        aria-label="Employee statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {statistics.map(({ title, value, icon: Icon, color }) => (
          <Card key={title} className="shadow-sm">
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{title}</p>
                {employees.isPending ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-3xl font-semibold tracking-tight">
                    {employees.isError ? "—" : value}
                  </p>
                )}
              </div>
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${color}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="gap-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Employee directory</CardTitle>
              <CardDescription className="mt-1.5">
                {employees.data
                  ? `${employees.data.total} total accounts · ${items.length} loaded`
                  : "Employee accounts and access details"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh employee directory"
              disabled={employees.isFetching}
              onClick={() => void employees.refetch()}
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${employees.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search loaded employees"
                placeholder="Search by name, email, code, or role..."
                className="h-10 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as StatusFilter)}
            >
              <SelectTrigger
                aria-label="Filter by account status"
                className="h-10 w-full sm:w-44"
              >
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {employees.isPending ? (
            <div className="space-y-4 p-6" aria-label="Loading employees">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : employees.isError ? (
            <div className="space-y-3 p-6">
              <ErrorMessage error={employees.error} />
              <Button
                variant="outline"
                onClick={() => void employees.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
                <Users
                  aria-hidden="true"
                  className="size-6 text-muted-foreground"
                />
              </div>
              <h2 className="font-semibold">No employees found</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {search || status !== "all"
                  ? "Try another search or clear your filters."
                  : "Create an employee account to get started."}
              </p>
              {search || status !== "all" ? (
                <Button
                  variant="outline"
                  className="mt-5"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : canManage ? (
                <Button className="mt-5" onClick={openCreate}>
                  <Plus aria-hidden="true" className="size-4" />
                  Add employee
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-64 pl-6">Employee</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-44">Account security</TableHead>
                  {canManage && (
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="py-5 pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-10 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                            {initials(employee.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{employee.name}</span>
                            {employee.id === user.id && (
                              <Badge variant="outline" className="text-[10px]">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {employee.email}
                          </p>
                          {employee.employeeCode && (
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              {employee.employeeCode}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex max-w-60 flex-wrap gap-1.5">
                        {employee.roles.length ? (
                          employee.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No roles assigned
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          employee.status === "active"
                            ? "gap-1.5 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "gap-1.5"
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${
                            employee.status === "active"
                              ? "bg-emerald-500"
                              : "bg-muted-foreground"
                          }`}
                        />
                        {employee.status === "active"
                          ? "Active"
                          : employee.status === "disabled"
                            ? "Disabled"
                            : employee.status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <p
                        className={`text-xs ${
                          employee.mustChangePassword
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {employee.mustChangePassword
                          ? "Password change required"
                          : "Password updated"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {employee.lastLoginAt
                          ? "Has signed in"
                          : "Never signed in"}
                      </p>
                    </TableCell>

                    {canManage && (
                      <TableCell className="pr-6">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Manage roles for ${employee.name}`}
                            onClick={() => openRoles(employee)}
                          >
                            <ShieldCheck
                              aria-hidden="true"
                              className="size-4"
                            />
                            Roles
                          </Button>
                          {employee.id !== user.id && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Reset password for ${employee.name}`}
                                onClick={() =>
                                  openAction(employee, "reset-password")
                                }
                              >
                                <KeyRound
                                  aria-hidden="true"
                                  className="size-4"
                                />
                                Reset
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className={
                                  employee.status === "active"
                                    ? "text-destructive hover:text-destructive"
                                    : ""
                                }
                                aria-label={`${
                                  employee.status === "active"
                                    ? "Disable"
                                    : "Enable"
                                } access for ${employee.name}`}
                                onClick={() =>
                                  openAction(
                                    employee,
                                    employee.status === "active"
                                      ? "disable"
                                      : "enable",
                                  )
                                }
                              >
                                <Power aria-hidden="true" className="size-4" />
                                {employee.status === "active"
                                  ? "Disable"
                                  : "Enable"}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {employees.isSuccess && (
          <div className="border-t px-6 py-3 text-xs text-muted-foreground">
            Showing {filteredEmployees.length} of {items.length} loaded
            employees.
            {employees.data.total > items.length &&
              " Additional accounts are not included in this view."}
          </div>
        )}
      </Card>

      {/* Create employee */}
      <Dialog
        open={showCreate && canManage}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Create an account with an initial role. The employee must change
              their temporary password after signing in.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => creation.mutate(values))}
          >
            <fieldset
              disabled={creation.isPending}
              className="grid gap-4 sm:grid-cols-2"
            >
              {createFields.map((field) => {
                const error = form.formState.errors[field.name];
                const id = `employee-${field.name}`;

                return (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={id}>
                      {field.label}
                      {field.name === "employeeCode" && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          (optional)
                        </span>
                      )}
                    </Label>
                    <Input
                      id={id}
                      className="h-11"
                      type={field.type}
                      autoComplete={field.autoComplete}
                      placeholder={field.placeholder}
                      maxLength={
                        field.name === "name"
                          ? 120
                          : field.name === "employeeCode"
                            ? 40
                            : undefined
                      }
                      aria-invalid={Boolean(error)}
                      aria-describedby={
                        error
                          ? `${id}-error`
                          : field.name === "temporaryPassword"
                            ? "create-password-help"
                            : undefined
                      }
                      {...form.register(field.name)}
                    />
                    {error && (
                      <p
                        id={`${id}-error`}
                        className="text-xs text-destructive"
                        role="alert"
                      >
                        {error.message}
                      </p>
                    )}
                  </div>
                );
              })}

              <p
                id="create-password-help"
                className="text-xs text-muted-foreground sm:col-span-2"
              >
                Passwords need at least 12 characters, uppercase and lowercase
                letters, and a number.
              </p>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="employee-role">Initial role</Label>
                <Controller
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={creation.isPending || !roleOptionsAvailable}
                    >
                      <SelectTrigger
                        id="employee-role"
                        ref={field.ref}
                        onBlur={field.onBlur}
                        className="h-11 w-full"
                        aria-invalid={Boolean(form.formState.errors.roleId)}
                        aria-describedby={
                          form.formState.errors.roleId
                            ? "employee-role-error"
                            : undefined
                        }
                      >
                        <SelectValue
                          placeholder={
                            roles.isPending
                              ? "Loading roles..."
                              : "Choose a role"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.data?.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.roleId && (
                  <p
                    id="employee-role-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {form.formState.errors.roleId.message}
                  </p>
                )}
              </div>
            </fieldset>

            {roles.isError && (
              <div className="space-y-2">
                <ErrorMessage error={roles.error} />
                <Button
                  type="button"
                  variant="outline"
                  disabled={roles.isFetching || creation.isPending}
                  onClick={() => void roles.refetch()}
                >
                  Retry loading roles
                </Button>
              </div>
            )}
            {roles.isSuccess && !roles.data.length && (
              <Alert>
                <AlertDescription>
                  No roles are available. Create a role before adding employees.
                </AlertDescription>
              </Alert>
            )}
            {creation.isError && <ErrorMessage error={creation.error} />}

            <DialogFooter className="gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={creation.isPending}
                onClick={closeCreate}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creation.isPending || !roleOptionsAvailable}
              >
                <PendingIcon pending={creation.isPending} />
                {creation.isPending ? "Creating..." : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Access and password actions */}
      <Dialog
        open={Boolean(action) && canManage}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {action && (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!actionValid || employeeAction.isPending) return;
                employeeAction.mutate({
                  action,
                  reason: actionReason,
                  password: temporaryPassword,
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {action.kind === "reset-password"
                    ? "Reset temporary password"
                    : action.kind === "disable"
                      ? "Disable employee access"
                      : "Enable employee access"}
                </DialogTitle>
                <DialogDescription>
                  Update access for {action.employee.name}. This action revokes
                  the employee’s active sessions.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <Avatar>
                  <AvatarFallback>
                    {initials(action.employee.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium">{action.employee.name}</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {action.employee.email}
                  </p>
                </div>
              </div>

              <fieldset
                disabled={employeeAction.isPending}
                className="space-y-4"
              >
                {action.kind === "reset-password" && (
                  <div className="space-y-2">
                    <Label htmlFor="temporary-password">
                      Temporary password
                    </Label>
                    <Input
                      id="temporary-password"
                      type="password"
                      autoComplete="new-password"
                      className="h-11"
                      required
                      minLength={12}
                      value={temporaryPassword}
                      onChange={(event) =>
                        setTemporaryPassword(event.target.value)
                      }
                      aria-invalid={
                        temporaryPassword.length > 0 && !passwordResult.success
                      }
                      aria-describedby="reset-password-help"
                    />
                    <p
                      id="reset-password-help"
                      className={`text-xs ${
                        temporaryPassword.length > 0 && !passwordResult.success
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {temporaryPassword.length > 0 && !passwordResult.success
                        ? passwordResult.error.issues[0]?.message
                        : "At least 12 characters with uppercase and lowercase letters and a number."}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="employee-action-reason">Reason</Label>
                  <Textarea
                    id="employee-action-reason"
                    placeholder="Explain why this change is needed..."
                    className="min-h-24 resize-none"
                    required
                    minLength={3}
                    maxLength={500}
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    aria-describedby="action-reason-help"
                  />
                  <p
                    id="action-reason-help"
                    className="text-xs text-muted-foreground"
                  >
                    Enter 3–500 characters. {actionReason.length}/500
                  </p>
                </div>
              </fieldset>

              {employeeAction.isError && (
                <ErrorMessage error={employeeAction.error} />
              )}

              <DialogFooter className="gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={employeeAction.isPending}
                  onClick={closeAction}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={
                    action.kind === "disable" ? "destructive" : "default"
                  }
                  disabled={employeeAction.isPending || !actionValid}
                >
                  <PendingIcon pending={employeeAction.isPending} />
                  {employeeAction.isPending
                    ? "Saving..."
                    : action.kind === "reset-password"
                      ? "Reset password"
                      : action.kind === "disable"
                        ? "Disable access"
                        : "Enable access"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Role assignment */}
      <Dialog
        open={Boolean(roleEmployee) && canManage}
        onOpenChange={(open) => {
          if (!open) closeRoles();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {roleEmployee && (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  roleAssignment.isPending ||
                  !selectedRoleIds.length ||
                  !validReason(roleReason) ||
                  !roleOptionsAvailable ||
                  !rolesChanged
                ) {
                  return;
                }
                roleAssignment.mutate({
                  employee: roleEmployee,
                  roleIds: [...selectedRoleIds],
                  reason: roleReason,
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>Manage roles</DialogTitle>
                <DialogDescription>
                  Assign roles to {roleEmployee.name}. Saving changes revokes
                  their active sessions.
                  {roleEmployee.id === user.id &&
                    " Updating your roles returns you to the login page."}
                </DialogDescription>
              </DialogHeader>

              <fieldset
                disabled={roleAssignment.isPending}
                className="space-y-2"
              >
                <legend className="mb-3 text-sm font-medium">
                  Available roles
                </legend>

                {roles.isPending ? (
                  [1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-16 w-full" />
                  ))
                ) : roles.isError ? (
                  <div className="space-y-2">
                    <ErrorMessage error={roles.error} />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={roles.isFetching}
                      onClick={() => void roles.refetch()}
                    >
                      Retry loading roles
                    </Button>
                  </div>
                ) : !roles.data?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No roles are available.
                  </p>
                ) : (
                  roles.data.map((role) => {
                    const checked = selectedRoleIds.includes(role.id);
                    const protectedOwnRole =
                      roleEmployee.id === user.id &&
                      roleEmployee.roles.some(
                        (current) => current.id === role.id,
                      );
                    const id = `assigned-role-${role.id}`;

                    return (
                      <div
                        key={role.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          checked ? "border-primary/40 bg-primary/5" : ""
                        }`}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          className="mt-0.5"
                          disabled={
                            protectedOwnRole || roleAssignment.isPending
                          }
                          aria-describedby={`${id}-description`}
                          onCheckedChange={(value) =>
                            setSelectedRoleIds((current) =>
                              value === true
                                ? [...new Set([...current, role.id])]
                                : current.filter((id) => id !== role.id),
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={id} className="cursor-pointer">
                            {role.name}
                          </Label>
                          <p
                            id={`${id}-description`}
                            className="mt-1 text-xs text-muted-foreground"
                          >
                            {role.description || role.code}
                            {protectedOwnRole &&
                              " · Another administrator must remove this role."}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Retain assignments absent from the available-role response. */}
                {roleEmployee.roles
                  .filter(
                    (assigned) =>
                      roles.isSuccess &&
                      !roles.data.some((role) => role.id === assigned.id),
                  )
                  .map((assigned) => (
                    <div
                      key={assigned.id}
                      className="rounded-lg border bg-muted/30 p-3"
                    >
                      <p className="text-sm font-medium">{assigned.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Existing assignment retained; this role is unavailable
                        in the role selector.
                      </p>
                    </div>
                  ))}
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="role-reason">Reason for change</Label>
                <Textarea
                  id="role-reason"
                  placeholder="Explain why these roles are needed..."
                  className="min-h-24 resize-none"
                  required
                  minLength={3}
                  maxLength={500}
                  disabled={roleAssignment.isPending}
                  value={roleReason}
                  onChange={(event) => setRoleReason(event.target.value)}
                  aria-describedby="role-reason-help"
                />
                <p
                  id="role-reason-help"
                  className="text-xs text-muted-foreground"
                >
                  Enter 3–500 characters. {roleReason.length}/500
                </p>
              </div>

              {!selectedRoleIds.length && (
                <Alert variant="destructive">
                  <AlertDescription>Select at least one role.</AlertDescription>
                </Alert>
              )}
              {roleAssignment.isError && (
                <ErrorMessage error={roleAssignment.error} />
              )}

              <DialogFooter className="gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={roleAssignment.isPending}
                  onClick={closeRoles}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    roleAssignment.isPending ||
                    !selectedRoleIds.length ||
                    !validReason(roleReason) ||
                    !roleOptionsAvailable ||
                    !rolesChanged
                  }
                >
                  <PendingIcon pending={roleAssignment.isPending} />
                  {roleAssignment.isPending ? "Saving..." : "Save roles"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
