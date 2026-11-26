import { Fragment, useEffect, useRef, useState, type DragEvent as DragEventReact } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { coordenadaCurta, linkDoMapa } from '../cronograma-logistica/domain/local';
import type { LoteObra } from './obrasDomain';
import {
  agruparPorTipo,
  comPdf,
  daParte,
  ehPdfDeGrupo,
  etapaPlannix,
  maisRecente,
  opcoesAoSoltar,
  PARTES_DO_PDF,
  resumoEtapas,
  revisoes,
  semProjeto,
  totalPdfs,
  type ModoPdf,
  type ParteDoPdf,
  type PdfPreFabricado,
  type PreFabricado,
} from './preFabricados';
import { minutosSemNoticia, podeCancelar, podeDestravar, podePedir, STATUS_DA_SINCRONIZACAO, type SincronizacaoPlannix } from './sincronizacaoPlannix';
import './listaLotes.css';

/**
 * LOTEs do detalhe da obra em lista: LOTE | Pré-Fabricados (Tipo, PDF, Status, Revisões), em três níveis:
 * - grupo: o produto (Pilar, Viga…), que abre e fecha; recolhido, resume as peças de todos os itens;
 * - item: a peça do projeto (ex.: P01 com 10 peças), com o resumo das etapas (ex.: 3 Corte e dobra · 4 Acabada);
 *   abre para mostrar os códigos de controle, cada um com a etapa e a data;
 * - sem projeto no Plannix, o item é a linha do Lançamento Final ("aguardando projeto").
 * PDF: os nomes dos desenhos no Plannix e o PDF atual de cada parte (só o ícone e a revisão; o nome fica nas Revisões,
 * com quem anexou e quando). Com `acoesPdf.anexar` (quem edita), o ícone "Anexar o PDF" (ou soltar o arquivo na
 * célula): sem PDF, anexa; com PDF, pergunta se é Revisão (anexa uma nova), Substituição (troca a atual sem nova
 * revisão) ou Console (2026-11-25); com `acoesPdf.excluir`, excluir nas Revisões. Item sem projeto no Plannix não recebe PDF (o item muda de nome
 * quando o projeto é cadastrado). Grupo com PDF único (Vigotes e Guarda Roda): o PDF e as Revisões ficam na linha do
 * grupo, um para todos os itens, e os itens não têm PDF.
 * Console: o segundo PDF do item, com revisões próprias; Revisão e Substituição de um mantêm o outro. Arrastar: ao
 * arrastar um arquivo sobre a página, cada célula de PDF que aceita PDF vira uma área de soltar.
 * Sincronizar com o Plannix (2026-11-25, com `sincronizar`): no LOTE ligado ao Plannix, o status da fila do robô, "Sincronizar"
 * (pede; quem edita), "Ver prévia" (o que o robô vai gravar, com Aprovar e gravar) e Cancelar (antes de gravar). Com o
 * robô, o recado dele aparece abaixo; mais de 30 minutos sem notícia, o aviso e, para o adm2, "Marcar como erro".
 * `itens: null` = sem pré-fabricados para mostrar; `aviso` diz o motivo (carregando, sem Nº Pedido, pedido sem obra no Plannix, erro).
 */

export type LoteComPreFabricados = LoteObra & {
  itens: PreFabricado[] | null;
  aviso?: string;
  origem?: string;
  /** PDFs únicos dos grupos (pdfsDosGrupos), pela chave do grupo. */
  pdfsDosGrupos?: Record<string, PdfPreFabricado[]>;
  /** A sincronização com o Plannix do LOTE (a última pedida). */
  sincronizacao?: SincronizacaoPlannix;
};
export type AcoesSincronizar = {
  /** Sem `podeEditar` (área em "ver"), só o status e a prévia. */
  podeEditar: boolean;
  pedir: (lote: string) => void;
  aprovar: (sincronizacao: SincronizacaoPlannix) => void;
  cancelar: (sincronizacao: SincronizacaoPlannix) => void;
  /** Só o adm2: marcar como erro a que ficou mais de 30 minutos sem notícia do robô. */
  destravar?: (sincronizacao: SincronizacaoPlannix) => void;
};
export type { ModoPdf };
/** Onde gravar: o LOTE, o item (ou a chave do grupo com PDF único) e a parte do PDF. */
export type AlvoPdf = { lote: string; item: string; parte: ParteDoPdf };
export type AcoesPdf = {
  abrir: (pdf: PdfPreFabricado) => void;
  /** Sem anexar/excluir (área em "ver"), só abre e mostra as Revisões. */
  anexar?: (alvo: AlvoPdf, modo: ModoPdf, arquivo: File) => void;
  excluir?: (pdf: PdfPreFabricado) => void;
};
/** O que a janela de Revisões mostra: um item, todos os itens de um grupo de Tipo recolhido ou o PDF único do grupo. */
type AlvoRevisoes = { lote: string; itens: string[]; titulo: string };

