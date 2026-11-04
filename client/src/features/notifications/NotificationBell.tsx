import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  Loader2,
  ArrowRight,
  Inbox,
  Check,
} from "lucide-react";

import { getApiErrorMessage } from "@/api/client";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationSummaryQuery,
  type AppNotification,
} from "@/api/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 45) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getNotificationIcon(notification: AppNotification) {
  const text = `${notification.title} ${notification.message}`.toLowerCase();

  if (
    text.includes("deadline") ||
    text.includes("due") ||
    text.includes("overdue") ||
    text.includes("buffer")
  ) {
    return <Clock className="size-4 text-amber-500 shrink-0" />;
  }
  if (text.includes("approved") || text.includes("decision")) {
    return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />;
  }
  if (
    text.includes("returned") ||
    text.includes("rejected") ||
    text.includes("changes requested")
  ) {
    return <AlertCircle className="size-4 text-rose-500 shrink-0" />;
  }
  if (text.includes("assign") || text.includes("engineer")) {
    return <UserCheck className="size-4 text-blue-500 shrink-0" />;
  }
  if (
    text.includes("boq") ||
    text.includes("quotation") ||
    text.includes("estimate") ||
    text.includes("requisition")
  ) {
    return <FileText className="size-4 text-primary shrink-0" />;
  }

  return <Bell className="size-4 text-muted-foreground shrink-0" />;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");

  const query = useQuery(notificationSummaryQuery);

  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readMutation = useMutation({
    mutationFn: (notification: AppNotification) =>
      notification.readAt
        ? Promise.resolve()
        : markNotificationRead(notification.id, notification.rowVersion),
    async onSuccess(_data, notification) {
      await refresh();
      if (notification.link) {
        setDropdownOpen(false);
        navigate(notification.link);
      }
    },
    onError(error) {
      toast.error(getApiErrorMessage(error));
    },
  });

  const allMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    async onSuccess() {
      await refresh();
      toast.success("All notifications marked as read.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const unreadCount = query.data?.unreadCount ?? 0;
  const items = query.data?.items ?? [];

  const displayedItems =
    activeTab === "unread" ? items.filter((n) => !n.readAt) : items;

  return (
    <TooltipProvider delayDuration={150}>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-8 rounded-lg text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all"
                aria-label={`${unreadCount} unread notifications`}
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <>
                    <span className="absolute top-1 right-1 flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-primary" />
                    </span>
                    <Badge className="sr-only" variant="destructive">
                      {unreadCount}
                    </Badge>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "Notifications"}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-[360px] sm:w-[400px] rounded-2xl p-0 shadow-2xl border-border/80 overflow-hidden bg-popover/98 backdrop-blur-md"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 p-3.5 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Notifications
              </span>
              {unreadCount > 0 && (
                <Badge
                  variant="default"
                  className="h-4.5 px-1.5 text-[10px] font-mono font-semibold"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              disabled={unreadCount === 0 || allMutation.isPending}
              onClick={() => allMutation.mutate()}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {allMutation.isPending ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCheck className="size-3.5 mr-1.5" />
              )}
              Mark all read
            </Button>
          </div>

          {/* Filter Segmented Control */}
          <div className="flex items-center border-b border-border/50 bg-muted/20 px-3 py-1.5 gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-hidden",
                activeTab === "all"
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {activeTab === "all" && (
                <motion.span
                  layoutId="notification-tab-pill"
                  className="absolute inset-0 rounded-md bg-background shadow-2xs border border-border/60"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">All ({items.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("unread")}
              className={cn(
                "relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-hidden",
                activeTab === "unread"
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {activeTab === "unread" && (
                <motion.span
                  layoutId="notification-tab-pill"
                  className="absolute inset-0 rounded-md bg-background shadow-2xs border border-border/60"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">Unread ({unreadCount})</span>
            </button>
          </div>

          {/* Notification List Body */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40 [scrollbar-width:thin]">
            {query.isPending ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-2">
                    <Skeleton className="size-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedItems.length > 0 ? (
              <AnimatePresence initial={false}>
                {displayedItems.map((notification) => {
                  const isUnread = !notification.readAt;

                  return (
                    <DropdownMenuItem
                      key={notification.id}
                      onClick={() => readMutation.mutate(notification)}
                      className={cn(
                        "group/notif relative flex items-start gap-3 p-3.5 cursor-pointer rounded-none transition-colors outline-hidden focus:bg-accent/60",
                        isUnread
                          ? "bg-primary/[0.04] dark:bg-primary/[0.07] hover:bg-primary/[0.08]"
                          : "hover:bg-muted/40",
                      )}
                    >
                      {/* Contextual Icon Container */}
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-background border border-border/70 shadow-2xs">
                        {getNotificationIcon(notification)}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-xs leading-snug line-clamp-1",
                              isUnread
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/80",
                            )}
                          >
                            {notification.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono shrink-0">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                      </div>

                      {/* Unread Accent Indicator / Read Toggle */}
                      {isUnread && (
                        <div className="shrink-0 self-center pl-1">
                          <span
                            className="block size-2 rounded-full bg-primary"
                            title="Unread"
                          />
                        </div>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </AnimatePresence>
            ) : (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                  <Inbox className="size-5" />
                </div>
                <p className="text-xs font-medium text-foreground">
                  {activeTab === "unread"
                    ? "No unread notifications"
                    : "No notifications yet"}
                </p>
                <p className="text-[11px] text-muted-foreground max-w-[220px] mx-auto">
                  {activeTab === "unread"
                    ? "You've addressed all priority notifications."
                    : "All assignment and approval activity will show up here."}
                </p>
              </div>
            )}
          </div>

          <DropdownMenuSeparator className="m-0" />

          {/* Footer Action */}
          <div className="p-2 bg-muted/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDropdownOpen(false);
                navigate("/notifications");
              }}
              className="w-full justify-center h-8 text-xs font-medium text-foreground hover:text-primary transition-colors"
            >
              <span>View all in Notification Center</span>
              <ArrowRight className="size-3.5 ml-1.5" />
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
