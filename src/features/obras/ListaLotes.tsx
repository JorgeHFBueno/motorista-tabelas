import { Fragment, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
  TextField,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { coordenadaCurta, linkDoMapa } from '../cronograma-logistica/domain/local';
import type { LoteObra } from './obrasDomain';
import { rotuloObraPlannix, type ObraPlannix } from './codigoPlannix';
import {
  agruparPorTipo,
  comPdf,
  etapaPlannix,
  maisRecente,
  resumoEtapas,
  revisoes,
  semProjeto,
  totalPdfs,
  type PdfPreFabricado,
  type PreFabricado,
} from './preFabricados';
import './listaLotes.css';

/**
 * LOTEs do detalhe da obra em lista: LOTE | Pré-Fabricados (Tipo, PDF, Status, Revisões), em três níveis:
 * - grupo: o produto (Pilar, Viga…), que abre e fecha; recolhido, resume as peças de todos os itens;
 * - item: a peça do projeto (ex.: P01 com 10 peças), com o resumo das etapas (ex.: 3 Corte e dobra · 4 Acabada);
 *   abre para mostrar os códigos de controle, cada um com a etapa e a data;
 * - sem projeto no Plannix, o item é a linha do Lançamento Final ("aguardando projeto").
 * PDF: os nomes dos desenhos no Plannix e os PDFs anexados (Revisões: quem anexou e quando). Com `acoesPdf.anexar`
 * (quem edita), "Anexar PDF"; com PDF, "Substituir", que troca o atual sem nova revisão, e "Revisão", que anexa uma
 * nova; com `acoesPdf.excluir`, excluir nas Revisões. Item sem projeto no Plannix não recebe PDF (o item muda de nome
 * quando o projeto é cadastrado).
 * `itens: null` = sem pré-fabricados para mostrar; `aviso` diz o motivo (carregando, sem código Plannix, erro).
 */

export type LoteComPreFabricados = LoteObra & { itens: PreFabricado[] | null; aviso?: string; origem?: string };
export type ModoPdf = 'anexar' | 'substituir' | 'revisao';
export type AcoesPdf = {
  abrir: (pdf: PdfPreFabricado) => void;
  /** Sem anexar/excluir (área em "ver"), só abre e mostra as Revisões. */
  anexar?: (alvo: { lote: string; item: string }, modo: ModoPdf, arquivo: File) => void;
  excluir?: (pdf: PdfPreFabricado) => void;
};
/** O que a janela de Revisões mostra: um item, ou todos os itens de um grupo de Tipo recolhido. */
type AlvoRevisoes = { lote: string; itens: string[]; titulo: string };

const dataHora = (data: Date) => data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
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
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
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

/**
 * Coluna Código Plannix: a obra do Plannix do LOTE. Sem código, a sugestão (município, dimensão e nome do lugar) com
 * "Usar"; "Escolher" (ou o lápis) abre a busca no cadastro do Plannix. Sem `gravar` (área em "ver"), só mostra.
 */
export type CodigoPlannixProps = {
  obras: ObraPlannix[] | null;
  sugestoes: Record<string, ObraPlannix>;
  gravar?: (lote: string, codigo: number | null) => Promise<boolean>;
};

function CelulaPlannix({ lote, origem, props }: { lote: LoteObra; origem?: string; props?: CodigoPlannixProps }) {
  const [editando, setEditando] = useState(false);
  const [escolha, setEscolha] = useState<ObraPlannix | null>(null);
  const [salvando, setSalvando] = useState(false);
  const obra = lote.plannix == null ? undefined : props?.obras?.find((o) => o.codigo === lote.plannix);
  const sugestao = lote.plannix == null ? props?.sugestoes[lote.chave] : undefined;
  const gravar = props?.gravar;
  async function salvar(codigo: number | null) {
    if (!gravar) return;
    setSalvando(true);
    const ok = await gravar(lote.chave, codigo);
    setSalvando(false);
    if (ok) setEditando(false);
  }
  if (editando && gravar) {
    return (
      <Stack spacing={1} sx={{ minWidth: 260 }}>
        <Autocomplete
          size="small"
          options={props?.obras ?? []}
          loading={!props?.obras}
          value={escolha}
          onChange={(_, valor) => setEscolha(valor)}
          getOptionLabel={rotuloObraPlannix}
          isOptionEqualToValue={(a, b) => a.codigo === b.codigo}
          noOptionsText="Nenhuma obra do Plannix"
          renderInput={(params) => <TextField {...params} autoFocus label="Obra do Plannix" placeholder="Código, sigla ou nome" />}
        />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={!escolha || salvando} onClick={() => escolha && salvar(escolha.codigo)}>Salvar</Button>
          <Button size="small" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</Button>
          {lote.plannix != null && <Button size="small" color="error" disabled={salvando} onClick={() => salvar(null)}>Tirar</Button>}
        </Stack>
      </Stack>
    );
  }
  if (lote.plannix != null) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="flex-start">
        <Box>
          <Typography sx={{ fontWeight: 700 }}>{lote.plannix}</Typography>
          <Typography variant="caption" color="text.secondary">
            {obra ? `${obra.sigla} · ${obra.nome}` : origem?.replace(/^Plannix \d+ · /, '') ?? ''}
          </Typography>
        </Box>
        {gravar && (
          <Tooltip title="Trocar a obra do Plannix">
            <IconButton size="small" onClick={() => { setEscolha(obra ?? null); setEditando(true); }} aria-label={`Trocar o código Plannix do ${lote.nome}`}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    );
  }
  if (!gravar) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <Stack spacing={0.5} alignItems="flex-start">
      {sugestao ? (
        <>
          <Typography variant="caption" color="text.secondary">Sugestão</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{rotuloObraPlannix(sugestao)}</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" disabled={salvando} onClick={() => salvar(sugestao.codigo)}>Usar</Button>
            <Button size="small" onClick={() => { setEscolha(null); setEditando(true); }}>Escolher outra</Button>
          </Stack>
        </>
      ) : (
        <Button size="small" variant="outlined" onClick={() => { setEscolha(null); setEditando(true); }}>Escolher obra</Button>
      )}
    </Stack>
  );
}

