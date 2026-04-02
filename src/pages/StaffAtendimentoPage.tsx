import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Loader2, ShieldCheck, Ticket, UserRoundCheck } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import SupportConversation from "@/components/support/SupportConversation";
import SupportMessageComposer from "@/components/support/SupportMessageComposer";
import { SupportCategoryBadge, SupportPriorityBadge, SupportStatusBadge } from "@/components/support/SupportTicketBadges";
import { formatSupportDateTime } from "@/components/support/supportUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminTickets } from "@/hooks/support/useAdminTickets";
import { useTicketThread } from "@/hooks/support/useTicketThread";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { replySupportTicket, updateSupportTicketAdmin } from "@/services/support/supportService";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  isSupportTicketClosed,
  type SupportTicketCategory,
  type SupportTicketFilters,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/types/support";

const defaultFilters: SupportTicketFilters = {
  status: "todos",
  categoria: "todas",
  prioridade: "todas",
  busca: "",
};

const StaffAtendimentoPage = () => {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<SupportTicketFilters>(defaultFilters);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(searchParams.get("ticket"));
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [statusDraft, setStatusDraft] = useState<SupportTicketStatus>("aberto");
  const [categoryDraft, setCategoryDraft] = useState<SupportTicketCategory>("tecnico");
  const [priorityDraft, setPriorityDraft] = useState<SupportTicketPriority>("media");

  const { filteredTickets, stats, isLoading, error } = useAdminTickets(filters);
  const { ticket: selectedTicket, messages, isLoading: isLoadingThread } = useTicketThread(selectedTicketId, "admin");

  useEffect(() => {
    const searchTicketId = searchParams.get("ticket");
    if (searchTicketId) {
      setSelectedTicketId(searchTicketId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedTicket) return;
    setStatusDraft(selectedTicket.status);
    setCategoryDraft(selectedTicket.categoria);
    setPriorityDraft(selectedTicket.prioridade);
  }, [selectedTicket]);

  useEffect(() => {
    if (filteredTickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    const hasSelectedTicket = selectedTicketId && filteredTickets.some((ticket) => ticket.id === selectedTicketId);
    if (!hasSelectedTicket) {
      const nextTicketId = filteredTickets[0].id;
      setSelectedTicketId(nextTicketId);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("ticket", nextTicketId);
        return next;
      });
    }
  }, [filteredTickets, selectedTicketId, setSearchParams]);

  const selectedSummary = useMemo(
    () => ({
      cliente: selectedTicket?.clienteNome ?? "-",
      obra: selectedTicket?.obraNome ?? selectedTicket?.obraId ?? "Nao informada",
      responsavel: selectedTicket?.responsavelNome ?? "Nao atribuido",
    }),
    [selectedTicket],
  );

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("ticket", ticketId);
      return next;
    });
  };

  const handleSaveMetadata = async () => {
    if (!selectedTicketId || !user || !userDoc) return;

    setIsSavingMeta(true);
    try {
      await updateSupportTicketAdmin(
        selectedTicketId,
        { uid: user.uid, nome: userDoc.nome, email: user.email ?? userDoc.email ?? null, tipo: "admin" },
        {
          status: statusDraft,
          categoria: categoryDraft,
          prioridade: priorityDraft,
          responsavelUid: user.uid,
          responsavelNome: userDoc.nome,
        },
      );
      toast({ title: "Ticket atualizado", description: "Metadados e responsavel salvos com sucesso." });
    } catch (saveError) {
      toast({
        title: "Falha ao atualizar ticket",
        description: saveError instanceof Error ? saveError.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicketId || !user || !userDoc) return;

    setIsSendingReply(true);
    try {
      await replySupportTicket(
        selectedTicketId,
        { uid: user.uid, nome: userDoc.nome, email: user.email ?? userDoc.email ?? null, tipo: "admin" },
        { mensagem: replyMessage },
      );
      setReplyMessage("");
    } catch (replyError) {
      toast({
        title: "Falha ao responder ticket",
        description: replyError instanceof Error ? replyError.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle="Atendimento" headerSubtitle="Leitura, resposta e gestao administrativa dos tickets">
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-2xl bg-primary/10 p-3"><Ticket className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-semibold">{stats.total}</p><p className="text-sm text-muted-foreground">Total</p></div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-2xl bg-sky-500/10 p-3"><ShieldCheck className="h-5 w-5 text-sky-700" /></div>
              <div><p className="text-2xl font-semibold">{stats.abertos}</p><p className="text-sm text-muted-foreground">Abertos/em andamento</p></div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-2xl bg-violet-500/10 p-3"><UserRoundCheck className="h-5 w-5 text-violet-700" /></div>
              <div><p className="text-2xl font-semibold">{stats.aguardandoCliente}</p><p className="text-sm text-muted-foreground">Aguardando cliente</p></div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-2xl bg-amber-500/10 p-3"><Filter className="h-5 w-5 text-amber-700" /></div>
              <div><p className="text-2xl font-semibold">{stats.naoLidos}</p><p className="text-sm text-muted-foreground">Nao lidos</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Filtros</CardTitle>
                <CardDescription>Filtre por status, categoria, prioridade, cliente ou obra.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2">
                  <Label>Buscar cliente ou obra</Label>
                  <Input value={filters.busca} onChange={(event) => setFilters((current) => ({ ...current, busca: event.target.value }))} />
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select value={filters.status} onValueChange={(value: SupportTicketStatus | "todos") => setFilters((current) => ({ ...current, status: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {Object.entries(SUPPORT_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Categoria</Label>
                    <Select value={filters.categoria} onValueChange={(value: SupportTicketCategory | "todas") => setFilters((current) => ({ ...current, categoria: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas</SelectItem>
                        {Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Prioridade</Label>
                    <Select value={filters.prioridade} onValueChange={(value: SupportTicketPriority | "todas") => setFilters((current) => ({ ...current, prioridade: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas</SelectItem>
                        {Object.entries(SUPPORT_PRIORITY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Tickets</CardTitle>
                <CardDescription>Ordenados pela ultima atualizacao.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando tickets...</div>
                ) : error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
                ) : filteredTickets.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum ticket encontrado com os filtros atuais.</div>
                ) : (
                  filteredTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => handleSelectTicket(ticket.id)}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition-colors hover:bg-muted/40",
                        selectedTicketId === ticket.id && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <SupportStatusBadge status={ticket.status} />
                        <SupportPriorityBadge prioridade={ticket.prioridade} />
                        {ticket.naoLidasAdmin > 0 ? <span className="text-xs font-medium text-primary">{ticket.naoLidasAdmin} nova(s)</span> : null}
                      </div>
                      <p className="font-semibold text-foreground">{ticket.titulo}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{ticket.clienteNome} {ticket.obraNome ? `- ${ticket.obraNome}` : ""}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{ticket.ultimaMensagemResumo}</p>
                      <p className="mt-3 text-xs text-muted-foreground">{formatSupportDateTime(ticket.ultimaMensagemEm ?? ticket.criadoEm)}</p>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>{selectedTicket?.titulo ?? "Selecione um ticket"}</CardTitle>
                  <CardDescription>
                    {selectedTicket ? "Leia o historico, responda e atualize o status do atendimento." : "Selecione um ticket na lista lateral."}
                  </CardDescription>
                </div>
                {selectedTicket ? (
                  <div className="flex flex-wrap gap-2">
                    <SupportStatusBadge status={selectedTicket.status} />
                    <SupportCategoryBadge categoria={selectedTicket.categoria} />
                    <SupportPriorityBadge prioridade={selectedTicket.prioridade} />
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 lg:p-6">
              {!selectedTicketId ? (
                <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">Nenhum ticket selecionado.</div>
              ) : isLoadingThread ? (
                <div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando detalhes...</div>
              ) : !selectedTicket ? (
                <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">O ticket selecionado nao esta mais disponivel.</div>
              ) : (
                <>
                  <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedSummary.cliente}</p>
                      <p className="text-xs text-muted-foreground">{selectedTicket.clienteEmail ?? "Sem email cadastrado"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Obra</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedSummary.obra}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Responsavel</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedSummary.responsavel}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-2xl border p-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                    <div className="grid gap-2">
                      <Label>Status</Label>
                      <Select value={statusDraft} onValueChange={(value: SupportTicketStatus) => setStatusDraft(value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SUPPORT_STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Categoria</Label>
                      <Select value={categoryDraft} onValueChange={(value: SupportTicketCategory) => setCategoryDraft(value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Prioridade</Label>
                      <Select value={priorityDraft} onValueChange={(value: SupportTicketPriority) => setPriorityDraft(value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SUPPORT_PRIORITY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button className="w-full lg:w-auto" onClick={() => void handleSaveMetadata()} disabled={isSavingMeta}>
                        {isSavingMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar ajustes
                      </Button>
                    </div>
                  </div>

                  <SupportConversation
                    messages={messages}
                    emptyTitle="Ticket sem respostas adicionais"
                    emptyDescription="A descricao inicial foi registrada, mas ainda nao existem novas mensagens nesta thread."
                  />

                  <SupportMessageComposer
                    value={replyMessage}
                    onChange={setReplyMessage}
                    onSubmit={handleReply}
                    disabled={isSupportTicketClosed(selectedTicket.status)}
                    isSubmitting={isSendingReply}
                    closedMessage="Este ticket foi fechado e a thread esta encerrada."
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ResponsiveLayout>
  );
};

export default StaffAtendimentoPage;
