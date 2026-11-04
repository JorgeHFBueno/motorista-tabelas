import { useEffect, useState } from "react";
import { markTicketReadByClient, subscribeTicket, subscribeTicketMessages } from "@/services/support/supportService";
import type { SupportTicket, SupportTicketMessage } from "@/types/support";

// One ticket and its messages; opening it marks the team's answers as read by the client.
export const useTicketThread = (ticketId?: string | null) => {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmado(false);
    setMessages([]);

    if (!ticketId) {
      setTicket(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    return subscribeTicket(
      ticketId,
      (nextTicket, ticketConfirmado) => {
        setTicket(nextTicket);
        setConfirmado((anterior) => anterior || (Boolean(nextTicket) && ticketConfirmado));
        setIsLoading(false);
        if (nextTicket && ticketConfirmado && nextTicket.naoLidasCliente > 0) {
          markTicketReadByClient(ticketId).catch(() => undefined);
        }
      },
      () => {
        setError("Não foi possível carregar o atendimento.");
        setIsLoading(false);
      },
    );
  }, [ticketId]);

  // The message Rules read the ticket on the server, so listening starts only once the server has it
  // (a ticket just created on this device would otherwise be refused).
  useEffect(() => {
    if (!ticketId || !confirmado) return;

    return subscribeTicketMessages(ticketId, setMessages, () => {
      setError("Não foi possível carregar a conversa.");
    });
  }, [ticketId, confirmado]);

  return { ticket, messages, isLoading, error };
};
