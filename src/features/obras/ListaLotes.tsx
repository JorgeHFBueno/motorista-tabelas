import { Fragment, useRef, useState } from 'react';
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
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { coordenadaCurta, linkDoMapa } from '../cronograma-logistica/domain/local';
import type { LoteObra } from './obrasDomain';
import {
  agruparPorTipo,
  comPdf,
  configDoStatus,
  maisRecente,
  revisoes,
  statusDoGrupo,
  totalPdfs,
  type PdfPreFabricado,
  type PreFabricado,
} from './preFabricados';
import './listaLotes.css';

/**
 * LOTEs do detalhe da obra em lista: LOTE | Pré-Fabricados (Tipo, PDF, Status, Revisões). Os pré-fabricados do LOTE
 * ficam agrupados por Tipo ("Pilar 1" e "Pilar 2" em "Pilar", que abre e fecha; recolhido, o grupo resume os itens).
 * Sem PDF, "Anexar PDF"; com PDF, "Substituir" (troca o atual, sem nova revisão) e "Revisão" (anexa uma nova).
 * `itens: null` = a API dos pré-fabricados ainda não respondeu para o LOTE (hoje, sempre: vem novidade aí).
 * Sem `acoesPdf`, a lista só mostra os PDFs (sem anexar, abrir nem excluir).
 */

export type LoteComPreFabricados = LoteObra & { itens: PreFabricado[] | null };
export type ModoPdf = 'anexar' | 'substituir' | 'revisao';
export type AcoesPdf = {
  anexar: (alvo: { lote: string; item: string }, modo: ModoPdf, arquivo: File) => void;
  abrir: (pdf: PdfPreFabricado) => void;
  excluir: (pdf: PdfPreFabricado) => void;
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

function ChipStatus({ status }: { status: string }) {
  const cor = configDoStatus(status)?.cor ?? 'default';
  return <Chip size="small" label={status || 'Sem status'} color={cor} variant={cor === 'default' ? 'outlined' : 'filled'} />;
}

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

export default function ListaLotes({ lotes, acoesPdf }: { lotes: LoteComPreFabricados[]; acoesPdf?: AcoesPdf }) {
  const [historico, setHistorico] = useState<AlvoRevisoes | null>(null);
  const [excluir, setExcluir] = useState<PdfPreFabricado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Grupos de Tipo recolhidos ("lote:grupo"); começam todos abertos.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const entrada = useRef<HTMLInputElement>(null);
  const anexarEm = useRef<{ alvo: { lote: string; item: string }; modo: ModoPdf } | null>(null);

  function alternarGrupo(chave: string) {
    setRecolhidos((atuais) => {
      const proximos = new Set(atuais);
      if (!proximos.delete(chave)) proximos.add(chave);
      return proximos;
    });
  }

  function escolherPdf(alvo: { lote: string; item: string }, modo: ModoPdf) {
    anexarEm.current = { alvo, modo };
    entrada.current?.click();
  }

  function anexar(arquivo: File | undefined) {
    const escolha = anexarEm.current;
    if (entrada.current) entrada.current.value = '';
    if (!arquivo || !escolha || !acoesPdf) return;
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
              // Linhas visíveis do LOTE: o cabeçalho de cada grupo de Tipo e, se aberto, os itens dele.
              const linhas = agruparPorTipo(lote.itens ?? []).flatMap((grupo) => {
                const chave = `${lote.chave}:${grupo.nome}`;
                const aberto = !recolhidos.has(chave);
                return [
                  { tipo: 'grupo' as const, chave, nome: grupo.nome, itens: grupo.itens, aberto },
                  ...(aberto ? grupo.itens.map((item) => ({ tipo: 'item' as const, chave: item.id, item })) : []),
                ];
              });
              const celulaLote = (
                <TableCell rowSpan={Math.max(linhas.length, 1)} className="obra-lotes__lote"><ChipLote lote={lote} /></TableCell>
              );
              if (!linhas.length) {
                return (
                  <TableRow key={lote.chave} className="obra-lotes__fim">
                    {celulaLote}
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        {lote.itens ? 'Nenhum pré-fabricado neste LOTE.' : 'Vem novidade aí: os pré-fabricados do LOTE chegam por uma API que ainda não está ligada.'}
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
                          {/* Recolhido, o grupo resume os itens: quantos têm PDF, o status do grupo e as revisões de todos. */}
                          {linha.aberto ? <TableCell colSpan={3} /> : (
                            <>
                              <TableCell>
                                <Typography variant="body2" color="text.secondary">{`${comPdf(linha.itens)} de ${linha.itens.length} com PDF`}</Typography>
                              </TableCell>
                              <TableCell>{statusDoGrupo(linha.itens) ? <ChipStatus status={statusDoGrupo(linha.itens)} /> : null}</TableCell>
                              <TableCell align="center">
                                <BotaoRevisoes
                                  quantidade={totalPdfs(linha.itens)}
                                  rotulo={`Revisões de ${linha.nome} do ${lote.nome}`}
                                  onClick={() => setHistorico({ lote: lote.chave, itens: linha.itens.map((item) => item.id), titulo: linha.nome })}
                                />
                              </TableCell>
                            </>
                          )}
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
                        <TableCell align="center" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{item.tipo || '—'}</TableCell>
                        <TableCell>
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
                              {acoesPdf && (
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
                          ) : acoesPdf ? (
                            <Button size="small" startIcon={<UploadFileOutlinedIcon />} onClick={() => escolherPdf(alvo, 'anexar')} aria-label={`Anexar PDF ao ${rotuloItem}`}>
                              Anexar PDF
                            </Button>
                          ) : <Typography variant="body2" color="text.secondary">Sem PDF</Typography>}
                        </TableCell>
                        <TableCell><ChipStatus status={item.status} /></TableCell>
                        <TableCell align="center">
                          <BotaoRevisoes
                            quantidade={item.pdfs.length}
                            rotulo={`Revisões do ${rotuloItem}`}
                            onClick={() => setHistorico({ lote: lote.chave, itens: [item.id], titulo: item.tipo || 'pré-fabricado sem tipo' })}
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
                      secondaryAction={acoesPdf && (
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
              if (excluir && acoesPdf) acoesPdf.excluir(excluir);
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