const dataHora = (data: Date) => data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const ehPdf = (arquivo: File) => arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf');
const temArquivo = (event: { dataTransfer: DataTransfer | null }) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
/** Nome do desenho do Plannix na célula: as 5 primeiras letras, como o "Rev. N" do PDF; o nome inteiro no tooltip e nas Revisões. */
const nomeCurto = (nome: string) => (nome.length > 5 ? `${nome.slice(0, 5)}…` : nome);
const tamanhoTexto = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

function BotaoRevisoes({ quantidade, rotulo, onClick }: { quantidade: number; rotulo: string; onClick: () => void }) {
  return (
    <Tooltip title="Revisões">
      <IconButton size="small" onClick={onClick} aria-label={rotulo}>
        <Badge badgeContent={quantidade} color="primary">
          <HistoryIcon fontSize="small" />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}

/** Status de um item ou grupo: quantas peças há em cada etapa; as sem projeto aparecem como "aguardando projeto". */
function ResumoEtapas({ itens }: { itens: PreFabricado[] }) {
  const etapas = resumoEtapas(itens);
  const aguardando = semProjeto(itens);
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="center">
      {etapas.map((etapa) => (
        <Chip key={etapa.rotulo} size="small" label={`${etapa.quantidade} ${etapa.rotulo}`} color={etapa.cor} variant={etapa.cor === 'default' ? 'outlined' : 'filled'} />
      ))}
      {aguardando > 0 && <Chip size="small" variant="outlined" label={`${aguardando} aguardando projeto`} />}
    </Stack>
  );
}

const dataPlannix = (data: string | null) => {
  const d = data ? new Date(data) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
};

/** Coluna LOTE: status do Friday no rótulo; com coordenada (coluna Coordenada do subitem), abre o Google Maps com o pino. */
/** Quem pediu e quando, e a mensagem do robô (o tooltip do status). */
function detalheDaSincronizacao(s: SincronizacaoPlannix) {
  return [
    s.pedidoEm && `Pedida por ${s.pedidoPor} em ${dataHora(s.pedidoEm)}`,
    s.aprovadoPor && `Aprovada por ${s.aprovadoPor}`,
    s.atualizadoEm && `Atualizada em ${dataHora(s.atualizadoEm)}`,
    s.mensagem,
  ].filter(Boolean).join(' · ');
}

function ChipLote({ lote }: { lote: LoteObra }) {
  const rotulo = lote.status ? `${lote.nome} · ${lote.status}` : lote.nome;
  return lote.coordenada ? (
    <Tooltip title="Abrir no Google Maps">
      <Chip
        component="a"
        href={linkDoMapa(lote.coordenada)}
        target="_blank"
        rel="noopener noreferrer"
        clickable
        icon={<PlaceOutlinedIcon />}
        label={`${rotulo} · ${coordenadaCurta(lote.coordenada)}`}
        variant="outlined"
        color="primary"
      />
    </Tooltip>
  ) : <Chip label={rotulo} variant="outlined" />;
}

