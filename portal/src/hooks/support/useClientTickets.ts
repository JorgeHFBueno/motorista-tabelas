import { useEffect, useMemo, useState } from "react";
import { subscribeClientTickets } from "@/services/support/supportService";
import type { SupportTicket } from "@/types/support";

// Tickets of every login of the client's CNPJ/CPF.
export const useClientTickets = (documentos: string[]) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chave = documentos.join(",");

  useEffect(() => {
    if (!chave) {
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeClientTickets(
      chave.split(","),
      (nextTickets) => {
        setTickets(nextTickets);
        setIsLoading(false);
      },
      () => {
        setError("Não foi possível carregar seus atendimentos.");
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [chave]);

  const stats = useMemo(
    () => ({
      total: tickets.length,
      emAndamento: tickets.filter((ticket) => ticket.status === "em_andamento" || ticket.status === "aguardando_cliente").length,
      resolvidos: tickets.filter((ticket) => ticket.status === "resolvido" || ticket.status === "fechado").length,
      naoLidos: tickets.filter((ticket) => ticket.naoLidasCliente > 0).length,
    }),
    [tickets],
  );

  return { tickets, stats, isLoading, error };
};
