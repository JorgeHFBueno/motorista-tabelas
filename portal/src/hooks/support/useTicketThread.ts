import { useEffect, useState } from "react";
import {
  markTicketReadByAdmin,
  markTicketReadByClient,
  subscribeTicket,
  subscribeTicketMessages,
} from "@/services/support/supportService";
import type { SupportAuthorType, SupportTicket, SupportTicketMessage } from "@/types/support";

export const useTicketThread = (ticketId?: string | null, viewerType?: SupportAuthorType) => {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) {
      setTicket(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribeTicket = subscribeTicket(
      ticketId,
      async (nextTicket) => {
        setTicket(nextTicket);
        setIsLoading(false);

        if (!nextTicket || !viewerType) return;
        if (viewerType === "cliente" && nextTicket.naoLidasCliente > 0) {
          await markTicketReadByClient(ticketId);
        }
        if (viewerType === "admin" && nextTicket.naoLidasAdmin > 0) {
          await markTicketReadByAdmin(ticketId);
        }
      },
      (snapshotError) => {
        setError(snapshotError.message || "Nao foi possivel carregar o ticket.");
        setIsLoading(false);
      },
    );

    const unsubscribeMessages = subscribeTicketMessages(
      ticketId,
      (nextMessages) => {
        setMessages(nextMessages);
      },
      (snapshotError) => {
        setError(snapshotError.message || "Nao foi possivel carregar a conversa.");
      },
    );

    return () => {
      unsubscribeTicket();
      unsubscribeMessages();
    };
  }, [ticketId, viewerType]);

  return {
    ticket,
    messages,
    isLoading,
    error,
  };
};
