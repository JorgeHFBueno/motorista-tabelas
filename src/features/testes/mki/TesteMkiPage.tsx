import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
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
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CampoEditavel from '../../obras/CampoEditavelObra';
import { coordenadaCurta, linkDoMapa } from '../../cronograma-logistica/domain/local';
import { useAuth } from '../../../contexts/AuthContext';
import './mki.css';

/**
 * /testes/mki: mock do detalhe da obra (/engenharia/obras/:id) com os LOTEs em lista. Cada LOTE tem os seus
 * Pré-Fabricados, agrupados por Tipo (Pilar 1 e Pilar 2 em "Pilar", que abre e fecha), um por linha: PDF, Status e
 * Revisões (quem anexou cada PDF e quando; permite excluir). Sem PDF, "Anexar PDF"; com PDF, "Substituir" (troca o
 * atual, sem nova revisão) e "Revisão" (anexa uma nova). Os pré-fabricados, o Tipo e o Status chegam por API.
 * Obra, LOTEs e pré-fabricados fictícios em memória: nada vai para o Firestore nem para o Storage.
 */

type PdfLf = { id: string; nome: string; tamanho: number; anexadoEm: Date; anexadoPor: string; url: string | null };
type LfMock = { id: string; tipo: string; status: string; pdfs: PdfLf[] };
type LoteMock = { chave: string; nome: string; status: string; coordenada: { lat: number; lng: number } | null; lfs: LfMock[] };
type Alvo = { lote: string; lf: string };
type ModoPdf = 'anexar' | 'substituir' | 'revisao';
/** O que a janela de Revisões mostra: um item, ou todos os itens de um grupo de Tipo recolhido. */
type AlvoRevisoes = { lote: string; lfs: string[]; titulo: string };

const pdf = (id: string, nome: string, kb: number, quando: string, por: string): PdfLf =>
  ({ id, nome, tamanho: kb * 1024, anexadoEm: new Date(quando), anexadoPor: por, url: null });

const OBRA = {
  nomeObra: 'ARROIO DO TIGRE 112/2026',
  situacao: 'Solicitar ART',
  local: 'Arroio do Tigre - RS',
  siglaObra: '',
  contrato: '112/2026',
  empresa: 'LEDUR',
  tipoObra: 'Pública',
  status: 'CONTRATADA',
  dataInicial: '03/08/2026',
  dataFinal: '30/01/2027',
  ordemInicio: '10/08/2026',
  confirmacaoRecurso: 'Confirmado',
  subcentroErp: '241',
  codObra: '1187',
  ano: '2026',
};

const LOTES_INICIAIS: LoteMock[] = [
  {
    chave: 'l1', nome: 'LOTE 1 - LINHA SÃO JOSÉ - (6,00X10,00M) - PONTE', status: 'Concluído', coordenada: { lat: -29.3359, lng: -53.0532 },
    lfs: [
      { id: 'f1', tipo: 'Pilar 1', status: 'Concluído', pdfs: [
        pdf('p1', 'LF_LOTE1_pilar1_rev0.pdf', 412, '2026-10-21T14:12:00-03:00', 'Mariana Kern'),
        pdf('p2', 'LF_LOTE1_pilar1_rev1.pdf', 436, '2026-10-28T09:47:00-03:00', 'Mariana Kern'),
      ] },
      { id: 'f2', tipo: 'Pilar 2', status: 'Concluído', pdfs: [pdf('p3', 'LF_LOTE1_pilar2.pdf', 398, '2026-10-29T11:05:00-03:00', 'Mariana Kern')] },
      { id: 'f7', tipo: 'Pilar 3', status: 'Em análise', pdfs: [pdf('p6', 'LF_LOTE1_pilar3.pdf', 405, '2026-11-17T10:02:00-03:00', 'Mariana Kern')] },
      { id: 'f3', tipo: 'Vão 1', status: 'Em análise', pdfs: [pdf('p4', 'LF_LOTE1_vao1.pdf', 1210, '2026-11-12T16:30:00-03:00', 'Rafael Dornelles')] },
    ],
  },
  {
    chave: 'l2', nome: 'LOTE 2 - SÍTIO ALTO - BUEIRO CELULAR 2,00X2,00M', status: 'Em execução', coordenada: { lat: -29.3051, lng: -53.0917 },
    lfs: [
      { id: 'f4', tipo: 'Cabeceira 1', status: 'Revisar', pdfs: [pdf('p5', 'LF_LOTE2_cabeceira1.pdf', 845, '2026-11-04T08:20:00-03:00', 'Rafael Dornelles')] },
      { id: 'f5', tipo: 'Cabeceira 2', status: 'Pendente', pdfs: [] },
    ],
  },
  {
    chave: 'l3', nome: 'LOTE 3 - CORREDEIRA - (7,60X12,00M) - PONTE', status: 'Revisar escopo', coordenada: { lat: -29.3712, lng: -53.0204 },
    lfs: [{ id: 'f6', tipo: 'Pilar 1', status: 'Pendente', pdfs: [] }],
  },
  { chave: 'l4', nome: 'LOTE 4 - ACESSO CENTRO - PAVIMENTAÇÃO', status: '', coordenada: null, lfs: [] },
];