export default function ListaLotes({ lotes, acoesPdf, codigoPlannix }: { lotes: LoteComPreFabricados[]; acoesPdf?: AcoesPdf; codigoPlannix?: CodigoPlannixProps }) {
  const [historico, setHistorico] = useState<AlvoRevisoes | null>(null);
  const [excluir, setExcluir] = useState<PdfPreFabricado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Grupos recolhidos ("lote:grupo"; começam abertos) e itens abertos ("lote:item"; começam fechados, com as peças).
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const [itensAbertos, setItensAbertos] = useState<Set<string>>(() => new Set());
  const entrada = useRef<HTMLInputElement>(null);
  const anexarEm = useRef<{ alvo: { lote: string; item: string }; modo: ModoPdf } | null>(null);

  const alternar = (set: typeof setRecolhidos) => (chave: string) => set((atuais) => {
    const proximos = new Set(atuais);
    if (!proximos.delete(chave)) proximos.add(chave);
    return proximos;
  });
  const alternarGrupo = alternar(setRecolhidos);
  const alternarItem = alternar(setItensAbertos);

  function escolherPdf(alvo: { lote: string; item: string }, modo: ModoPdf) {
    anexarEm.current = { alvo, modo };
    entrada.current?.click();
  }

  function anexar(arquivo: File | undefined) {
    const escolha = anexarEm.current;
    if (entrada.current) entrada.current.value = '';
    if (!arquivo || !escolha || !acoesPdf?.anexar) return;
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      setAviso('Só arquivos PDF.');
      return;
    }
    acoesPdf.anexar(escolha.alvo, escolha.modo, arquivo);
  }

  const loteHistorico = historico ? lotes.find((lote) => lote.chave === historico.lote) : undefined;
  const itensHistorico = loteHistorico?.itens?.filter((item) => historico?.itens.includes(item.id)) ?? [];

  return (
    <>
      <TableContainer className="obra-lotes">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2}>LOTE</TableCell>
              <TableCell rowSpan={2}>Código Plannix</TableCell>
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
                  { tipo: 'grupo' as const, chave, nome: grupo.nome, itens: grupo.itens, aberto },
                  ...(aberto ? grupo.itens.flatMap((item) => {
                    const chaveItem = `${lote.chave}:${item.id}`;
                    const itemAberto = itensAbertos.has(chaveItem);
                    return [
                      { tipo: 'item' as const, chave: chaveItem, item, aberto: itemAberto },
                      ...(itemAberto ? item.pecas.map((peca) => ({ tipo: 'peca' as const, chave: `${chaveItem}:${peca.codigo}`, peca })) : []),
                    ];
                  }) : []),
                ];
              });
              const celulaLote = (
                <>
                  <TableCell rowSpan={Math.max(linhas.length, 1)} className="obra-lotes__lote"><ChipLote lote={lote} /></TableCell>
                  <TableCell rowSpan={Math.max(linhas.length, 1)} className="obra-lotes__plannix">
                    <CelulaPlannix key={`${lote.chave}:${lote.plannix}`} lote={lote} origem={lote.origem} props={codigoPlannix} />
                  </TableCell>
                </>
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
                          {/* Recolhido, o grupo resume os itens: quantos têm PDF, as etapas de todas as peças e as revisões. */}
                          {linha.aberto ? <TableCell colSpan={3} /> : (
                            <>
                              <TableCell>
                                {(acoesPdf?.anexar || totalPdfs(linha.itens) > 0) && <Typography variant="body2" color="text.secondary">{`${comPdf(linha.itens)} de ${linha.itens.length} com PDF`}</Typography>}
                              </TableCell>
                              <TableCell><ResumoEtapas itens={linha.itens} /></TableCell>
                              <TableCell align="center">
                                {(acoesPdf?.anexar || totalPdfs(linha.itens) > 0) && (
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
                            <Stack direction="row" spacing={1} alignItems="center">
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
                    const atual = maisRecente(item.pdfs);
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
                        <TableCell>
                          {item.desenhos.length > 0 && (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                              {item.desenhos.map((nome) => (
                                <Tooltip key={nome} title="Desenho no Plannix (a API só informa o nome)">
                                  <Chip size="small" icon={<PictureAsPdfOutlinedIcon />} label={nome} variant="outlined" sx={{ maxWidth: 230 }} />
                                </Tooltip>
                              ))}
                            </Stack>
                          )}
                          {atual ? (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Tooltip title={`${atual.nome} · ${dataHora(atual.anexadoEm)} · ${atual.anexadoPor}`}>
                                <Chip
                                  size="small"
                                  icon={<PictureAsPdfOutlinedIcon />}
                                  label={item.pdfs.length > 1 ? `${atual.nome} · Rev. ${item.pdfs.length - 1}` : atual.nome}
                                  onClick={acoesPdf ? () => acoesPdf.abrir(atual) : undefined}
                                  variant="outlined"
                                  color="error"
                                  sx={{ maxWidth: 230 }}
                                />
                              </Tooltip>
                              {acoesPdf?.anexar && (
                                <>
                                  <Tooltip title="Trocar o PDF atual por outro (não cria revisão)">
                                    <Button size="small" onClick={() => escolherPdf(alvo, 'substituir')} aria-label={`Substituir o PDF do ${rotuloItem}`}>Substituir</Button>
                                  </Tooltip>
                                  <Tooltip title="Anexar uma nova revisão do PDF">
                                    <Button size="small" onClick={() => escolherPdf(alvo, 'revisao')} aria-label={`Nova revisão do PDF do ${rotuloItem}`}>Revisão</Button>
                                  </Tooltip>
                                </>
                              )}
                            </Stack>
                          ) : acoesPdf?.anexar && item.pecas.length > 0 ? (
                            <Button size="small" startIcon={<UploadFileOutlinedIcon />} onClick={() => escolherPdf(alvo, 'anexar')} aria-label={`Anexar PDF ao ${rotuloItem}`}>
                              Anexar PDF
                            </Button>
                          ) : null}
                        </TableCell>
                        <TableCell><ResumoEtapas itens={[item]} /></TableCell>
                        <TableCell align="center">
                          {((acoesPdf?.anexar && item.pecas.length > 0) || item.pdfs.length > 0) && (
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
              {item.pdfs.length ? (
                <List dense disablePadding>
                  {revisoes(item.pdfs).map(({ item: pdf, revisao }, index) => (
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
