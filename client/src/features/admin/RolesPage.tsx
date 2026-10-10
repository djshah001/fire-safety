import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createRole,
  deactivateRole,
  permissionsQuery,
  rolesQuery,
  updateRole,
  updateRolePermissions,
  type Role,
} from "@/api/admin";
import { getApiErrorMessage } from "@/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Editor = { kind: "create" } | { kind: "edit"; role: Role };

export function RolesPage() {
  const roles = useQuery(rolesQuery(true));
  const permissions = useQuery(permissionsQuery);
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Editor>();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const permissionGroups = useMemo(() => {
    const groups = new Map<string, typeof permissions.data>();
    for (const permission of permissions.data ?? []) {
      const group = permission.code.split(".", 1)[0] ?? "other";
      groups.set(group, [...(groups.get(group) ?? []), permission]);
    }
    return [...groups.entries()];
  }, [permissions.data]);

  function closeEditor() {
    setEditor(undefined);
    setCode("");
    setName("");
    setDescription("");
    setPermissionCodes([]);
    setReason("");
  }
  function openCreate() {
    closeEditor();
    setEditor({ kind: "create" });
  }
  function openEdit(role: Role) {
    setEditor({ kind: "edit", role });
    setCode(role.code);
    setName(role.name);
    setDescription(role.description ?? "");
    setPermissionCodes(role.permissionCodes);
    setReason("");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("No role is selected.");
      if (editor.kind === "create")
        return createRole({
          code,
          name,
          description: description || undefined,
          permissionCodes,
        });
      if (editor.role.isSystem)
        return updateRolePermissions({
          role: editor.role,
          permissionCodes,
          reason,
        });
      return updateRole({
        role: editor.role,
        name,
        description: description || undefined,
        permissionCodes,
        reason,
      });
    },
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "roles"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "employees"] }),
      ]);
      closeEditor();
    },
  });
  const deactivation = useMutation({
    mutationFn: () => {
      if (!editor || editor.kind !== "edit")
        throw new Error("No role is selected.");
      return deactivateRole({ role: editor.role, reason });
    },
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
      closeEditor();
    },
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Administration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Roles &amp; permissions
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Roles bundle application-defined permissions. Arbitrary permission
            codes remain unavailable because permissions must have backend
            enforcement.
          </p>
        </div>
        <Button className="min-h-11" onClick={openCreate} size="lg">
          <Plus />
          Create role
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Company roles</CardTitle>
          <CardDescription>
            System roles can have permission assignments changed, but cannot be
            renamed or deactivated.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {roles.isPending ? (
            <div className="space-y-3 px-5">
              {[1, 2, 3].map((item) => (
                <Skeleton className="h-16 w-full" key={item} />
              ))}
            </div>
          ) : roles.isError ? (
            <Alert className="mx-5" variant="destructive">
              <AlertDescription>
                {getApiErrorMessage(roles.error)}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="divide-y divide-border">
              {roles.data.map((role) => (
                <article
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  key={role.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{role.name}</p>
                      {role.isSystem && (
                        <Badge variant="secondary">System</Badge>
                      )}
                      {!role.isActive && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {role.code} · {role.permissionCodes.length} permission
                      {role.permissionCodes.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {role.description || "No description"}
                    </p>
                  </div>
                  {role.isActive && (
                    <Button
                      className="min-h-10"
                      onClick={() => openEdit(role)}
                      variant="outline"
                    >
                      <ShieldCheck />
                      Configure
                    </Button>
                  )}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        open={Boolean(editor)}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          {editor && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editor.kind === "create"
                    ? "Create role"
                    : `Configure ${editor.role.name}`}
                </DialogTitle>
                <DialogDescription>
                  Choose the role details and only the permissions this job
                  requires.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role-code">Code</Label>
                  <Input
                    className="min-h-11"
                    disabled={editor.kind === "edit"}
                    id="role-code"
                    maxLength={64}
                    onChange={(event) =>
                      setCode(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, ""),
                      )
                    }
                    pattern="[a-z][a-z0-9_]*"
                    required
                    value={code}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role-name">Name</Label>
                  <Input
                    className="min-h-11"
                    disabled={editor.kind === "edit" && editor.role.isSystem}
                    id="role-name"
                    maxLength={100}
                    minLength={2}
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="role-description">Description</Label>
                  <Textarea
                    disabled={editor.kind === "edit" && editor.role.isSystem}
                    id="role-description"
                    maxLength={500}
                    onChange={(event) => setDescription(event.target.value)}
                    value={description}
                  />
                </div>
              </div>
              <fieldset className="mt-6">
                <legend className="font-semibold">Permissions</legend>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permissions control actions. Record visibility still requires
                  membership or a separate scoped grant.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {permissionGroups.map(([group, items]) => (
                    <Card key={group} size="sm">
                      <CardHeader>
                        <CardTitle className="uppercase tracking-wider text-muted-foreground">
                          {group}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {items?.map((permission) => (
                          <Label
                            className="flex cursor-pointer items-start gap-3"
                            key={permission.code}
                          >
                            <Checkbox
                              checked={permissionCodes.includes(
                                permission.code,
                              )}
                              className="mt-0.5"
                              onCheckedChange={(checked) =>
                                setPermissionCodes((current) =>
                                  checked
                                    ? [...current, permission.code]
                                    : current.filter(
                                        (value) => value !== permission.code,
                                      ),
                                )
                              }
                            />
                            <span>
                              <span className="block font-medium">
                                {permission.code}
                              </span>
                              <span className="block text-xs leading-5 text-muted-foreground">
                                {permission.description}
                              </span>
                            </span>
                          </Label>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </fieldset>
              {editor.kind === "edit" && (
                <div className="mt-5 space-y-2">
                  <Label htmlFor="role-reason">Reason for change</Label>
                  <Textarea
                    id="role-reason"
                    maxLength={500}
                    minLength={3}
                    onChange={(event) => setReason(event.target.value)}
                    required
                    value={reason}
                  />
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Permission changes revoke sessions for employees currently
                holding this role.
              </p>
              {(save.isError || deactivation.isError) && (
                <Alert className="mt-4" variant="destructive">
                  <AlertDescription>
                    {getApiErrorMessage(save.error ?? deactivation.error)}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter className="mt-6 justify-between sm:justify-between">
                <div>
                  {editor.kind === "edit" && !editor.role.isSystem && (
                    <Button
                      disabled={
                        deactivation.isPending || reason.trim().length < 3
                      }
                      onClick={() => deactivation.mutate()}
                      type="button"
                      variant="destructive"
                    >
                      Deactivate role
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={closeEditor} type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button
                    disabled={
                      save.isPending ||
                      (editor.kind === "edit" && reason.trim().length < 3)
                    }
                    type="submit"
                  >
                    {save.isPending && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    Save role
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
