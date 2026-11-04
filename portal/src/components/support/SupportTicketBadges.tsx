import { Badge } from "@/components/ui/badge";
import {
  supportCategoryLabel,
  supportPriorityBadgeClassName,
  supportPriorityLabel,
  supportStatusBadgeClassName,
  supportStatusLabel,
} from "@/components/support/supportUtils";
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from "@/types/support";

export const SupportStatusBadge = ({ status }: { status: SupportTicketStatus }) => (
  <Badge variant="outline" className={supportStatusBadgeClassName(status)}>
    {supportStatusLabel(status)}
  </Badge>
);

export const SupportCategoryBadge = ({ categoria }: { categoria: SupportTicketCategory }) => (
  <Badge variant="secondary">{supportCategoryLabel(categoria)}</Badge>
);

export const SupportPriorityBadge = ({ prioridade }: { prioridade: SupportTicketPriority }) => (
  <Badge variant="outline" className={supportPriorityBadgeClassName(prioridade)}>
    {supportPriorityLabel(prioridade)}
  </Badge>
);
