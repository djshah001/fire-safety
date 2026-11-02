import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Flame,
  LayoutDashboard,
  ListTodo,
  LogOut,
  ShieldCheck,
  Boxes,
  Ruler,
  Tags,
  Target,
  Truck,
  UserRound,
  Users,
  DraftingCompass,
  ClipboardPenLine,
  ClipboardList,
  FileText,
  Bell,
  FolderKanban,
  Factory,
  ShoppingCart,
} from "lucide-react";
import type { CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { CurrentUser } from "@/api/auth";
import { logout } from "@/api/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible: boolean;
};

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/account": "My account",
  "/notifications": "Notifications",
  "/projects": "Projects",
  "/admin/employees": "Employees",
  "/admin/roles": "Roles & permissions",
  "/crm/customers": "Customers",
  "/crm/follow-ups": "My follow-ups",
  "/crm/leads": "Leads",
  "/crm/opportunities": "Opportunities",
  "/engineering/design-jobs": "Design jobs",
  "/engineering/boqs": "BOQ & estimates",
  "/engineering/quotations": "Quotations",
  "/masters/boq-templates": "BOQ templates",
  "/masters/vendors": "Vendors",
  "/masters/items": "Items",
  "/masters/item-families": "Item families",
  "/masters/brands": "Brands & makes",
  "/masters/item-categories": "Item categories",
  "/masters/units": "Units",
  "/procurement/requisitions": "Requisitions & sourcing",
  "/procurement/substitution-reviews": "Technical substitution reviews",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function isPathActive(pathname: string, to: string) {
  const isBoqWorkspace = /^\/engineering\/design-jobs\/[^/]+\/boq$/.test(pathname);
  const isQuotationWorkspace = /^\/engineering\/design-jobs\/[^/]+\/quotations$/.test(pathname);
  if (to === "/engineering/boqs") return pathname === to || isBoqWorkspace;
  if (to === "/engineering/quotations") return pathname === to || isQuotationWorkspace;
  if (to === "/engineering/design-jobs" && (isBoqWorkspace || isQuotationWorkspace)) return false;
  return to === "/"
    ? pathname === "/"
    : pathname === to || pathname.startsWith(`${to}/`);
}

function currentPageTitle(pathname: string) {
  if (/^\/engineering\/design-jobs\/[^/]+\/boq$/.test(pathname)) {
    return "BOQ & estimate";
  }
  if (/^\/engineering\/design-jobs\/[^/]+\/quotations$/.test(pathname)) {
    return "Quotation workspace";
  }

  const match = Object.entries(pageTitles)
    .filter(([path]) => isPathActive(pathname, path))
    .sort(([left], [right]) => right.length - left.length)[0];

  return match?.[1] ?? "Fire Safety";
}

