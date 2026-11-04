import { cn } from "@/lib/utils";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_PRIORITY_STYLES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_STATUS_STYLES,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/types/support";

export const formatSupportDateTime = (value?: { toDate?: () => Date; seconds?: number } | null) => {
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString("pt-BR");
  }

  return "Agora";
};

export const supportStatusLabel = (status: SupportTicketStatus) => SUPPORT_STATUS_LABELS[status];
export const supportCategoryLabel = (category: SupportTicketCategory) => SUPPORT_CATEGORY_LABELS[category];
export const supportPriorityLabel = (priority: SupportTicketPriority) => SUPPORT_PRIORITY_LABELS[priority];

export const supportStatusBadgeClassName = (status: SupportTicketStatus) =>
  cn("border", SUPPORT_STATUS_STYLES[status]);

export const supportPriorityBadgeClassName = (priority: SupportTicketPriority) =>
  cn("border", SUPPORT_PRIORITY_STYLES[priority]);
