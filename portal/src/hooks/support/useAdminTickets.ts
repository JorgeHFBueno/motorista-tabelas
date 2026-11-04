import { useEffect, useMemo, useState } from "react";
import { subscribeAdminTickets } from "@/services/support/supportService";
import type { SupportTicket, SupportTicketFilters } from "@/types/support";

const normalize = (value: string) => value.trim().toLowerCase();

export const useAdminTickets = (filters: SupportTicketFilters) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeAdminTickets(
      (nextTickets) => {
        setTickets(nextTickets);
        setIsLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message || "Não foi possível carregar os tickets.");
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const filteredTickets = useMemo(() => {
    const search = normalize(filters.busca);
    return tickets.filter((ticket) => {
      if (filters.status !== "todos" && ticket.status !== filters.status) return false;
      if (filters.categoria !== "todas" && ticket.categoria !== filters.categoria) return false;
      if (filters.prioridade !== "todas" && ticket.prioridade !== filters.prioridade) return false;
      if (!search) return true;

      const haystack = [
        ticket.titulo,
        ticket.clienteNome,
        ticket.clienteEmail ?? "",
        ticket.obraNome ?? "",
        ticket.obraId ?? "",
        ticket.ultimaMensagemResumo,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [filters.busca, filters.categoria, filters.prioridade, filters.status, tickets]);

  const stats = useMemo(
    () => ({
      total: tickets.length,
      abertos: tickets.filter((ticket) => ticket.status === "aberto" || ticket.status === "em_andamento").length,
      aguardandoCliente: tickets.filter((ticket) => ticket.status === "aguardando_cliente").length,
      naoLidos: tickets.filter((ticket) => ticket.naoLidasAdmin > 0).length,
    }),
    [tickets],
  );

  return {
    tickets,
    filteredTickets,
    stats,
    isLoading,
    error,
  };
};