/**
 * Status dos pré-fabricados — PROVISÓRIO: os nomes que a API vai mandar ainda não estão definidos. Para corrigir,
 * troque só esta lista:
 * - `nome`: exatamente como vier da API (comparado sem diferença de maiúsculas/acentos);
 * - `cor`: a cor do chip (cores do tema);
 * - `concluido`: marca o status final; no grupo recolhido ele só aparece se todos os itens estiverem nele;
 * - a ordem: do mais urgente para o menos; desempata o status do grupo recolhido quando dois aparecem igual.
 * Um status que não estiver aqui aparece com o nome que veio, em chip sem cor, e perde os desempates.
 */
const STATUS_PRE_FABRICADO: { nome: string; cor: 'success' | 'info' | 'warning' | 'default'; concluido?: boolean }[] = [
  { nome: 'Revisar', cor: 'warning' },
  { nome: 'Em análise', cor: 'info' },
  { nome: 'Pendente', cor: 'default' },
  { nome: 'Concluído', cor: 'success', concluido: true },
];

const normalizarStatus = (status: string) => status.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const configDoStatus = (status: string) => STATUS_PRE_FABRICADO.find((item) => normalizarStatus(item.nome) === normalizarStatus(status));
const ordemDoStatus = (status: string) => {
  const config = configDoStatus(status);
  return config ? STATUS_PRE_FABRICADO.indexOf(config) : STATUS_PRE_FABRICADO.length;
};

/**
 * Status do grupo recolhido: o que mais aparece entre os itens que não estão concluídos (empate: o mais urgente da
 * lista). Só fica "concluído" quando todos os itens estão concluídos. Itens sem status não contam.
 */
function statusDoGrupo(lfs: LfMock[]): string {
  const comStatus = lfs.filter((lf) => lf.status.trim());
  const abertos = comStatus.filter((lf) => !configDoStatus(lf.status)?.concluido);
  if (!abertos.length) return comStatus.length && comStatus.length === lfs.length ? comStatus[0].status : '';
  const contagem = new Map<string, number>();
  for (const lf of abertos) contagem.set(lf.status, (contagem.get(lf.status) ?? 0) + 1);
  return [...contagem].sort(([a, qa], [b, qb]) => qb - qa || ordemDoStatus(a) - ordemDoStatus(b))[0][0];
}

const totalPdfs = (lfs: LfMock[]) => lfs.reduce((total, lf) => total + lf.pdfs.length, 0);

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

function ChipStatus({ status }: { status: string }) {
  const cor = configDoStatus(status)?.cor ?? 'default';
  return <Chip size="small" label={status || 'Sem status'} color={cor} variant={cor === 'default' ? 'outlined' : 'filled'} />;
}

const dataHora = (data: Date) => data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const tamanhoTexto = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const maisRecente = (pdfs: PdfLf[]) => pdfs.reduce<PdfLf | null>((atual, item) => (!atual || item.anexadoEm > atual.anexadoEm ? item : atual), null);

