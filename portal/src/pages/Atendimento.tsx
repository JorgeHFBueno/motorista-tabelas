import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, LifeBuoy, Loader2, Plus, Ticket, Workflow } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import SupportConversation from "@/components/support/SupportConversation";
import SupportMessageComposer from "@/components/support/SupportMessageComposer";
import { SupportCategoryBadge, SupportPriorityBadge, SupportStatusBadge } from "@/components/support/SupportTicketBadges";
import { formatSupportDateTime } from "@/components/support/supportUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useObra } from "@/contexts/ObraContext";
import { useClientTickets } from "@/hooks/support/useClientTickets";
import { useTicketThread } from "@/hooks/support/useTicketThread";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createSupportTicket, replySupportTicket } from "@/services/support/supportService";
import {
  NOVA_OBRA,
  NOVA_OBRA_LABEL,
  SUPPORT_CATEGORY_LABELS,
  isSupportTicketClosed,
  type SupportTicket,
  type SupportTicketCategory,
} from "@/types/support";

const DEFAULT_CATEGORY: SupportTicketCategory = "tecnico";

const Atendimento = () => {
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(searchParams.get("ticket"));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketCategory, setNewTicketCategory] = useState<SupportTicketCategory>(DEFAULT_CATEGORY);
  const { contratos: obras, obraAtivaId } = useObra();
  const [newTicketObraId, setNewTicketObraId] = useState(obraAtivaId ?? "");
  const [newTicketDescription, setNewTicketDescription] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);

  const { tickets, stats, isLoading, error } = useClientTickets(userDoc?.documentos ?? []);
  const { ticket: selectedTicket, messages, isLoading: isLoadingThread } = useTicketThread(selectedTicketId);

  // "Nova obra" for a ticket about a new construction; otherwise the contract name.
  const obraDoChamado = (ticket: SupportTicket) =>
    ticket.novaObra ? NOVA_OBRA_LABEL : (obras.find((obra) => obra.id === ticket.obraId)?.nome ?? null);
  const novaObraSelecionada = newTicketObraId === NOVA_OBRA;
  const selectedObraNome = selectedTicket ? obraDoChamado(selectedTicket) : null;

  useEffect(() => {
    const searchTicketId = searchParams.get("ticket");
    if (searchTicketId) {
      setSelectedTicketId(searchTicketId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!newTicketObraId && obraAtivaId) {
      setNewTicketObraId(obraAtivaId);
    }
  }, [newTicketObraId, obraAtivaId]);

  useEffect(() => {
    if (tickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    const hasSelectedTicket = selectedTicketId && tickets.some((ticket) => ticket.id === selectedTicketId);
    if (!hasSelectedTicket) {
      const nextTicketId = tickets[0].id;
      setSelectedTicketId(nextTicketId);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("ticket", nextTicketId);
        return next;
      });
    }
  }, [selectedTicketId, setSearchParams, tickets]);

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("ticket", ticketId);
      return next;
    });
  };

  const handleCreateTicket = async () => {
    if (!user || !userDoc) return;

    setIsCreatingTicket(true);
    try {
      // A new construction has no contract yet: the ticket goes with the active contract, marked novaObra.
      const obraSelecionada = obras.find((obra) => obra.id === (novaObraSelecionada ? obraAtivaId : newTicketObraId));
      if (!obraSelecionada) throw new Error("Escolha a obra do chamado.");
      const { ticketId } = await createSupportTicket({
        obra: obraSelecionada,
        autor: { uid: user.uid, nome: userDoc.nome || user.email || "Cliente" },
        titulo: newTicketTitle,
        descricaoInicial: newTicketDescription,
        categoria: newTicketCategory,
        novaObra: novaObraSelecionada,
      });

      setNewTicketTitle("");
      setNewTicketCategory(DEFAULT_CATEGORY);
      setNewTicketDescription("");
      setNewTicketObraId(obraAtivaId ?? "");
      setIsCreateDialogOpen(false);
      handleSelectTicket(ticketId);
      toast({ title: "Chamado aberto", description: "Seu chamado foi criado e enviado para a equipe." });
    } catch (createError) {
      toast({
        title: "Não foi possível abrir o chamado",
        description: createError instanceof Error ? createError.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicketId || !user || !userDoc) return;

    setIsSendingReply(true);
    try {
      await replySupportTicket(
        selectedTicketId,
        { uid: user.uid, nome: userDoc.nome || user.email || "Cliente" },
        replyMessage,
      );
      setReplyMessage("");
    } catch (replyError) {
      toast({
        title: "Não foi possível enviar a resposta",
        description: replyError instanceof Error ? replyError.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <ResponsiveLayout headerTitle="Suporte" headerSubtitle="Fale com a equipe da Ledur">
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Button className="w-full" size="lg" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Abrir novo chamado
            </Button>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <Card className="rounded-2xl">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-2xl bg-primary/10 p-3"><Ticket className="h-5 w-5 text-primary" /></div>
                  <div><p className="text-2xl font-semibold">{stats.total}</p><p className="text-sm text-muted-foreground">Total</p></div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-2xl bg-sky-500/10 p-3"><Workflow className="h-5 w-5 text-sky-700" /></div>
                  <div><p className="text-2xl font-semibold">{stats.emAndamento}</p><p className="text-sm text-muted-foreground">Em andamento</p></div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-2xl bg-emerald-500/10 p-3"><LifeBuoy className="h-5 w-5 text-emerald-700" /></div>
                  <div><p className="text-2xl font-semibold">{stats.resolvidos}</p><p className="text-sm text-muted-foreground">Resolvidos</p></div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Meus chamados</CardTitle>
                <CardDescription>Os chamados da sua empresa com a Ledur.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando chamados...
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
                ) : tickets.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    Nenhum chamado aberto ainda. Use o botão acima para falar com a Ledur.
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => handleSelectTicket(ticket.id)}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition-colors hover:bg-muted/40",
                        selectedTicketId === ticket.id && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <SupportStatusBadge status={ticket.status} />
                        <SupportCategoryBadge categoria={ticket.categoria} />
                        {ticket.naoLidasCliente > 0 ? <span className="text-xs font-medium text-primary">Nova resposta da administração</span> : null}
                      </div>
                      <p className="font-semibold text-foreground">{ticket.titulo}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ticket.ultimaMensagemResumo || ticket.descricaoInicial}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{obraDoChamado(ticket) ?? "Obra"}</span>
                        <span>{formatSupportDateTime(ticket.ultimaMensagemEm ?? ticket.criadoEm)}</span>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <CardTitle>{selectedTicket?.titulo ?? "Selecione um chamado"}</CardTitle>
                  <CardDescription>
                    {selectedTicket
                      ? "Leia a conversa completa e responda enquanto o chamado não estiver fechado."
                      : "Escolha um chamado na lista para ver a conversa."}
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
                <div className="flex min-h-[460px] flex-col items-center justify-center rounded-2xl border border-dashed text-center">
                  <Ticket className="mb-3 h-9 w-9 text-muted-foreground" />
                  <p className="font-medium text-foreground">Nenhum chamado selecionado</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">Abra um chamado ou escolha um da lista para acompanhar a conversa.</p>
                </div>
              ) : isLoadingThread ? (
                <div className="flex min-h-[460px] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando conversa...
                </div>
              ) : !selectedTicket ? (
                <div className="flex min-h-[460px] flex-col items-center justify-center rounded-2xl border border-dashed text-center">
                  <AlertCircle className="mb-3 h-9 w-9 text-muted-foreground" />
                  <p className="font-medium text-foreground">Chamado indisponível</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">O chamado escolhido não está mais acessível para este usuário.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedTicket.criadoPor?.nome || "Cliente"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Obra</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedObraNome ?? "Não informada"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Última interação</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{formatSupportDateTime(selectedTicket.ultimaMensagemEm ?? selectedTicket.criadoEm)}</p>
                    </div>
                  </div>

                  <SupportConversation
                    messages={messages}
                    emptyTitle="A conversa ainda não tem respostas adicionais"
                    emptyDescription="A descrição inicial foi registrada, mas ainda não há novas mensagens neste chamado."
                  />

                  <SupportMessageComposer
                    value={replyMessage}
                    onChange={setReplyMessage}
                    onSubmit={handleReply}
                    disabled={isSupportTicketClosed(selectedTicket.status)}
                    isSubmitting={isSendingReply}
                    closedMessage="Este chamado foi fechado pela Ledur."
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Abrir novo chamado</DialogTitle>
            <DialogDescription>O primeiro texto enviado será salvo como mensagem inicial da conversa.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ticket-titulo">Título</Label>
              <Input id="ticket-titulo" value={newTicketTitle} onChange={(event) => setNewTicketTitle(event.target.value)} maxLength={120} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Obra relacionada</Label>
                <Select
                  value={newTicketObraId}
                  onValueChange={(value) => {
                    setNewTicketObraId(value);
                    // A new construction is a commercial matter.
                    if (value === NOVA_OBRA) setNewTicketCategory("comercial");
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {obras.map((obra) => (
                      <SelectItem key={obra.id} value={obra.id}>{obra.nome}</SelectItem>
                    ))}
                    <SelectItem value={NOVA_OBRA}>{NOVA_OBRA_LABEL}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select
                  value={novaObraSelecionada ? "comercial" : newTicketCategory}
                  onValueChange={(value: SupportTicketCategory) => setNewTicketCategory(value)}
                  disabled={novaObraSelecionada}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {novaObraSelecionada ? (
              <p className="-mt-2 text-sm text-muted-foreground">Conte para a Ledur sobre a nova obra: a equipe comercial entra em contato.</p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="ticket-descricao">Descrição inicial</Label>
              <Textarea id="ticket-descricao" value={newTicketDescription} onChange={(event) => setNewTicketDescription(event.target.value)} rows={6} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreatingTicket}>Cancelar</Button>
              <Button onClick={() => void handleCreateTicket()} disabled={isCreatingTicket}>
                {isCreatingTicket ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Criar chamado
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ResponsiveLayout>
  );
};

export default Atendimento;
