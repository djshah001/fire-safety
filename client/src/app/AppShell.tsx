import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building2,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { CurrentUser } from "@/api/auth";
import { logout } from "@/api/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AppShell({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled() {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
  const links = [
    { to: "/", label: "Overview", icon: LayoutDashboard, visible: true },
    {
      to: "/crm/leads",
      label: "Leads",
      icon: Target,
      visible: user.permissions.includes("crm.lead.read"),
    },
    {
      to: "/crm/customers",
      label: "Customers",
      icon: Building2,
      visible: user.permissions.includes("crm.customer.read"),
    },
    {
      to: "/crm/opportunities",
      label: "Opportunities",
      icon: BriefcaseBusiness,
      visible: user.permissions.includes("crm.opportunity.read"),
    },
    {
      to: "/admin/employees",
      label: "Employees",
      icon: Users,
      visible: user.permissions.includes("identity.users.read"),
    },
    {
      to: "/admin/roles",
      label: "Roles & permissions",
      icon: ShieldCheck,
      visible: user.permissions.includes("identity.roles.manage"),
    },
    { to: "/account", label: "My account", icon: UserRound, visible: true },
  ].filter((link) => link.visible);

  const navigation = (
    <>
      <nav aria-label="Primary navigation" className="flex-1 space-y-1 p-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`
            }
            end={to === "/"}
            key={to}
            onClick={() => setOpen(false)}
            to={to}
          >
            <Icon aria-hidden="true" size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4">
        <Separator className="mb-4 bg-sidebar-border" />
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <Button
          className="mt-3 min-h-11 w-full justify-start"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
          type="button"
          variant="ghost"
        >
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[17rem_1fr]">
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="w-68 gap-0 bg-sidebar p-0 text-sidebar-foreground sm:max-w-68 lg:hidden"
          side="left"
        >
          <SheetHeader className="min-h-18 justify-center border-b border-sidebar-border px-5 text-left">
            <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
              <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <Flame size={20} />
              </span>
              Fire Safety
            </SheetTitle>
          </SheetHeader>
          {navigation}
        </SheetContent>
      </Sheet>

      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex min-h-18 items-center border-b border-sidebar-border px-5 font-semibold">
          <span className="mr-3 grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Flame size={20} />
          </span>
          Fire Safety
        </div>
        {navigation}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-18 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
          <Button
            aria-label="Open navigation"
            className="size-11 lg:hidden"
            onClick={() => setOpen(true)}
            size="icon-lg"
            type="button"
            variant="outline"
          >
            <Menu size={20} />
          </Button>
          <p className="hidden text-sm text-muted-foreground lg:block">
            Internal operations platform
          </p>
          <ThemeToggle />
        </header>
        <Outlet context={{ user }} />
      </div>
    </div>
  );
}
