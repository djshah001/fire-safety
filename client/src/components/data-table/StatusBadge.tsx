import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  progress:
    "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  success:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  attention:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function toneFor(status?: string | null): keyof typeof tones {
  if (!status) return "neutral";
  if (
    [
      "won",
      "active",
      "completed",
      "finalized",
      "awarded",
      "approved",
      "accepted",
      "selected",
      "equivalent",
      "design_authorized",
      "internally_approved",
      "customer_approved",
    ].includes(status)
  )
    return "success";
  if (
    [
      "lost",
      "cancelled",
      "inactive",
      "failed",
      "declined",
      "rejected",
    ].includes(status)
  )
    return "danger";
  if (
    [
      "on_hold",
      "pending",
      "unawarded",
      "returned",
      "changes_requested",
      "awaiting_designer",
      "deviation",
      "unknown",
    ].includes(status)
  )
    return "attention";
  if (
    [
      "contacted",
      "qualified",
      "quoted",
      "commercial_negotiation",
      "committing",
      "draft",
      "open",
      "sourcing",
      "under_review",
      "submitted",
      "costing",
      "purchase_review",
      "admin_review",
      "sent_to_customer",
      "issued",
    ].includes(status)
  )
    return "progress";
  return "neutral";
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status?: string | null;
  label?: string;
  className?: string;
}) {
  const displayText =
    label ??
    (typeof status === "string" && status.trim()
      ? status.replaceAll("_", " ")
      : "—");

  return (
    <Badge
      className={cn(
        "capitalize shadow-none font-medium select-none text-[11px] px-2 py-0.5",
        tones[toneFor(status)],
        className,
      )}
      variant="outline"
    >
      {displayText}
    </Badge>
  );
}
