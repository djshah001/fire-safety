import * as React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Home } from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import { CommandPaletteTrigger } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { TRANSITION_FAST } from "@/lib/motion";
import { cn } from "@/lib/utils";

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
  "substitution-reviews": "Technical Reviews",
  masters: "Master Catalogue",
  items: "Items",
  vendors: "Vendors",
  "item-families": "Item Families",
  brands: "Brands & Makes",
  "item-categories": "Item Categories",
  units: "Units",
  "boq-templates": "BOQ Templates",
  inventory: "Inventory",
  admin: "Administration",
  employees: "Employees",
  roles: "Roles & Permissions",
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
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            {isLast ? (
              <span className="max-w-[180px] truncate font-semibold capitalize text-foreground">
                {label}
              </span>
            ) : (
              <Link
                to={path}
                className="max-w-[140px] truncate capitalize text-muted-foreground transition-colors hover:text-foreground"
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

export function MainShellArea({
  user,
  onOpenCommand,
}: {
  user: CurrentUser;
  onOpenCommand: () => void;
}) {
  const location = useLocation();
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

  return (
    <SidebarInset className="min-w-0 flex-1 flex flex-col overflow-x-hidden bg-background">
      {/* Sticky Header with Breadcrumb Trail & Global Command Palette Trigger */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-4 shadow-2xs backdrop-blur-md md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border/70" />
          <DynamicBreadcrumbs pathname={location.pathname} />
        </div>

        <div className="flex items-center gap-2">
          <CommandPaletteTrigger onClick={onOpenCommand} />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex select-none items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  <span
                    className={cn(
                      "size-2 rounded-full transition-colors",
                      isOnline
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-rose-500",
                    )}
                  />
                  <span className="hidden font-sans text-xs xl:inline">
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

          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={TRANSITION_FAST}
            className="w-full"
          >
            <Outlet context={{ user }} />
          </motion.div>
        </AnimatePresence>
      </main>
    </SidebarInset>
  );
}
