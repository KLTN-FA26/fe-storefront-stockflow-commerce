import { AlertTriangle, OctagonAlert, type LucideIcon } from "lucide-react";

import { NOTIFICATION_LABELS } from "@/constants/notifications";

import { formatDateTime } from "@/lib/format/date";

import { Badge } from "@/components/ui/badge";

import type { NotificationItem } from "../types";

/**
 * Only a notice that needs attention carries a badge (SF-UX-14): a routine one (INFO) is told by
 * its title. The words are in the primary ink, which passes 4.5:1 on the light tint in both themes
 * (WCAG 1.4.3); the tone is carried by the icon and the border, never by coloured text alone.
 */
const SEVERITY_BADGE: Partial<
  Record<NotificationItem["severity"], { className: string; icon: LucideIcon; iconClass: string }>
> = {
  WARN: {
    className: "border-warning/50 bg-warning/10",
    icon: AlertTriangle,
    iconClass: "text-warning",
  },
  CRITICAL: {
    className: "border-danger/50 bg-danger/10",
    icon: OctagonAlert,
    iconClass: "text-danger",
  },
};

function SeverityBadge({ severity }: { severity: NotificationItem["severity"] }) {
  const badge = SEVERITY_BADGE[severity];
  if (!badge) return null;
  const Icon = badge.icon;
  return (
    <Badge variant="outline" className={`text-ink-primary gap-1 ${badge.className}`}>
      <Icon aria-hidden className={`size-3.5 ${badge.iconClass}`} />
      {NOTIFICATION_LABELS.severity[severity]}
    </Badge>
  );
}

export function NotificationItems({
  items,
  onSelect,
}: {
  items: NotificationItem[];
  onSelect: (item: NotificationItem) => void;
}) {
  return (
    <ul aria-label={NOTIFICATION_LABELS.title} className="divide-border-default divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className={`hover:bg-bg-muted focus-visible:ring-accent flex min-h-11 w-full flex-col gap-1.5 px-4 py-3 text-left text-sm focus-visible:ring-2 focus-visible:outline-none ${item.read ? "" : "bg-info/5"}`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <SeverityBadge severity={item.severity} />
              <span className="text-ink-tertiary ml-auto text-xs tabular-nums">
                {formatDateTime(item.createdAt)}
              </span>
            </span>
            <span className="text-ink-primary flex items-center gap-2 font-semibold">
              {!item.read && <span aria-hidden className="bg-info size-2 shrink-0 rounded-full" />}
              {item.title}
            </span>
            {item.body && (
              <span className="text-ink-secondary line-clamp-2 text-xs">{item.body}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