export default function ListaLotes({ lotes, acoesPdf, sincronizar }: { lotes: LoteComPreFabricados[]; acoesPdf?: AcoesPdf; sincronizar?: AcoesSincronizar }) {
  const [historico, setHistorico] = useState<AlvoRevisoes | null>(null);
  // LOTE (chave) com a janela da prévia aberta; a sincronização é lida a cada render (muda ao vivo).
  const [previaDe, setPreviaDe] = useState<string | null>(null);
  const [destravarDe, setDestravarDe] = useState<SincronizacaoPlannix | null>(null);
  // Relógio do aviso "sem notícia do robô": anda a cada minuto enquanto algum LOTE está com o robô.
  const [agora, setAgora] = useState(() => new Date());
  const comORobo = lotes.some((lote) => minutosSemNoticia(lote.sincronizacao, new Date()) !== null);
  useEffect(() => {
    if (!comORobo) return undefined;
    const relogio = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(relogio);
  }, [comORobo]);
  const [excluir, setExcluir] = useState<PdfPreFabricado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Grupos recolhidos ("lote:grupo"; começam abertos) e itens abertos ("lote:item"; começam fechados, com as peças).
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const [itensAbertos, setItensAbertos] = useState<Set<string>>(() => new Set());
  const entrada = useRef<HTMLInputElement>(null);
  const anexarEm = useRef<{ alvo: Omit<AlvoPdf, 'parte'>; pdfs: PdfPreFabricado[]; rotulo: string } | null>(null);
  // Arrastar e soltar: há um arquivo sendo arrastado sobre a página; a célula sob ele; o PDF solto sobre um item com PDF.
  const [arrastando, setArrastando] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);
  const [solto, setSolto] = useState<{ alvo: Omit<AlvoPdf, 'parte'>; arquivo: File; rotulo: string; pdfs: PdfPreFabricado[] } | null>(null);
  const podeAnexar = Boolean(acoesPdf?.anexar);

  // Na página toda: liga as áreas de soltar enquanto um arquivo é arrastado e impede que o navegador abra o arquivo
  // solto fora delas.
  useEffect(() => {
    if (!podeAnexar) return undefined;
    let dentro = 0;
    const entrar = (event: DragEvent) => { if (temArquivo(event)) { dentro += 1; setArrastando(true); } };
    const sair = (event: DragEvent) => {
      if (!temArquivo(event)) return;
      dentro = Math.max(0, dentro - 1);
      if (!dentro) { setArrastando(false); setSobre(null); }
    };
    const passar = (event: DragEvent) => {
      if (!temArquivo(event) || event.defaultPrevented) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    const terminar = (event: DragEvent) => {
      if (temArquivo(event)) event.preventDefault();
      dentro = 0;
      setArrastando(false);
      setSobre(null);
    };
    window.addEventListener('dragenter', entrar);
    window.addEventListener('dragleave', sair);
    window.addEventListener('dragover', passar);
    window.addEventListener('drop', terminar);
    window.addEventListener('dragend', terminar);
    return () => {
      window.removeEventListener('dragenter', entrar);
      window.removeEventListener('dragleave', sair);
      window.removeEventListener('dragover', passar);
      window.removeEventListener('drop', terminar);
      window.removeEventListener('dragend', terminar);
    };
  }, [podeAnexar]);

  const alternar = (set: typeof setRecolhidos) => (chave: string) => set((atuais) => {
    const proximos = new Set(atuais);
    if (!proximos.delete(chave)) proximos.add(chave);
    return proximos;
  });
  const alternarGrupo = alternar(setRecolhidos);
  const alternarItem = alternar(setItensAbertos);

  function escolherPdf(alvo: Omit<AlvoPdf, 'parte'>, pdfs: PdfPreFabricado[], rotulo: string) {
    anexarEm.current = { alvo, pdfs, rotulo };
    entrada.current?.click();
  }

  /** PDF escolhido ou solto: sem PDF, anexa; com PDF, abre a pergunta (Revisão, Substituição ou Console). */
  function decidir(alvo: Omit<AlvoPdf, 'parte'>, pdfs: PdfPreFabricado[], rotulo: string, arquivo: File) {
    if (!acoesPdf?.anexar) return;
    if (!ehPdf(arquivo)) { setAviso('Só arquivos PDF.'); return; }
    if (!pdfs.length) { acoesPdf.anexar({ ...alvo, parte: 'principal' }, 'anexar', arquivo); return; }
    setSolto({ alvo, arquivo, rotulo, pdfs });
  }

  function anexar(arquivo: File | undefined) {
    const escolha = anexarEm.current;
    if (entrada.current) entrada.current.value = '';
    if (arquivo && escolha) decidir(escolha.alvo, escolha.pdfs, escolha.rotulo, arquivo);
  }

  function soltarPdf(event: DragEventReact<HTMLElement>, alvo: Omit<AlvoPdf, 'parte'>, pdfs: PdfPreFabricado[], rotulo: string) {
    event.preventDefault();
    setSobre(null);
    const arquivos = Array.from(event.dataTransfer.files);
    if (!arquivos[0]) return;
    if (arquivos.length > 1) { setAviso('Solte um PDF por vez.'); return; }
    decidir(alvo, pdfs, rotulo, arquivos[0]);
  }

  const loteHistorico = historico ? lotes.find((lote) => lote.chave === historico.lote) : undefined;
  // Seções da janela: o PDF único do grupo (chave do grupo) ou cada item, com os PDFs de cada um.
  // Os desenhos do Plannix do grupo com PDF único são os de todos os itens dele.
  const itensHistorico = (historico?.itens ?? []).flatMap((id) => {
    if (ehPdfDeGrupo(id)) {
      const itensDoGrupo = agruparPorTipo(loteHistorico?.itens ?? []).find((grupo) => grupo.pdf === id)?.itens ?? [];
      return [{ id, tipo: historico?.titulo ?? '', pdfs: loteHistorico?.pdfsDosGrupos?.[id] ?? [], desenhos: [...new Set(itensDoGrupo.flatMap((item) => item.desenhos))] }];
    }
    const item = loteHistorico?.itens?.find((existente) => existente.id === id);
    return item ? [{ id, tipo: item.tipo, pdfs: item.pdfs, desenhos: item.desenhos }] : [];
  });

  /**
   * PDF de um item ou do grupo com PDF único: os desenhos do Plannix, o atual de cada parte com PDF (principal e
   * Console; ícone e revisão, o nome no tooltip e nas Revisões) e o ícone "Anexar o PDF". Com um arquivo sendo
   * arrastado, a célula vira área de soltar.
   */
  function celulaPdf(alvo: Omit<AlvoPdf, 'parte'>, pdfs: PdfPreFabricado[], rotulo: string, aceita: boolean, desenhos: string[] = []) {
    const editar = Boolean(acoesPdf?.anexar) && aceita;
    const chave = `${alvo.lote}:${alvo.item}`;
    const comPdf = PARTES_DO_PDF.map((parte) => ({ ...parte, pdfs: daParte(pdfs, parte.parte) })).filter((parte) => parte.pdfs.length > 0);
    return (
      <TableCell
        onDragOver={editar ? (event) => {
          if (!temArquivo(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (sobre !== chave) setSobre(chave);
        } : undefined}
        onDrop={editar ? (event) => soltarPdf(event, alvo, pdfs, rotulo) : undefined}
      >
        <Box className={editar && arrastando ? `obra-lotes__soltar${sobre === chave ? ' obra-lotes__soltar--sobre' : ''}` : undefined}>
          {desenhos.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="center" sx={{ mb: 0.5 }}>
              {desenhos.map((nome) => (
                <Tooltip key={nome} title={`Desenho no Plannix (a API só informa o nome): ${nome}`}>
                  <Chip size="small" icon={<PictureAsPdfOutlinedIcon />} label={nomeCurto(nome)} variant="outlined" aria-label={`Desenho no Plannix: ${nome}`} />
                </Tooltip>
              ))}
            </Stack>
          )}
          <Stack spacing={0.5} alignItems="center">
            {comPdf.map(({ parte, rotulo: nomeParte, pdfs: daParteAtual }) => {
              const atual = maisRecente(daParteAtual)!;
              return (
                <Stack key={parte} direction="row" spacing={0.5} alignItems="center" sx={{ whiteSpace: 'nowrap' }}>
                  {parte === 'console' && <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{nomeParte}</Typography>}
                  <Tooltip title={`${parte === 'console' ? 'Console · ' : ''}${atual.nome} · ${dataHora(atual.anexadoEm)} · ${atual.anexadoPor}`}>
                    <Chip
                      size="small"
                      icon={<PictureAsPdfOutlinedIcon />}
                      label={`Rev. ${daParteAtual.length - 1}`}
                      onClick={acoesPdf ? () => acoesPdf.abrir(atual) : undefined}
                      aria-label={`Abrir ${atual.nome}`}
                      variant="outlined"
                      color="error"
                    />
                  </Tooltip>
                </Stack>
              );
            })}
            {editar && (
              <Tooltip title="Anexar o PDF">
                <IconButton size="small" color="primary" onClick={() => escolherPdf(alvo, pdfs, rotulo)} aria-label={`Anexar o PDF ao ${rotulo}`}>
                  <UploadFileOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
      </TableCell>
    );
  }

  /** Status da fila do robô e os botões do LOTE ligado ao Plannix. */
  function blocoSincronizar(lote: LoteComPreFabricados) {
    const s = lote.sincronizacao;
    const status = s ? STATUS_DA_SINCRONIZACAO[s.status] : null;
    const editar = Boolean(sincronizar?.podeEditar);
    return (
      <Stack spacing={0.75} alignItems="center" sx={{ mt: 1.25 }}>
        {s && status && (
          // Tooltip em cima: embaixo ficam os botões.
          <Tooltip title={detalheDaSincronizacao(s)} placement="top">
            <Chip size="small" icon={<SyncIcon />} label={status.rotulo} color={status.cor} variant={status.cor === 'default' ? 'outlined' : 'filled'} />
          </Tooltip>
        )}
        {s?.mensagem && ['erro', 'simulando', 'gravando'].includes(s.status) && (
          <Typography variant="caption" color={s.status === 'erro' ? 'error' : 'text.secondary'} sx={{ overflowWrap: 'anywhere' }}>{s.mensagem}</Typography>
        )}
        {s && podeDestravar(s, agora) && (
          <Typography variant="caption" color="warning.dark">{`Sem notícia do robô há ${minutosSemNoticia(s, agora)} min`}</Typography>
        )}
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="center">
          {s?.previa && <Button size="small" onClick={() => setPreviaDe(lote.chave)}>Ver prévia</Button>}
          {editar && podePedir(s) && (
            <Tooltip title="Pede ao robô que leve os PDFs deste LOTE ao Plannix: ele simula, mostra a prévia e só grava depois da aprovação">
              <Button size="small" variant="outlined" startIcon={<SyncIcon />} onClick={() => sincronizar?.pedir(lote.chave)} aria-label={`Sincronizar o ${lote.nome} com o Plannix`}>
                Sincronizar
              </Button>
            </Tooltip>
          )}
          {editar && s && podeCancelar(s) && (
            <Button size="small" color="inherit" onClick={() => sincronizar?.cancelar(s)} aria-label={`Cancelar a sincronização do ${lote.nome}`}>Cancelar</Button>
          )}
          {sincronizar?.destravar && s && podeDestravar(s, agora) && (
            <Button size="small" color="error" onClick={() => setDestravarDe(s)} aria-label={`Marcar como erro a sincronização do ${lote.nome}`}>Marcar como erro</Button>
          )}
        </Stack>
      </Stack>
    );
  }
  const lotePrevia = previaDe ? lotes.find((lote) => lote.chave === previaDe) : undefined;
  const sincronizacaoPrevia = lotePrevia?.sincronizacao;

  return (
    <>
      <TableContainer className="obra-lotes">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2}>LOTE</TableCell>
              <TableCell colSpan={4} align="center" className="obra-lotes__grupo">Pré-Fabricados</TableCell>
            </TableRow>
            <TableRow>
              <TableCell align="center">Tipo</TableCell>
              <TableCell>PDF</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Revisões</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lotes.map((lote) => {
              // Linhas visíveis do LOTE: cada grupo; se aberto, os itens dele; de cada item aberto, as peças.
              const linhas = agruparPorTipo(lote.itens ?? []).flatMap((grupo) => {
                const chave = `${lote.chave}:${grupo.nome}`;
                const aberto = !recolhidos.has(chave);
                return [
                  { tipo: 'grupo' as const, chave, nome: grupo.nome, pdf: grupo.pdf, itens: grupo.itens, aberto },
                  ...(aberto ? grupo.itens.flatMap((item) => {
                    const chaveItem = `${lote.chave}:${item.id}`;
                    const itemAberto = itensAbertos.has(chaveItem);
                    return [
                      { tipo: 'item' as const, chave: chaveItem, item, aberto: itemAberto, pdfNoGrupo: Boolean(grupo.pdf) },
                      ...(itemAberto ? item.pecas.map((peca) => ({ tipo: 'peca' as const, chave: `${chaveItem}:${peca.codigo}`, peca })) : []),
                    ];
                  }) : []),
                ];
              });
              const celulaLote = (
                <TableCell rowSpan={Math.max(linhas.length, 1)} className="obra-lotes__lote">
                  <ChipLote lote={lote} />
                  {lote.origem && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>{lote.origem}</Typography>}
                  {sincronizar && lote.itens && blocoSincronizar(lote)}
                </TableCell>
              );
              if (!linhas.length) {
                return (
                  <TableRow key={lote.chave} className="obra-lotes__fim">
                    {celulaLote}
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        {lote.itens ? 'Nenhum pré-fabricado neste LOTE no Plannix.' : lote.aviso ?? 'Sem pré-fabricados.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              }
              return (
                <Fragment key={lote.chave}>
                  {linhas.map((linha, index) => {
                    const classe = index === linhas.length - 1 ? 'obra-lotes__fim' : undefined;
                    if (linha.tipo === 'grupo') {
                      return (
                        <TableRow key={linha.chave} className={`obra-lotes__tipo ${classe ?? ''}`}>
                          {index === 0 && celulaLote}
                          <TableCell align="center">
                            <Button
                              size="small"
                              color="inherit"
                              onClick={() => alternarGrupo(linha.chave)}
                              startIcon={linha.aberto ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                              aria-expanded={linha.aberto}
                              sx={{ fontWeight: 700, textTransform: 'none' }}
                            >
                              {linha.nome}
                              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>{linha.itens.length}</Typography>
                            </Button>
                          </TableCell>
                          {/* PDF único do grupo: o PDF e as Revisões ficam sempre na linha do grupo; recolhido, também o Status. */}
                          {linha.pdf ? (
                            <>
                              {celulaPdf({ lote: lote.chave, item: linha.pdf }, lote.pdfsDosGrupos?.[linha.pdf] ?? [], `${linha.nome} do ${lote.nome}`, true)}
                              <TableCell>{!linha.aberto && <ResumoEtapas itens={linha.itens} />}</TableCell>
                              <TableCell align="center">
                                {(acoesPdf?.anexar || (lote.pdfsDosGrupos?.[linha.pdf]?.length ?? 0) > 0 || linha.itens.some((item) => item.desenhos.length > 0)) && (
                                  <BotaoRevisoes
                                    quantidade={lote.pdfsDosGrupos?.[linha.pdf]?.length ?? 0}
                                    rotulo={`Revisões de ${linha.nome} do ${lote.nome}`}
                                    onClick={() => setHistorico({ lote: lote.chave, itens: [linha.pdf!], titulo: linha.nome })}
                                  />
                                )}
                              </TableCell>
                            </>
                          ) : linha.aberto ? <TableCell colSpan={3} /> : (
                            // Recolhido, o grupo resume os itens: quantos têm PDF, as etapas de todas as peças e as revisões.
                            <>
                              <TableCell>
                                {(acoesPdf?.anexar || totalPdfs(linha.itens) > 0) && <Typography variant="body2" color="text.secondary">{`${comPdf(linha.itens)} de ${linha.itens.length} com PDF`}</Typography>}
                              </TableCell>
                              <TableCell><ResumoEtapas itens={linha.itens} /></TableCell>
                              <TableCell align="center">
                                {(acoesPdf?.anexar || totalPdfs(linha.itens) > 0 || linha.itens.some((item) => item.desenhos.length > 0)) && (
                                  <BotaoRevisoes
                                    quantidade={totalPdfs(linha.itens)}
                                    rotulo={`Revisões de ${linha.nome} do ${lote.nome}`}
                                    onClick={() => setHistorico({ lote: lote.chave, itens: linha.itens.map((item) => item.id), titulo: linha.nome })}
                                  />
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    }
                    if (linha.tipo === 'peca') {
                      const etapa = etapaPlannix(linha.peca.etapa);
                      return (
                        <TableRow key={linha.chave} className={`obra-lotes__peca ${classe ?? ''}`}>
                          {index === 0 && celulaLote}
                          <TableCell align="center" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{linha.peca.codigo}</TableCell>
                          <TableCell />
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                              <Chip size="small" label={etapa.rotulo} color={etapa.cor} variant={etapa.cor === 'default' ? 'outlined' : 'filled'} />
                              <Typography variant="caption" color="text.secondary">{dataPlannix(linha.peca.data)}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    }
                    const { item } = linha;
                    const alvo = { lote: lote.chave, item: item.id };
                    const rotuloItem = `${item.tipo || 'pré-fabricado sem tipo'} do ${lote.nome}`;
                    return (
                      <TableRow key={linha.chave} className={classe}>
                        {index === 0 && celulaLote}
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          {item.pecas.length ? (
                            <Button
                              size="small"
                              color="inherit"
                              onClick={() => alternarItem(linha.chave)}
                              startIcon={linha.aberto ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                              aria-expanded={linha.aberto}
                              aria-label={`${linha.aberto ? 'Fechar' : 'Abrir'} as peças de ${item.tipo}`}
                              sx={{ fontWeight: 600, textTransform: 'none' }}
                            >
                              {item.tipo}
                              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>{`${item.quantidade} ${item.quantidade === 1 ? 'peça' : 'peças'}`}</Typography>
                            </Button>
                          ) : (
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {item.tipo || '—'}
                              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>{`${item.quantidade} ${item.quantidade === 1 ? 'peça' : 'peças'}`}</Typography>
                            </Typography>
                          )}
                        </TableCell>
                        {linha.pdfNoGrupo ? <TableCell /> : celulaPdf(alvo, item.pdfs, rotuloItem, item.pecas.length > 0, item.desenhos)}
                        <TableCell><ResumoEtapas itens={[item]} /></TableCell>
                        <TableCell align="center">
                          {!linha.pdfNoGrupo && ((acoesPdf?.anexar && item.pecas.length > 0) || item.pdfs.length > 0 || item.desenhos.length > 0) && (
                            <BotaoRevisoes
                              quantidade={item.pdfs.length}
                              rotulo={`Revisões do ${rotuloItem}`}
                              onClick={() => setHistorico({ lote: lote.chave, itens: [item.id], titulo: item.tipo || 'pré-fabricado sem tipo' })}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => anexar(event.target.files?.[0])} />

      <Dialog open={itensHistorico.length > 0} onClose={() => setHistorico(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revisões</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {loteHistorico?.nome} · {historico?.titulo}
          </Typography>
          {itensHistorico.map((item) => (
            <Box key={item.id} sx={{ mb: 1 }}>
              {/* Grupo recolhido: uma seção por item, com o Tipo de cada um. */}
              {itensHistorico.length > 1 && <Typography sx={{ fontWeight: 700, mt: 1.5 }}>{item.tipo || 'Sem tipo'}</Typography>}
              {item.desenhos.length > 0 && (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>Desenho no Plannix</Typography>
                  <Typography variant="caption" color="text.secondary">A API só informa o nome.</Typography>
                  <List dense disablePadding>
                    {item.desenhos.map((nome) => (
                      <ListItem key={nome} divider>
                        <PictureAsPdfOutlinedIcon color="action" fontSize="small" sx={{ mr: 1.5 }} />
                        <ListItemText primary={nome} primaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }} />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
              {/* Com Console, as revisões de cada parte à parte (cada uma com a sua Rev. 0 e a sua "Atual"). */}
              {item.pdfs.length ? PARTES_DO_PDF.filter(({ parte }) => daParte(item.pdfs, parte).length > 0).map(({ parte, rotulo }, _, partes) => (
                <Fragment key={parte}>
                {(partes.length > 1 || parte === 'console' || item.desenhos.length > 0) && <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>{rotulo}</Typography>}
                <List dense disablePadding>
                  {revisoes(daParte(item.pdfs, parte)).map(({ item: pdf, revisao }, index) => (
                    <ListItem
                      key={pdf.id}
                      divider
                      secondaryAction={acoesPdf?.excluir && (
                        <Tooltip title="Excluir PDF">
                          <IconButton edge="end" onClick={() => setExcluir(pdf)} aria-label={`Excluir ${pdf.nome}`}>
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    >
                      <PictureAsPdfOutlinedIcon color="error" fontSize="small" sx={{ mr: 1.5 }} />
                      <ListItemText
                        primary={(
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="small" label={`Rev. ${revisao}`} variant="outlined" />
                            {acoesPdf
                              ? <Box component="span" className="obra-lotes__link" onClick={() => acoesPdf.abrir(pdf)}>{pdf.nome}</Box>
                              : <span>{pdf.nome}</span>}
                            {index === 0 && <Chip size="small" label="Atual" color="primary" />}
                          </Stack>
                        )}
                        secondary={`Anexado em ${dataHora(pdf.anexadoEm)} por ${pdf.anexadoPor} · ${tamanhoTexto(pdf.tamanho)}`}
                      />
                    </ListItem>
                  ))}
                </List>
                </Fragment>
              )) : <Typography variant="body2" color="text.secondary">Nenhum PDF anexado.</Typography>}
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistorico(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(sincronizacaoPrevia?.previa)} onClose={() => setPreviaDe(null)} fullWidth maxWidth="md">
        <DialogTitle>Prévia da sincronização com o Plannix</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {lotePrevia?.nome}
            {sincronizacaoPrevia && ` · ${STATUS_DA_SINCRONIZACAO[sincronizacaoPrevia.status].rotulo} · ${detalheDaSincronizacao(sincronizacaoPrevia)}`}
          </Typography>
          <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: 13 }}>{sincronizacaoPrevia?.previa}</Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviaDe(null)}>Fechar</Button>
          {sincronizar?.podeEditar && sincronizacaoPrevia?.status === 'previa' && (
            <>
              <Button color="inherit" onClick={() => { sincronizar.cancelar(sincronizacaoPrevia); setPreviaDe(null); }}>Cancelar sincronização</Button>
              <Button variant="contained" onClick={() => { sincronizar.aprovar(sincronizacaoPrevia); setPreviaDe(null); }}>Aprovar e gravar no Plannix</Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(destravarDe)} onClose={() => setDestravarDe(null)} maxWidth="xs">
        <DialogTitle>Marcar como erro?</DialogTitle>
        <DialogContent>
          <Typography>
            O robô está há mais de 30 minutos sem dar notícia em "{destravarDe ? STATUS_DA_SINCRONIZACAO[destravarDe.status].rotulo : ''}". A sincronização
            termina com erro e o LOTE pode ser sincronizado de novo. Se o robô estava gravando, parte pode já estar no Plannix: confira lá antes.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDestravarDe(null)}>Voltar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (destravarDe) sincronizar?.destravar?.(destravarDe);
              setDestravarDe(null);
            }}
          >
            Marcar como erro
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(solto)} onClose={() => setSolto(null)} fullWidth maxWidth="xs">
        <DialogTitle>O que é este PDF?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>
            {solto?.arquivo.name} · {solto?.rotulo}
          </Typography>
          <Stack spacing={1}>
            {solto && opcoesAoSoltar(solto.pdfs).map((opcao) => (
              <Button
                key={`${opcao.modo}:${opcao.parte}`}
                variant="outlined"
                onClick={() => {
                  acoesPdf?.anexar?.({ ...solto.alvo, parte: opcao.parte }, opcao.modo, solto.arquivo);
                  setSolto(null);
                }}
              >
                {opcao.rotulo}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSolto(null)}>Cancelar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(excluir)} onClose={() => setExcluir(null)}>
        <DialogTitle>Excluir PDF?</DialogTitle>
        <DialogContent>
          <Typography>{excluir?.nome} sai das revisões. Não dá para desfazer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExcluir(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (excluir && acoesPdf?.excluir) acoesPdf.excluir(excluir);
              setExcluir(null);
            }}
          >
            Excluir
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setAviso(null)} severity="warning" variant="filled">{aviso}</Alert>
      </Snackbar>
    </>
  );
}
