import { useEffect, useMemo, useState } from "react";
import { subscribeClientTickets } from "@/services/support/supportService";
import type { SupportTicket } from "@/types/support";

export const useClientTickets = (clientUid?: string) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientUid) {
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeClientTickets(
      clientUid,
      (nextTickets) => {
        setTickets(nextTickets);
        setIsLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message || "Nao foi possivel carregar seus tickets.");
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [clientUid]);

  const stats = useMemo(
    () => ({
      total: tickets.length,
      emAndamento: tickets.filter((ticket) => ticket.status === "em_andamento" || ticket.status === "aguardando_cliente").length,
      resolvidos: tickets.filter((ticket) => ticket.status === "resolvido" || ticket.status === "fechado").length,
      naoLidos: tickets.filter((ticket) => ticket.naoLidasCliente > 0).length,
    }),
    [tickets],
  );

  return {
    tickets,
    stats,
    isLoading,
    error,
  };
};
