import * as React from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Search,
  Command,
  Flame,
  Layers,
  FileText,
  Boxes,
  ShoppingCart,
  Users,
  Target,
  Plus,
  Home,
  CheckCircle2,
  FolderKanban,
  Wifi,
  Sparkles,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* =========================================================================
   BREADCRUMB HELPER
   ========================================================================= */

const routeLabels: Record<string, string> = {
  crm: "CRM & Sales",
  leads: "Leads",
  customers: "Customers",
  "follow-ups": "Follow-ups",
  opportunities: "Opportunities",
  engineering: "Engineering",
  "design-jobs": "Design Jobs",
  boq: "BOQ & Costing",
  boqs: "BOQ & Estimates",
  quotations: "Quotations",
  projects: "Projects",
  hub: "Project Hub",
  procurement: "Procurement",
  requisitions: "Requisitions",
  "purchase-orders": "Purchase Orders",
  "price-inquiries": "Price Inquiries",
  masters: "Master Catalogue",
  items: "Items",
  vendors: "Vendors",
  categories: "Categories",
  units: "Units",
  admin: "Administration",
  employees: "Employees",
  roles: "Roles & Permissions",
  settings: "Settings",
  notifications: "Notifications",
  account: "Account",
};

function DynamicBreadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Home className="size-3.5 text-primary" />
        Dashboard Overview
      </span>
    );
  }

  return (
    <nav aria-label="Breadcrumbs" className="flex items-center gap-1.5 text-xs">
      <Link
        to="/"
        className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="size-3.5" />
        <span className="hidden sm:inline">Home</span>
      </Link>

      {segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const isUUID = /^[0-9a-fA-F-]{16,}$/.test(segment);
        const label = isUUID
          ? "Detail"
          : routeLabels[segment] || segment.replace(/-/g, " ");

        return (
          <React.Fragment key={path}>
            <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-foreground capitalize truncate max-w-[180px]">
                {label}
              </span>
            ) : (
              <Link
                to={path}
                className="text-muted-foreground capitalize transition-colors hover:text-foreground truncate max-w-[140px]"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* =========================================================================
   GLOBAL COMMAND PALETTE (⌘K)
   ========================================================================= */

function GlobalCommandPalette({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: CurrentUser;
}) {
  const navigate = useNavigate();

  const handleSelect = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search records, jobs, BOQs, or navigate…" />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>No matching records or actions found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          {user.permissions.includes("crm.lead.write") && (
            <CommandItem
              onSelect={() => handleSelect("/crm/leads?action=create")}
              className="cursor-pointer gap-2"
            >
              <Plus className="size-4 text-primary" />
              <span>Create New Lead</span>
            </CommandItem>
          )}
          {user.permissions.includes("procurement.sourcing.read") && (
            <CommandItem
              onSelect={() => handleSelect("/procurement/requisitions")}
              className="cursor-pointer gap-2"
            >
              <ShoppingCart className="size-4 text-primary" />
              <span>New Vendor Price Inquiry</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Engineering Workspaces">
          <CommandItem
            onSelect={() => handleSelect("/engineering/design-jobs")}
            className="cursor-pointer gap-2"
          >
            <Layers className="size-4" />
            <span>Design Jobs Register</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect("/engineering/boqs")}
            className="cursor-pointer gap-2"
          >
            <FileText className="size-4" />
            <span>Technical BOQ & Costing Matrix</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect("/engineering/quotations")}
            className="cursor-pointer gap-2"
          >
            <FileText className="size-4" />
            <span>Quotations & Revisions</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Procurement & Operations">
          <CommandItem
            onSelect={() => handleSelect("/procurement/requisitions")}
            className="cursor-pointer gap-2"
          >
            <ShoppingCart className="size-4" />
            <span>Requisitions & Sourcing Demand</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect("/procurement/purchase-orders")}
            className="cursor-pointer gap-2"
          >
            <CheckCircle2 className="size-4" />
            <span>Purchase Orders (PO)</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect("/masters/vendors")}
            className="cursor-pointer gap-2"
          >
            <Boxes className="size-4" />
            <span>Vendors & Supply Directory</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect("/masters/items")}
            className="cursor-pointer gap-2"
          >
            <Boxes className="size-4" />
            <span>Catalogue Items & Unit Rates</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="CRM & Sales">
          <CommandItem
            onSelect={() => handleSelect("/crm/leads")}
            className="cursor-pointer gap-2"
          >
            <Target className="size-4" />
            <span>Leads Register</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect("/crm/customers")}
            className="cursor-pointer gap-2"
          >
            <Users className="size-4" />
            <span>Customer Accounts</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/* =========================================================================
   UPGRADED SIDEBAR INSET & MAIN SHELL AREA
   ========================================================================= */

export function MainShellArea({ user }: { user: CurrentUser }) {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Global Ctrl+K / Cmd+K listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SidebarInset className="min-w-0 flex-1 flex flex-col overflow-x-hidden bg-background">
      {/* Upgraded Sticky Glassmorphism Header */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md transition-all md:px-6 shadow-2xs">
        {/* Left: Trigger + Breadcrumb Trail */}
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border/70" />
          <DynamicBreadcrumbs pathname={location.pathname} />
        </div>

        {/* Right: Quick Command Palette Trigger + System Tools */}
        <div className="flex items-center gap-2">
          {/* Global Search Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCommandOpen(true)}
            className="hidden sm:inline-flex h-8 items-center gap-2 rounded-lg border-border/70 bg-muted/30 px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-all shadow-none"
          >
            <Search className="size-3.5 text-muted-foreground/70" />
            <span className="font-normal">Search portal…</span>
            <kbd className="pointer-events-none select-none rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shadow-2xs">
              ⌘K
            </kbd>
          </Button>

          {/* System Online / Offline Pulse Badge */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono text-muted-foreground select-none">
                  <span
                    className={
                      isOnline
                        ? "size-2 rounded-full bg-emerald-500 shadow-xs animate-pulse"
                        : "size-2 rounded-full bg-rose-500"
                    }
                  />
                  <span className="hidden xl:inline text-xs font-sans">
                    {isOnline ? "Live" : "Offline"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isOnline
                  ? "Connected to Fire Safety backend"
                  : "Disconnected — Reconnecting…"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-4 w-px bg-border/60" />

          {/* Header Action Tools */}
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area with Fluid Route Entrance Transition */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full"
          >
            <Outlet context={{ user }} />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Command Dialog Modal */}
      <GlobalCommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        user={user}
      />
    </SidebarInset>
  );
}
