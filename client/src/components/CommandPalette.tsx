import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Boxes,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  DraftingCompass,
  FileCheck2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Target,
  Truck,
  Users,
} from "lucide-react";

import type { CurrentUser } from "@/api/auth";
import {
  canAccessBoqs,
  canAccessDesignJobs,
  searchGlobalMetadata,
} from "@/api/search";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette({
  user,
  open,
  onOpenChange,
}: {
  user: CurrentUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const hasPerm = (perm: string) =>
    user.permissions.includes("system.access.all") ||
    user.permissions.includes(perm);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const searchQuery = useQuery({
    queryKey: ["global-search", user.id, debouncedQuery],
    queryFn: ({ signal }) =>
      searchGlobalMetadata(debouncedQuery, user.permissions, signal),
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const runAction = (fn: () => void) => {
    onOpenChange(false);
    setQuery("");
    fn();
  };

  const results = searchQuery.data;
  const hasResults =
    (results?.leads.length ?? 0) > 0 ||
    (results?.designJobs.length ?? 0) > 0 ||
    (results?.projects.length ?? 0) > 0 ||
    (results?.vendors.length ?? 0) > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setQuery("");
        onOpenChange(nextOpen);
      }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search leads, design jobs, projects, or jump to a screen…"
      />
      <CommandList className="max-h-[380px]">
        {searchQuery.isFetching && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Searching permitted records…
          </div>
        )}

        <CommandEmpty>No matching commands or records found.</CommandEmpty>

        {/* GROUP 1: LIVE PERMITTED SERVER SEARCH RESULTS */}
        {debouncedQuery.length >= 2 && hasResults && (
          <>
            {(results?.leads.length ?? 0) > 0 && (
              <CommandGroup heading="Leads">
                {results!.leads.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={`lead ${lead.leadNumber} ${lead.inquiryName}`}
                    keywords={[debouncedQuery]}
                    onSelect={() =>
                      runAction(() =>
                        navigate(`/crm/leads?selectedId=${lead.id}`),
                      )
                    }
                  >
                    <Target className="mr-2 size-3.5 text-primary" />
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {lead.leadNumber}
                    </span>
                    <span className="truncate text-xs">{lead.inquiryName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(results?.designJobs.length ?? 0) > 0 && (
              <CommandGroup heading="Design Jobs">
                {results!.designJobs.map((job) => (
                  <CommandItem
                    key={job.id}
                    value={`design ${job.leadNumber} ${job.title}`}
                    keywords={[debouncedQuery]}
                    onSelect={() =>
                      runAction(() =>
                        navigate(`/engineering/design-jobs/${job.id}`),
                      )
                    }
                  >
                    <DraftingCompass className="mr-2 size-3.5 text-primary" />
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {job.leadNumber}
                    </span>
                    <span className="truncate text-xs">{job.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(results?.projects.length ?? 0) > 0 && (
              <CommandGroup heading="Projects">
                {results!.projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={`project ${project.code} ${project.name}`}
                    keywords={[debouncedQuery]}
                    onSelect={() =>
                      runAction(() => navigate(`/projects/${project.id}`))
                    }
                  >
                    <FolderKanban className="mr-2 size-3.5 text-primary" />
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {project.code}
                    </span>
                    <span className="truncate text-xs">{project.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(results?.vendors.length ?? 0) > 0 && (
              <CommandGroup heading="Vendors">
                {results!.vendors.map((vendor) => (
                  <CommandItem
                    key={vendor.id}
                    value={`vendor ${vendor.code} ${vendor.name}`}
                    keywords={[debouncedQuery]}
                    onSelect={() =>
                      runAction(() =>
                        navigate(`/masters/vendors?selectedId=${vendor.id}`),
                      )
                    }
                  >
                    <Truck className="mr-2 size-3.5 text-primary" />
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {vendor.code}
                    </span>
                    <span className="truncate text-xs">{vendor.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
          </>
        )}

        {/* GROUP 2: PERMISSION-GATED QUICK ACTIONS */}
        <CommandGroup heading="Quick Actions">
          {hasPerm("crm.lead.write") && (
            <CommandItem
              onSelect={() =>
                runAction(() => navigate("/crm/leads?action=create"))
              }
            >
              <Plus className="mr-2 size-3.5 text-primary" />
              <span className="text-xs">New Lead</span>
              <CommandShortcut>C</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => runAction(() => navigate("/notifications"))}
          >
            <Bell className="mr-2 size-3.5" />
            <span className="text-xs">View Notifications</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* GROUP 3: PERMISSION-GATED NAVIGATION */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runAction(() => navigate("/"))}>
            <LayoutDashboard className="mr-2 size-3.5" />
            <span className="text-xs">My Work Dashboard</span>
          </CommandItem>

          {hasPerm("crm.lead.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/crm/leads"))}
            >
              <Target className="mr-2 size-3.5" />
              <span className="text-xs">CRM · Leads</span>
            </CommandItem>
          )}

          {hasPerm("crm.customer.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/crm/customers"))}
            >
              <Building2 className="mr-2 size-3.5" />
              <span className="text-xs">CRM · Customers</span>
            </CommandItem>
          )}

          {hasPerm("crm.opportunity.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/crm/opportunities"))}
            >
              <BriefcaseBusiness className="mr-2 size-3.5" />
              <span className="text-xs">CRM · Opportunities</span>
            </CommandItem>
          )}

          {canAccessDesignJobs(user.permissions) && (
            <CommandItem
              onSelect={() =>
                runAction(() => navigate("/engineering/design-jobs"))
              }
            >
              <DraftingCompass className="mr-2 size-3.5" />
              <span className="text-xs">Engineering · Design Jobs</span>
            </CommandItem>
          )}

          {canAccessBoqs(user.permissions) && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/engineering/boqs"))}
            >
              <ClipboardList className="mr-2 size-3.5" />
              <span className="text-xs">Engineering · BOQ &amp; Estimates</span>
            </CommandItem>
          )}

          {hasPerm("engineering.quotation.read") && (
            <CommandItem
              onSelect={() =>
                runAction(() => navigate("/engineering/quotations"))
              }
            >
              <FileText className="mr-2 size-3.5" />
              <span className="text-xs">Engineering · Quotations</span>
            </CommandItem>
          )}

          {hasPerm("project.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/projects"))}
            >
              <FolderKanban className="mr-2 size-3.5" />
              <span className="text-xs">Projects</span>
            </CommandItem>
          )}

          {hasPerm("procurement.sourcing.read") && (
            <CommandItem
              onSelect={() =>
                runAction(() => navigate("/procurement/requisitions"))
              }
            >
              <ShoppingCart className="mr-2 size-3.5" />
              <span className="text-xs">Procurement · Requisitions</span>
            </CommandItem>
          )}

          {hasPerm("procurement.purchase_order.read") && (
            <CommandItem
              onSelect={() =>
                runAction(() => navigate("/procurement/purchase-orders"))
              }
            >
              <FileCheck2 className="mr-2 size-3.5" />
              <span className="text-xs">Procurement · Purchase Orders</span>
            </CommandItem>
          )}

          {hasPerm("procurement.vendor.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/masters/vendors"))}
            >
              <Truck className="mr-2 size-3.5" />
              <span className="text-xs">Masters · Vendors</span>
            </CommandItem>
          )}

          {hasPerm("procurement.item.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/masters/items"))}
            >
              <Boxes className="mr-2 size-3.5" />
              <span className="text-xs">Masters · Items</span>
            </CommandItem>
          )}

          {hasPerm("identity.users.read") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/admin/employees"))}
            >
              <Users className="mr-2 size-3.5" />
              <span className="text-xs">Administration · Employees</span>
            </CommandItem>
          )}

          {hasPerm("identity.roles.manage") && (
            <CommandItem
              onSelect={() => runAction(() => navigate("/admin/roles"))}
            >
              <ShieldCheck className="mr-2 size-3.5" />
              <span className="text-xs">Administration · Roles</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Slim header trigger button showing the Cmd+K hint */
export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-8 w-44 justify-between px-2.5 text-xs font-normal text-muted-foreground sm:w-56"
    >
      <span className="flex items-center gap-1.5 truncate">
        <Search className="size-3.5 shrink-0" />
        <span className="truncate">Search or jump to…</span>
      </span>
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
        <span>⌘</span>K
      </kbd>
    </Button>
  );
}
