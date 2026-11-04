import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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
  FileCheck2,
  ShoppingCart,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import type { CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { CurrentUser } from "@/api/auth";
import { logout } from "@/api/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { MainShellArea } from "./MainShellArea";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible: boolean;
  badge?: string | number;
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
  "/procurement/purchase-orders": "Purchase orders (PO)",
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
  const isBoqWorkspace = /^\/engineering\/design-jobs\/[^/]+\/boq$/.test(
    pathname,
  );
  const isQuotationWorkspace =
    /^\/engineering\/design-jobs\/[^/]+\/quotations$/.test(pathname);
  if (to === "/engineering/boqs") return pathname === to || isBoqWorkspace;
  if (to === "/engineering/quotations")
    return pathname === to || isQuotationWorkspace;
  if (
    to === "/engineering/design-jobs" &&
    (isBoqWorkspace || isQuotationWorkspace)
  )
    return false;
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
            className={cn(
              "relative flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
              active
                ? "font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="active-nested-pill"
                className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/20 dark:bg-primary/15"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2 truncate">
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            {item.badge && (
              <span className="relative z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[9px] font-semibold text-primary">
                {item.badge}
              </span>
            )}
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
          className={cn(
            "relative flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
            active
              ? "font-semibold text-primary"
              : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/70",
          )}
        >
          {active && (
            <motion.span
              layoutId="active-nav-pill"
              className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20 dark:bg-primary/15"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-3 truncate">
            <Icon className="size-4 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">
              {item.label}
            </span>
          </span>
          {item.badge && (
            <span className="relative z-10 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden px-1">
              {item.badge}
            </span>
          )}
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
  isSearching = false,
}: {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  openByDefault?: boolean;
  isSearching?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isMobile } = useSidebar();
  const visibleItems = items.filter((item) => item.visible);
  const active = visibleItems.some((item) =>
    isPathActive(location.pathname, item.to),
  );

  const [isOpen, setIsOpen] = React.useState(openByDefault || active);

  // If user is searching or navigating to this group, auto expand
  React.useEffect(() => {
    if (isSearching && visibleItems.length > 0) {
      setIsOpen(true);
    } else if (active) {
      setIsOpen(true);
    }
  }, [isSearching, visibleItems.length, active]);

  if (visibleItems.length === 0) return null;

  // Collapsed desktop state: Floating flyout menu
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
              {active && (
                <span className="absolute bottom-1 size-1.5 rounded-full bg-primary" />
              )}
              <span className="sr-only">{label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={12}
            className="min-w-52 rounded-xl p-1.5 shadow-xl"
          >
            <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="size-3.5 text-primary" />
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
                    className={cn(
                      "cursor-pointer gap-2 rounded-lg text-xs",
                      isItemActive &&
                        "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <ItemIcon className="size-3.5" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[9px] font-semibold text-primary">
                        {item.badge}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  // Expanded View with Framer Motion animated collapsible drawer
  return (
    <SidebarMenuItem className="select-none">
      <SidebarMenuButton
        isActive={active}
        onClick={() => setIsOpen((prev) => !prev)}
        tooltip={label}
        className="justify-between rounded-xl px-2.5 py-2 transition-colors hover:bg-sidebar-accent/80"
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon
            className={cn(
              "size-4 shrink-0",
              active ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate font-medium">{label}</span>
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="group-data-[collapsible=icon]:hidden shrink-0"
        >
          <ChevronRight className="size-3.5 text-muted-foreground/70" />
        </motion.div>
      </SidebarMenuButton>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden group-data-[collapsible=icon]:hidden"
          >
            <SidebarMenuSub className="my-1 border-l border-sidebar-border/60 pl-2">
              {visibleItems.map((item) => (
                <NavigationLink key={item.to} item={item} nested />
              ))}
            </SidebarMenuSub>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarMenuItem>
  );
}

export function AppShell({ user }: { user: CurrentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = React.useState("");

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled() {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  // Global Keyboard Shortcut: Cmd+K / Ctrl+K to jump to search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      visible: [
        "engineering.design.write",
        "engineering.design.review",
        "engineering.design.customer_decision",
        "engineering.estimate.read",
        "project.start",
      ].some((permission) => user.permissions.includes(permission)),
    },
    {
      to: "/engineering/boqs",
      label: "BOQ & estimates",
      icon: ClipboardList,
      visible: [
        "engineering.design.write",
        "engineering.design.review",
        "engineering.design.customer_decision",
        "engineering.estimate.read",
      ].some((permission) => user.permissions.includes(permission)),
    },
    {
      to: "/engineering/quotations",
      label: "Quotations",
      icon: FileText,
      visible: user.permissions.includes("engineering.quotation.read"),
    },
  ];

  const masters: NavItem[] = [
    {
      to: "/masters/vendors",
      label: "Vendors",
      icon: Truck,
      visible: user.permissions.includes("procurement.vendor.read"),
    },
    {
      to: "/masters/items",
      label: "Items",
      icon: Boxes,
      visible: user.permissions.includes("procurement.item.read"),
    },
    {
      to: "/masters/item-families",
      label: "Item families",
      icon: Boxes,
      visible: user.permissions.includes("procurement.item.read"),
    },
    {
      to: "/masters/brands",
      label: "Brands & makes",
      icon: Factory,
      visible: user.permissions.includes("procurement.item.read"),
    },
    {
      to: "/masters/item-categories",
      label: "Item categories",
      icon: Tags,
      visible: user.permissions.includes("procurement.item.read"),
    },
    {
      to: "/masters/units",
      label: "Units",
      icon: Ruler,
      visible: user.permissions.includes("procurement.item.read"),
    },
    {
      to: "/masters/boq-templates",
      label: "BOQ templates",
      icon: ClipboardList,
      visible: user.permissions.includes("engineering.boq.template.manage"),
    },
  ];

  const procurement: NavItem[] = [
    {
      to: "/procurement/requisitions",
      label: "Requisitions & sourcing",
      icon: ClipboardList,
      visible: user.permissions.includes("procurement.sourcing.read"),
    },
    {
      to: "/procurement/purchase-orders",
      label: "Purchase orders (PO)",
      icon: FileCheck2,
      visible: user.permissions.includes("procurement.purchase_order.read"),
    },
  ];

  const overview: NavItem = {
    to: "/",
    label: "Overview",
    icon: LayoutDashboard,
    visible: true,
  };
  const notifications: NavItem = {
    to: "/notifications",
    label: "Notifications",
    icon: Bell,
    visible: true,
  };
  const projects: NavItem = {
    to: "/projects",
    label: "Projects",
    icon: FolderKanban,
    visible: user.permissions.includes("project.read"),
  };

  // Filter Items based on live search query
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  const matchesSearch = (item: NavItem) =>
    !isSearching || item.label.toLowerCase().includes(query);

  const filteredOverview = matchesSearch(overview) ? overview : null;
  const filteredNotifications = matchesSearch(notifications)
    ? notifications
    : null;
  const filteredProjects = matchesSearch(projects) ? projects : null;

  const filterGroupItems = (items: NavItem[]) =>
    items.filter((item) => item.visible && matchesSearch(item));

  const filteredCrm = filterGroupItems(crm);
  const filteredMasters = filterGroupItems(masters);
  const filteredEngineering = filterGroupItems(engineering);
  const filteredProcurement = filterGroupItems(procurement);
  const filteredAdmin = filterGroupItems(admin);

  const totalVisibleMatches =
    (filteredOverview ? 1 : 0) +
    (filteredNotifications ? 1 : 0) +
    (filteredProjects ? 1 : 0) +
    filteredCrm.length +
    filteredMasters.length +
    filteredEngineering.length +
    filteredProcurement.length +
    filteredAdmin.length;

  const pageTitle = currentPageTitle(location.pathname);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "17.5rem",
          "--sidebar-width-icon": "4.25rem",
        } as CSSProperties
      }
    >
      <Sidebar
        collapsible="icon"
        variant="inset"
        className="border-r border-sidebar-border/70"
      >
        {/* Brand Header */}
        <SidebarHeader className="p-3 pb-2 space-y-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                asChild
                tooltip="Fire Safety Operations"
                className="h-11 rounded-xl transition-colors hover:bg-sidebar-accent/80 group-data-[collapsible=icon]:p-0"
              >
                <NavLink to="/" className="flex items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                    <Flame className="size-5" />
                  </div>
                  <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                      Fire Safety
                    </span>
                    <span className="truncate text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Operations Portal
                    </span>
                  </div>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Interactive Live Search Bar */}
          <div className="relative group-data-[collapsible=icon]:hidden">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground/70" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick search routes…"
              className="h-8.5 w-full rounded-lg border-sidebar-border/70 bg-sidebar-accent/40 pl-8 pr-12 text-xs placeholder:text-muted-foreground/50 transition-all focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            <div className="absolute right-2 top-2 flex items-center gap-1">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="flex size-4.5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              ) : (
                <kbd className="pointer-events-none select-none rounded border border-sidebar-border bg-sidebar px-1 text-[9px] font-mono text-muted-foreground">
                  ⌘K
                </kbd>
              )}
            </div>
          </div>
        </SidebarHeader>

        <SidebarSeparator className="mx-3" />

        {/* Navigation Body */}
        <SidebarContent className="px-2 py-2 overflow-y-auto">
          {isSearching && totalVisibleMatches === 0 ? (
            <div className="p-4 text-center space-y-2 group-data-[collapsible=icon]:hidden">
              <p className="text-xs text-muted-foreground">
                No matches for "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <SidebarGroup className="p-0 space-y-1">
              <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-wider uppercase text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                {isSearching
                  ? `Matching Results (${totalVisibleMatches})`
                  : "Navigation"}
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredOverview && (
                    <NavigationLink item={filteredOverview} />
                  )}
                  {filteredNotifications && (
                    <NavigationLink item={filteredNotifications} />
                  )}
                  {filteredProjects && (
                    <NavigationLink item={filteredProjects} />
                  )}

                  {filteredCrm.length > 0 && (
                    <NavigationGroup
                      label="CRM & Sales"
                      icon={BriefcaseBusiness}
                      items={filteredCrm}
                      openByDefault
                      isSearching={isSearching}
                    />
                  )}

                  {filteredEngineering.length > 0 && (
                    <NavigationGroup
                      label="Engineering"
                      icon={DraftingCompass}
                      items={filteredEngineering}
                      openByDefault
                      isSearching={isSearching}
                    />
                  )}

                  {filteredProcurement.length > 0 && (
                    <NavigationGroup
                      label="Procurement"
                      icon={ShoppingCart}
                      items={filteredProcurement}
                      openByDefault
                      isSearching={isSearching}
                    />
                  )}

                  {filteredMasters.length > 0 && (
                    <NavigationGroup
                      label="Masters Catalogue"
                      icon={Boxes}
                      items={filteredMasters}
                      isSearching={isSearching}
                    />
                  )}

                  {filteredAdmin.length > 0 && (
                    <NavigationGroup
                      label="Administration"
                      icon={ShieldCheck}
                      items={filteredAdmin}
                      isSearching={isSearching}
                    />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
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
                    <Avatar className="size-8 rounded-lg border border-primary/20">
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
      <MainShellArea user={user} />
    </SidebarProvider>
  );
}
