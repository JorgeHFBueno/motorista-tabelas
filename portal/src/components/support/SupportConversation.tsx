import { MessageSquareText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatSupportDateTime } from "@/components/support/supportUtils";
import type { SupportTicketMessage } from "@/types/support";

interface SupportConversationProps {
  messages: SupportTicketMessage[];
  emptyTitle: string;
  emptyDescription: string;
}

const SupportConversation = ({
  messages,
  emptyTitle,
  emptyDescription,
}: SupportConversationProps) => (
  <ScrollArea className="h-[360px] rounded-2xl border bg-muted/20">
    <div className="space-y-4 p-4">
      {messages.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-background/70 px-6 text-center">
          <MessageSquareText className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{emptyDescription}</p>
        </div>
      ) : (
        messages.map((message) => {
          const isAdmin = message.autorTipo === "admin";
          return (
            <div
              key={message.id}
              className={cn("flex", isAdmin ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[80%]",
                  isAdmin ? "bg-background" : "bg-primary text-primary-foreground",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <p className={cn("text-sm font-semibold", isAdmin ? "text-foreground" : "text-primary-foreground")}>
                    {message.autorNome}
                  </p>
                  <p className={cn("text-[11px]", isAdmin ? "text-muted-foreground" : "text-primary-foreground/80")}>
                    {formatSupportDateTime(message.criadoEm)}
                  </p>
                </div>
                <p className={cn("whitespace-pre-wrap text-sm leading-6", isAdmin ? "text-foreground" : "text-primary-foreground")}>
                  {message.mensagem}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  </ScrollArea>
);

export default SupportConversation;
