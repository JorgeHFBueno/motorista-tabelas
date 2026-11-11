import { useEffect, useMemo, useState } from "react";
import { Building2, Camera, FileText, LifeBuoy, Newspaper, Truck, Wallet } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import CartaoInicio, { Etiqueta } from "@/components/dashboard/CartaoInicio";
import { useTelasComNovidade } from "@/components/layout/navegacao";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useClientObraOverview } from "@/hooks/useClientObraOverview";
import { usePublicNoticias } from "@/hooks/useNoticias";
import { useClientTickets } from "@/hooks/support/useClientTickets";
import { useFinancialOverview } from "@/lib/financas/financas.queries";
import type { FinancialOverviewUpcomingInstallment } from "@/lib/financas/financas.types";
import { categoriaLabel, useDocumentosList } from "@/lib/documentos/documentos";
import { useFotosList } from "@/lib/fotos/fotos";
import { deriveFaseProgress } from "@/lib/obraStatus";
import { toMillis, urlDoArquivo } from "@/lib/portal";
import { NEWS_CATEGORY_LABELS } from "@/types/noticias";
import { cn } from "@/lib/utils";

// Início: one card per area of the portal, each with a summary of the active contract; the card opens the screen.

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (millis: number) =>
  millis ? new Date(millis).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const diaMes = (millis: number) => (millis ? new Date(millis).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const horaMinuto = (millis: number) => new Date(millis).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const Linhas = ({ n = 2 }: { n?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: n }).map((_, i) => (
      <Skeleton key={i} className={cn("h-4", i % 2 ? "w-2/3" : "w-full")} />
    ))}
  </div>
);

const Item = ({ titulo, detalhe }: { titulo: string; detalhe: string }) => (
  <div className="min-w-0 rounded-xl bg-muted/70 px-3 py-2.5 text-sm">
    <p className="truncate font-semibold text-primary">{titulo}</p>
    <p className="truncate text-muted-foreground">{detalhe}</p>
  </div>
);

const Vazio = ({ children }: { children: string }) => <p className="text-sm text-muted-foreground">{children}</p>;

// Days from today to the due date (calendar days, local time).
const diasAte = (millis: number) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(millis);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};

const etiquetaDaParcela = (parcela: FinancialOverviewUpcomingInstallment) => {
  if (parcela.status === "rejeitado") return <Etiqueta tom="vermelho">Comprovante recusado</Etiqueta>;
  if (parcela.status === "comprovante_enviado") return <Etiqueta tom="azul">Em análise</Etiqueta>;
  const vencimento = toMillis(parcela.vencimento);
  if (!vencimento) return null;
  const dias = diasAte(vencimento);
  if (dias < 0) return <Etiqueta tom="vermelho">Vencida</Etiqueta>;
  if (dias === 0) return <Etiqueta tom="laranja">Vence hoje</Etiqueta>;
  if (dias === 1) return <Etiqueta tom="laranja">Vence amanhã</Etiqueta>;
  if (dias <= 7) return <Etiqueta tom="laranja">Vence em {dias} dias</Etiqueta>;
  return null;
};