/** Revisões do mais novo para o mais antigo; a mais antiga é a Rev. 0. */
const revisoes = (pdfs: PdfLf[]) => [...pdfs]
  .sort((a, b) => a.anexadoEm.getTime() - b.anexadoEm.getTime())
  .map((item, revisao) => ({ item, revisao }))
  .reverse();

/** Grupo do Tipo: o nome sem o número do fim ("Pilar 2" → "Pilar"), na ordem em que aparece. */
function agruparPorTipo(lfs: LfMock[]): { nome: string; lfs: LfMock[] }[] {
  const grupos = new Map<string, LfMock[]>();
  for (const lf of lfs) {
    const nome = lf.tipo.replace(/\s*\d+$/, '').trim() || lf.tipo || 'Sem tipo';
    grupos.set(nome, [...(grupos.get(nome) ?? []), lf]);
  }
  return [...grupos].map(([nome, itens]) => ({ nome, lfs: itens }));
}

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <Box minWidth={0}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{valor || '—'}</Typography>
    </Box>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>{titulo}</Typography>
      {children}
    </Paper>
  );
}

function Tabela({ cabecalho, linhas, direita = [] }: { cabecalho: string[]; linhas: ReactNode[][]; direita?: number[] }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>{cabecalho.map((titulo, index) => <TableCell key={titulo} align={direita.includes(index) ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{titulo}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {linhas.map((linha, row) => (
            <TableRow key={row}>{linha.map((celula, index) => <TableCell key={index} align={direita.includes(index) ? 'right' : 'left'}>{celula}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Coluna LOTE: o mesmo chip de hoje (status do Friday no rótulo; abre o Google Maps quando há coordenada). */
function ChipLote({ lote }: { lote: LoteMock }) {
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

export default function TesteMkiPage() {
  const { authorizationProfile, currentUser } = useAuth();
  const usuario = authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || 'Você';
  const [local, setLocal] = useState(OBRA.local);
  const [sigla, setSigla] = useState(OBRA.siglaObra);
  const [lotes, setLotes] = useState(LOTES_INICIAIS);
  const [historico, setHistorico] = useState<AlvoRevisoes | null>(null);
  const [excluir, setExcluir] = useState<PdfLf | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Grupos de Tipo recolhidos ("lote:grupo"); começam todos abertos.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const entrada = useRef<HTMLInputElement>(null);
  const anexarEm = useRef<{ alvo: Alvo; modo: ModoPdf } | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const alterarLf = ({ lote, lf }: Alvo, alterar: (item: LfMock) => LfMock) =>
    setLotes((atuais) => atuais.map((item) => (item.chave !== lote ? item : {
      ...item,
      lfs: item.lfs.map((atual) => (atual.id === lf ? alterar(atual) : atual)),
    })));

  function alternarGrupo(chave: string) {
    setRecolhidos((atuais) => {
      const proximos = new Set(atuais);
      if (!proximos.delete(chave)) proximos.add(chave);
      return proximos;
    });
  }

  function escolherPdf(alvo: Alvo, modo: ModoPdf) {
    anexarEm.current = { alvo, modo };
    entrada.current?.click();
  }

  /** Anexar (sem PDF) e Revisão acrescentam uma revisão; Substituir troca o PDF atual, sem nova revisão. */
  function anexar(arquivo: File | undefined) {
    const escolha = anexarEm.current;
    if (entrada.current) entrada.current.value = '';
    if (!arquivo || !escolha) return;
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      setAviso('Só arquivos PDF.');
      return;
    }
    const url = URL.createObjectURL(arquivo);
    urls.current.push(url);
    const novo: PdfLf = { id: `${Date.now()}`, nome: arquivo.name, tamanho: arquivo.size, anexadoEm: new Date(), anexadoPor: usuario, url };
    alterarLf(escolha.alvo, (item) => {
      const atual = maisRecente(item.pdfs);
      if (escolha.modo === 'substituir' && atual) return { ...item, pdfs: item.pdfs.map((pdfItem) => (pdfItem.id === atual.id ? novo : pdfItem)) };
      return { ...item, pdfs: [...item.pdfs, novo] };
    });
    setAviso(escolha.modo === 'substituir' ? `PDF substituído por ${arquivo.name}.` : escolha.modo === 'revisao' ? `${arquivo.name} anexado como nova revisão.` : `${arquivo.name} anexado.`);
  }

  function abrirPdf(item: PdfLf) {
    if (item.url) window.open(item.url, '_blank', 'noopener');
    else setAviso('PDF fictício do teste: não há arquivo para abrir.');
  }

  function confirmarExclusao() {
    if (!excluir) return;
    setLotes((atuais) => atuais.map((lote) => ({
      ...lote,
      lfs: lote.lfs.map((lf) => ({ ...lf, pdfs: lf.pdfs.filter((item) => item.id !== excluir.id) })),
    })));
    setAviso(`${excluir.nome} excluído.`);
    setExcluir(null);
  }

  const loteHistorico = historico ? lotes.find((lote) => lote.chave === historico.lote) : undefined;
  const lfsHistorico = loteHistorico?.lfs.filter((lf) => historico?.lfs.includes(lf.id)) ?? [];
  const salvar = (set: (valor: string) => void) => async (valor: string) => { set(valor.trim()); return true; };

  return (
    <>
      <div className="teste-aviso" role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface · MKI</strong>
        <span>Detalhe da obra com os LOTEs e os pré-fabricados em lista. Dados fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
      </div>

      <Container sx={{ py: 4 }}>
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" onClick={() => setAviso('No teste o relatório não é gerado.')}>Gerar Relatório</Button>
        </Stack>

        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 700 }}>{OBRA.nomeObra}</Typography>
            <Chip label={OBRA.situacao} size="small" variant="outlined" />
          </Stack>

          <Stack spacing={2} sx={{ mt: 2 }}>
            <CampoEditavel campo="local" valor={local} vazio={local ? null : { texto: 'Local a corrigir', botao: 'Cadastrar local' }} destaque salvando={false} onSalvar={salvar(setLocal)} />
            <CampoEditavel campo="siglaObra" valor={sigla} vazio={sigla ? null : { texto: 'Sem sinônimo', botao: 'Cadastrar sinônimo' }} salvando={false} onSalvar={salvar(setSigla)} />
          </Stack>

          <Box sx={{ mt: 2.5, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
            <Campo rotulo="Contrato" valor={OBRA.contrato} />
            <Campo rotulo="Empresa" valor={OBRA.empresa} />
            <Campo rotulo="Tipo de obra" valor={OBRA.tipoObra} />
            <Campo rotulo="Status no sistema" valor={OBRA.status} />
            <Campo rotulo="Início do contrato" valor={OBRA.dataInicial} />
            <Campo rotulo="Fim do contrato" valor={OBRA.dataFinal} />
            <Campo rotulo="Ordem de início" valor={OBRA.ordemInicio} />
            <Campo rotulo="Confirmação de recurso" valor={OBRA.confirmacaoRecurso} />
            <Campo rotulo="Subcentro ERP" valor={OBRA.subcentroErp} />
            <Campo rotulo="Código" valor={OBRA.codObra} />
            <Campo rotulo="Ano" valor={OBRA.ano} />
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5, mb: 1 }}>LOTEs</Typography>
          <TableContainer className="mki-lotes">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell rowSpan={2}>LOTE</TableCell>
                  <TableCell colSpan={4} align="center" className="mki-lotes__grupo">Pré-Fabricados</TableCell>
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
                  // Linhas visíveis do LOTE: o cabeçalho de cada grupo de Tipo e, se aberto, os itens dele.
                  const linhas = agruparPorTipo(lote.lfs).flatMap((grupo) => {
                    const chave = `${lote.chave}:${grupo.nome}`;
                    const aberto = !recolhidos.has(chave);
                    return [
                      { tipo: 'grupo' as const, chave, nome: grupo.nome, lfs: grupo.lfs, aberto },
                      ...(aberto ? grupo.lfs.map((lf) => ({ tipo: 'item' as const, chave: lf.id, lf })) : []),
                    ];
                  });
                  const celulaLote = (
                    <TableCell rowSpan={Math.max(linhas.length, 1)} className="mki-lotes__lote"><ChipLote lote={lote} /></TableCell>
                  );
                  if (!linhas.length) {
                    return (
                      <TableRow key={lote.chave} className="mki-lotes__fim">
                        {celulaLote}
                        <TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Nenhum pré-fabricado neste LOTE.</Typography></TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <Fragment key={lote.chave}>
                      {linhas.map((linha, index) => {
                        const classe = index === linhas.length - 1 ? 'mki-lotes__fim' : undefined;
                        if (linha.tipo === 'grupo') {
                          return (
                            <TableRow key={linha.chave} className={`mki-lotes__tipo ${classe ?? ''}`}>
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
                                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>{linha.lfs.length}</Typography>
                                </Button>
                              </TableCell>
                              {/* Recolhido, o grupo resume os itens: total de PDFs, o status do grupo e as revisões de todos. */}
                              {linha.aberto ? <TableCell colSpan={3} /> : (
                                <>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                      {totalPdfs(linha.lfs) === 1 ? '1 PDF' : `${totalPdfs(linha.lfs)} PDFs`}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>{statusDoGrupo(linha.lfs) ? <ChipStatus status={statusDoGrupo(linha.lfs)} /> : null}</TableCell>
                                  <TableCell align="center">
                                    <BotaoRevisoes
                                      quantidade={totalPdfs(linha.lfs)}
                                      rotulo={`Revisões de ${linha.nome} do ${lote.nome}`}
                                      onClick={() => setHistorico({ lote: lote.chave, lfs: linha.lfs.map((lf) => lf.id), titulo: linha.nome })}
                                    />
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        }
                        const { lf } = linha;
                        const alvo = { lote: lote.chave, lf: lf.id };
                        const atual = maisRecente(lf.pdfs);
                        const rotuloLf = `${lf.tipo || 'pré-fabricado sem tipo'} do ${lote.nome}`;
                        return (
                          <TableRow key={linha.chave} className={classe}>
                            {index === 0 && celulaLote}
                            <TableCell align="center" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lf.tipo || '—'}</TableCell>
                            <TableCell>
                              {atual ? (
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <Tooltip title={`${atual.nome} · ${dataHora(atual.anexadoEm)} · ${atual.anexadoPor}`}>
                                    <Chip
                                      size="small"
                                      icon={<PictureAsPdfOutlinedIcon />}
                                      label={lf.pdfs.length > 1 ? `${atual.nome} · Rev. ${lf.pdfs.length - 1}` : atual.nome}
                                      onClick={() => abrirPdf(atual)}
                                      variant="outlined"
                                      color="error"
                                      sx={{ maxWidth: 230 }}
                                    />
                                  </Tooltip>
                                  <Tooltip title="Trocar o PDF atual por outro (não cria revisão)">
                                    <Button size="small" onClick={() => escolherPdf(alvo, 'substituir')} aria-label={`Substituir o PDF do ${rotuloLf}`}>Substituir</Button>
                                  </Tooltip>
                                  <Tooltip title="Anexar uma nova revisão do PDF">
                                    <Button size="small" onClick={() => escolherPdf(alvo, 'revisao')} aria-label={`Nova revisão do PDF do ${rotuloLf}`}>Revisão</Button>
                                  </Tooltip>
                                </Stack>
                              ) : (
                                <Button size="small" startIcon={<UploadFileOutlinedIcon />} onClick={() => escolherPdf(alvo, 'anexar')} aria-label={`Anexar PDF ao ${rotuloLf}`}>
                                  Anexar PDF
                                </Button>
                              )}
                            </TableCell>
                            <TableCell><ChipStatus status={lf.status} /></TableCell>
                            <TableCell align="center">
                              <BotaoRevisoes
                                quantidade={lf.pdfs.length}
                                rotulo={`Revisões do ${rotuloLf}`}
                                onClick={() => setHistorico({ lote: lote.chave, lfs: [lf.id], titulo: lf.tipo || 'pré-fabricado sem tipo' })}
                              />
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

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            O cadastro da obra é feito no Friday (quadro GESTÃO DE OBRAS); aqui só o local e o sinônimo podem ser editados.
          </Typography>
        </Paper>

        <Secao titulo="Saldo do contrato / medições">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
            <Campo rotulo="Medições" valor="R$ 418.230,55" />
            <Campo rotulo="Notas de medição" valor="3" />
            <Campo rotulo="Total do contrato" valor="Não informado" />
            <Campo rotulo="Saldo do contrato" valor="Não informado" />
          </Box>
        </Secao>

        <Secao titulo="Mestres alocados">
          <Tabela
            cabecalho={['Mestre', 'LOTE', 'Início', 'Fim', 'Dias']}
            direita={[4]}
            linhas={[
              ['Paulo Schneider', 'LOTE 1 - LINHA SÃO JOSÉ', '10/08/2026', '25/10/2026', '55 dias'],
              ['Ivo Hammes', 'LOTE 2 - SÍTIO ALTO', '26/10/2026', '18/12/2026', '38 dias'],
            ]}
          />
        </Secao>

        <Secao titulo="Veículos que foram para a obra">
          <Tabela
            cabecalho={['Veículo', 'Atividades', 'Primeira', 'Última', 'Motoristas']}
            direita={[1]}
            linhas={[
              ['IZX4H21 — Caminhão Munck', 14, '11/08/2026', '12/11/2026', 'Jair Lopes, Vilmar Port'],
              ['JBC7E09 — Escavadeira 320', 9, '18/08/2026', '30/10/2026', 'Jair Lopes'],
            ]}
          />
        </Secao>

        <Secao titulo="Combustível">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            <Campo rotulo="Abastecimentos" valor="12" />
            <Campo rotulo="Litros" valor="2.140,0 L" />
            <Campo rotulo="Valor" valor="R$ 13.268,00" />
          </Box>
        </Secao>
      </Container>

      <Dialog open={lfsHistorico.length > 0} onClose={() => setHistorico(null)} fullWidth maxWidth="sm">
        <DialogTitle>Revisões</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {loteHistorico?.nome} · {historico?.titulo}
          </Typography>
          {lfsHistorico.map((lf) => (
            <Box key={lf.id} sx={{ mb: 1 }}>
              {/* Grupo recolhido: uma seção por item, com o Tipo de cada um. */}
              {lfsHistorico.length > 1 && <Typography sx={{ fontWeight: 700, mt: 1.5 }}>{lf.tipo || 'Sem tipo'}</Typography>}
          {lf.pdfs.length ? (
            <List dense disablePadding>
              {revisoes(lf.pdfs).map(({ item, revisao }, index) => (
                <ListItem
                  key={item.id}
                  divider
                  secondaryAction={(
                    <Tooltip title="Excluir PDF">
                      <IconButton edge="end" onClick={() => setExcluir(item)} aria-label={`Excluir ${item.nome}`}>
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
                        <Box component="span" className="mki-link" onClick={() => abrirPdf(item)}>{item.nome}</Box>
                        {index === 0 && <Chip size="small" label="Atual" color="primary" />}
                      </Stack>
                    )}
                    secondary={`Anexado em ${dataHora(item.anexadoEm)} por ${item.anexadoPor} · ${tamanhoTexto(item.tamanho)}`}
                  />
                </ListItem>
              ))}
            </List>
          ) : <Typography variant="body2" color="text.secondary">Nenhum PDF anexado.</Typography>}
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistorico(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(excluir)} onClose={() => setExcluir(null)}>
        <DialogTitle>Excluir PDF?</DialogTitle>
        <DialogContent>
          <Typography>{excluir?.nome} sai das revisões. Não dá para desfazer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExcluir(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmarExclusao}>Excluir</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setAviso(null)} severity="info" variant="filled">{aviso}</Alert>
      </Snackbar>
    </>
  );
}