function NavigationLink({
  item,
  nested = false,
}: {
  item: NavItem;
  nested?: boolean;
}) {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const active = isPathActive(location.pathname, item.to);
  const Icon = item.icon;

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  if (nested) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={active}>
          <NavLink
            to={item.to}
            onClick={closeMobileSidebar}
            className="flex items-center gap-2.5"
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <NavLink
          to={item.to}
          onClick={closeMobileSidebar}
          className="flex w-full items-center gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
        >
          <Icon className="size-4.5 shrink-0" />
          <span className="truncate font-medium group-data-[collapsible=icon]:hidden">
            {item.label}
          </span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavigationGroup({
  label,
  icon: Icon,
  items,
  openByDefault = false,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  openByDefault?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile } = useSidebar();
  const visibleItems = items.filter((item) => item.visible);
  const active = visibleItems.some((item) =>
    isPathActive(location.pathname, item.to),
  );

  if (visibleItems.length === 0) return null;

  // When sidebar is collapsed on desktop, render as a sleek flyout DropdownMenu
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              isActive={active}
              tooltip={label}
              className="justify-center"
            >
              <Icon className="size-4.5 shrink-0" />
              <span className="sr-only">{label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={12}
            className="min-w-48 shadow-lg"
          >
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {visibleItems.map((item) => {
                const ItemIcon = item.icon;
                const isItemActive = isPathActive(location.pathname, item.to);
                return (
                  <DropdownMenuItem
                    key={item.to}
                    onClick={() => navigate(item.to)}
                    className={
                      isItemActive
                        ? "bg-primary/10 font-medium text-primary"
                        : ""
                    }
                  >
                    <ItemIcon className="mr-2 size-4" />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  // Expanded View with Smooth Collapsible
  return (
    <Collapsible
      asChild
      defaultOpen={openByDefault || active}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={label}>
            <Icon className="size-4.5 shrink-0" />
            <span className="font-medium group-data-[collapsible=icon]:hidden">
              {label}
            </span>
            <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="my-1">
            {visibleItems.map((item) => (
              <NavigationLink key={item.to} item={item} nested />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppShell({ user }: { user: CurrentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled() {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  const crm: NavItem[] = [
    {
      to: "/crm/leads",
      label: "Leads",
      icon: Target,
      visible: user.permissions.includes("crm.lead.read"),
    },
    {
      to: "/crm/follow-ups",
      label: "My follow-ups",
      icon: ListTodo,
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
  ];

  const admin: NavItem[] = [
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
  ];

  const engineering: NavItem[] = [
    {
      to: "/engineering/design-jobs",
      label: "Design jobs",
      icon: ClipboardPenLine,
      visible: ["engineering.design.write", "engineering.design.review", "engineering.design.customer_decision", "engineering.estimate.read", "project.start"]
        .some((permission) => user.permissions.includes(permission)),
    },
    {
      to: "/engineering/boqs",
      label: "BOQ & estimates",
      icon: ClipboardList,
      visible: ["engineering.design.write", "engineering.design.review", "engineering.design.customer_decision", "engineering.estimate.read"]
        .some((permission) => user.permissions.includes(permission)),
    },
    {
      to: "/engineering/quotations",
      label: "Quotations",
      icon: FileText,
      visible: user.permissions.includes("engineering.quotation.read"),
    },
  ];

  const masters: NavItem[] = [
    { to: "/masters/vendors", label: "Vendors", icon: Truck, visible: user.permissions.includes("procurement.vendor.read") },
    { to: "/masters/items", label: "Items", icon: Boxes, visible: user.permissions.includes("procurement.item.read") },
    { to: "/masters/item-families", label: "Item families", icon: Boxes, visible: user.permissions.includes("procurement.item.read") },
    { to: "/masters/brands", label: "Brands & makes", icon: Factory, visible: user.permissions.includes("procurement.item.read") },
    { to: "/masters/item-categories", label: "Item categories", icon: Tags, visible: user.permissions.includes("procurement.item.read") },
    { to: "/masters/units", label: "Units", icon: Ruler, visible: user.permissions.includes("procurement.item.read") },
    { to: "/masters/boq-templates", label: "BOQ templates", icon: ClipboardList, visible: user.permissions.includes("engineering.boq.template.manage") },
  ];

  const procurement: NavItem[] = [
    { to: "/procurement/requisitions", label: "Requisitions & sourcing", icon: ClipboardList, visible: user.permissions.includes("procurement.sourcing.read") },
    { to: "/procurement/substitution-reviews", label: "Technical reviews", icon: ShieldCheck, visible: user.permissions.includes("procurement.substitution.review") },
  ];

  const overview: NavItem = {
    to: "/",
    label: "Overview",
    icon: LayoutDashboard,
    visible: true,
  };
  const notifications: NavItem = { to: "/notifications", label: "Notifications", icon: Bell, visible: true };
  const projects: NavItem = { to: "/projects", label: "Projects", icon: FolderKanban, visible: user.permissions.includes("project.read") };

  const pageTitle = currentPageTitle(location.pathname);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "17rem",
          "--sidebar-width-icon": "4rem",
        } as CSSProperties
      }
    >
      <Sidebar collapsible="icon" variant="inset">
        {/* Header / Brand */}
        <SidebarHeader className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                asChild
                tooltip="Fire Safety"
                className="h-11 rounded-xl transition-colors hover:bg-sidebar-accent/80 group-data-[collapsible=icon]:p-0"
              >
                <NavLink to="/" className="flex items-center gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                    <Flame className="size-4.5" />
                  </div>
                  <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                      Fire Safety
                    </span>
                    <span className="truncate text-[11px] font-medium text-muted-foreground">
                      Operations ERP
                    </span>
                  </div>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarSeparator className="mx-3" />

        {/* Navigation Content */}
        <SidebarContent>
          <SidebarGroup className="px-2 pt-2">
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-wider uppercase text-sidebar-foreground/50">
              Navigation
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavigationLink item={overview} />
                <NavigationLink item={notifications} />
                <NavigationLink item={projects} />
                <NavigationGroup
                  label="CRM"
                  icon={BriefcaseBusiness}
                  items={crm}
                  openByDefault
                />
                <NavigationGroup
                  label="Masters"
                  icon={Boxes}
                  items={masters}
                />
                <NavigationGroup
                  label="Engineering"
                  icon={DraftingCompass}
                  items={engineering}
                  openByDefault
                />
                <NavigationGroup
                  label="Procurement"
                  icon={ShoppingCart}
                  items={procurement}
                  openByDefault
                />
                <NavigationGroup
                  label="Administration"
                  icon={ShieldCheck}
                  items={admin}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator className="mx-3" />

        {/* User Footer Profile */}
        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={user.name}
                    className="h-12 rounded-xl transition-colors hover:bg-sidebar-accent/80 data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-0"
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {initials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate text-xs font-semibold text-sidebar-foreground">
                        {user.name}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                    <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground/70 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="end"
                  sideOffset={12}
                  className="w-60 rounded-xl p-1.5 shadow-xl"
                >
                  <DropdownMenuLabel className="p-2 font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-xs font-semibold leading-none">
                        {user.name}
                      </p>
                      <p className="text-[11px] leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => navigate("/account")}
                    className="cursor-pointer gap-2 rounded-lg text-xs"
                  >
                    <UserRound className="size-4" />
                    <span>My account</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={logoutMutation.isPending}
                    variant="destructive"
                    onClick={() => logoutMutation.mutate()}
                    className="cursor-pointer gap-2 rounded-lg text-xs"
                  >
                    <LogOut className="size-4" />
                    <span>
                      {logoutMutation.isPending ? "Signing out…" : "Sign out"}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <div className="h-4 w-px bg-border/70" />
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs"
            >
              <span className="hidden font-medium text-muted-foreground sm:inline">
                Fire Safety
              </span>
              <span className="hidden text-muted-foreground/50 sm:inline">
                /
              </span>
              <span className="font-semibold text-foreground">{pageTitle}</span>
            </nav>
          </div>
          <div className="flex items-center gap-1"><NotificationBell /><ThemeToggle /></div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet context={{ user }} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