const Index = () => {
  const { userDoc } = useAuth();
  const { activeObraId, obra, statusData, faseSummaries, progressData, status, isLoading: carregandoObra } = useClientObraOverview();
  const obraId = activeObraId ?? undefined;
  const novidades = useTelasComNovidade();

  const financas = useFinancialOverview(obraId);
  const documentos = useDocumentosList(activeObraId);
  const fotos = useFotosList(activeObraId);
  const noticias = usePublicNoticias();
  const { tickets, isLoading: carregandoChamados } = useClientTickets(userDoc?.documentos ?? []);

  const chamados = useMemo(() => tickets.filter((ticket) => ticket.obraId === activeObraId), [tickets, activeObraId]);
  const chamadosAbertos = chamados.filter((ticket) => ticket.status !== "resolvido" && ticket.status !== "fechado");
  const chamadoComResposta = chamados.find((ticket) => ticket.naoLidasCliente > 0);
  const chamadoEmDestaque = chamadoComResposta ?? chamadosAbertos[0] ?? chamados[0];

  const ultimasNoticias = useMemo(
    () =>
      Object.values(noticias.data)
        .flat()
        .sort((a, b) => toMillis(b.publicadoEm) - toMillis(a.publicadoEm))
        .slice(0, 3),
    [noticias.data],
  );

  // Download link of the latest photo (asked at read time, like the Fotos screen).
  const ultimaFoto = fotos.data?.[0];
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    setUrlFoto(null);
    if (ultimaFoto?.arquivo) urlDoArquivo(ultimaFoto.arquivo).then((url) => ativo && setUrlFoto(url ?? null));
    return () => {
      ativo = false;
    };
  }, [ultimaFoto?.id, ultimaFoto?.arquivo]);

  const primeiroNome = (userDoc?.nome ?? "").trim().split(/\s+/)[0];
  const detalhesObra = [obra?.nome, obra?.local, obra?.numeroContrato ? `Contrato ${obra.numeroContrato}` : null].filter(Boolean).join(" · ");
  const equipe = obra?.equipe?.chegada
    ? { texto: "Equipe chegou na obra", em: toMillis(obra.equipe.chegada.dataHora) }
    : obra?.equipe?.saida
      ? { texto: "Equipe saiu para a obra", em: toMillis(obra.equipe.saida.dataHora) }
      : null;
  const resumo = financas.data;
  const percentualPago = resumo && resumo.valorTotalContrato > 0 ? Math.round((resumo.valorPago / resumo.valorTotalContrato) * 100) : 0;

  return (
    <ResponsiveLayout headerTitle="Início" headerSubtitle="Visão geral da sua obra">
      <div className="space-y-5 px-4 py-6 lg:px-8 lg:py-8">
        <div>
          <h2 className="text-2xl font-bold text-primary">{primeiroNome ? `Olá, ${primeiroNome}` : "Olá"}</h2>
          {detalhesObra ? <p className="mt-1 text-sm text-muted-foreground">{detalhesObra}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <CartaoInicio
            para="/obra"
            tom="azul"
            icone={Building2}
            titulo="Obra"
            subtitulo={toMillis(statusData?.atualizadoEm) ? `Atualizado em ${diaMes(toMillis(statusData?.atualizadoEm))}` : "Andamento por etapa"}
            etiqueta={faseSummaries.length ? <Etiqueta tom="azul">{status.label}</Etiqueta> : null}
            rodape="Ver andamento da obra"
            className="md:col-span-2"
          >
            {carregandoObra ? (
              <Linhas n={4} />
            ) : faseSummaries.length === 0 ? (
              <Vazio>O andamento aparece aqui assim que a Ledur cadastrar as etapas da obra.</Vazio>
            ) : (
              <div className="flex items-center gap-5">
                <div
                  className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(hsl(var(--secondary)) ${progressData.progress}%, hsl(var(--muted)) 0)` }}
                >
                  <span className="grid h-[88px] w-[88px] place-items-center rounded-full bg-card text-2xl font-bold text-primary">
                    {progressData.progress}%
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {faseSummaries.map(({ fase }) => {
                    const { progress } = deriveFaseProgress(fase);
                    return (
                      <div key={fase.id} className="grid grid-cols-[84px_1fr_40px] items-center gap-2 text-sm">
                        <span className="truncate">{fase.nome}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-secondary" style={{ width: `${progress}%` }} />
                        </div>
                        <b className="text-right text-xs text-primary">{progress}%</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {equipe?.em ? (
              <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
                <Truck className="h-4 w-4 shrink-0" />
                {equipe.texto} em {diaMes(equipe.em)}, às {horaMinuto(equipe.em)}
              </div>
            ) : null}
          </CartaoInicio>

          <CartaoInicio
            para="/financas"
            tom="laranja"
            icone={Wallet}
            titulo="Finanças"
            subtitulo={resumo?.quantidadeParcelas ? `${resumo.quantidadePagas} de ${resumo.quantidadeParcelas} parcelas pagas` : "Parcelas e boletos"}
            etiqueta={
              resumo?.proximaParcela
                ? etiquetaDaParcela(resumo.proximaParcela)
                : resumo?.quantidadeParcelas
                  ? <Etiqueta tom="verde">Tudo pago</Etiqueta>
                  : null
            }
            rodape="Ver boleto e parcelas"
          >
            {financas.isLoading ? (
              <Linhas n={3} />
            ) : financas.isError ? (
              <Vazio>Não foi possível carregar as finanças agora.</Vazio>
            ) : !resumo?.quantidadeParcelas ? (
              <Vazio>Nenhuma parcela cadastrada ainda.</Vazio>
            ) : (
              <>
                {resumo.proximaParcela ? (
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Próxima parcela{toMillis(resumo.proximaParcela.vencimento) ? ` · ${dataCurta(toMillis(resumo.proximaParcela.vencimento))}` : ""}
                    </p>
                    <p className="text-2xl font-bold text-primary">{moeda.format(resumo.proximaParcela.valor)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Todas as parcelas estão pagas.</p>
                )}
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${percentualPago}%` }} />
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {moeda.format(resumo.valorPago)} pagos de {moeda.format(resumo.valorTotalContrato)}
                  </p>
                </div>
              </>
            )}
          </CartaoInicio>

          <CartaoInicio
            para="/documentos"
            tom="marinho"
            icone={FileText}
            titulo="Documentos"
            subtitulo={documentos.data ? `${documentos.data.length} ${documentos.data.length === 1 ? "documento" : "documentos"}` : undefined}
            etiqueta={novidades.has("/documentos") ? <Etiqueta tom="laranja">Novo</Etiqueta> : null}
            rodape="Ver documentos"
          >
            {documentos.isLoading ? (
              <Linhas />
            ) : !documentos.data?.length ? (
              <Vazio>Os documentos do contrato aparecem aqui quando a Ledur publicar.</Vazio>
            ) : (
              documentos.data
                .slice(0, 2)
                .map((documento) => (
                  <Item key={documento.id} titulo={documento.titulo} detalhe={`${categoriaLabel(documento.categoria)} · ${dataCurta(toMillis(documento.criadoEm))}`} />
                ))
            )}
          </CartaoInicio>

          <CartaoInicio
            para="/fotos"
            tom="verde"
            icone={Camera}
            titulo="Fotos"
            subtitulo={
              fotos.data?.length
                ? `${fotos.data.length} ${fotos.data.length === 1 ? "foto" : "fotos"} · última em ${diaMes(toMillis(ultimaFoto?.criadoEm))}`
                : undefined
            }
            etiqueta={novidades.has("/fotos") ? <Etiqueta tom="laranja">Nova</Etiqueta> : null}
            rodape="Ver fotos"
          >
            {fotos.isLoading ? (
              <Skeleton className="aspect-[16/7] w-full rounded-xl" />
            ) : !ultimaFoto ? (
              <Vazio>As fotos da obra aparecem aqui quando a equipe enviar.</Vazio>
            ) : urlFoto ? (
              <img src={urlFoto} alt="Última foto da obra" className="aspect-[16/7] w-full rounded-xl object-cover" />
            ) : (
              <Skeleton className="aspect-[16/7] w-full rounded-xl" />
            )}
          </CartaoInicio>

          <CartaoInicio
            para="/atendimento"
            tom="roxo"
            icone={LifeBuoy}
            titulo="Suporte"
            subtitulo={
              chamadosAbertos.length
                ? `${chamadosAbertos.length} ${chamadosAbertos.length === 1 ? "chamado em andamento" : "chamados em andamento"}`
                : "Fale com a Ledur"
            }
            etiqueta={chamadoComResposta ? <Etiqueta tom="laranja">Nova resposta</Etiqueta> : null}
            rodape={chamados.length ? "Abrir chamados" : "Abrir um chamado"}
          >
            {carregandoChamados ? (
              <Linhas />
            ) : !chamadoEmDestaque ? (
              <Vazio>Precisa falar com a Ledur? Abra um chamado e acompanhe a conversa por aqui.</Vazio>
            ) : (
              <Item
                titulo={`${chamadoEmDestaque.ultimaMensagemPorTipo === "equipe" ? "Ledur" : "Você"} · ${chamadoEmDestaque.titulo}`}
                detalhe={chamadoEmDestaque.ultimaMensagemResumo || chamadoEmDestaque.descricaoInicial}
              />
            )}
          </CartaoInicio>

          <CartaoInicio
            para="/noticias"
            tom="cinza"
            icone={Newspaper}
            titulo="Notícias"
            subtitulo="Ledur e setor"
            rodape="Ver notícias"
            className="md:col-span-2 lg:col-span-3"
          >
            {noticias.isLoading ? (
              <Linhas />
            ) : ultimasNoticias.length === 0 ? (
              <Vazio>Nenhuma notícia publicada no momento.</Vazio>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                {ultimasNoticias.map((noticia) => (
                  <Item
                    key={noticia.id}
                    titulo={noticia.titulo}
                    detalhe={`${NEWS_CATEGORY_LABELS[noticia.categoria]} · ${dataCurta(toMillis(noticia.publicadoEm))}`}
                  />
                ))}
              </div>
            )}
          </CartaoInicio>
        </div>
      </div>
    </ResponsiveLayout>
  );
};

export default Index;
