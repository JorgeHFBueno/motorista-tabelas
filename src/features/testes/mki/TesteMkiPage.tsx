import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CampoEditavel from '../../obras/CampoEditavelObra';
import { coordenadaCurta, linkDoMapa } from '../../cronograma-logistica/domain/local';
import { useAuth } from '../../../contexts/AuthContext';
import './mki.css';

/**
 * /testes/mki: mock do detalhe da obra (/engenharia/obras/:id) com os LOTEs em lista de colunas — LOTE, LF
 * (Lançamento Final), PDF, Status e Histórico (quem anexou cada PDF e quando; permite excluir). Obra e LOTEs
 * fictícios em memória: nada vai para o Firestore nem para o Storage.
 */

type PdfLote = { id: string; nome: string; tamanho: number; anexadoEm: Date; anexadoPor: string; url: string | null };
type LoteMock = {
  chave: string;
  nome: string;
  status: string;
  coordenada: { lat: number; lng: number } | null;
  /** LF: data do Lançamento Final (aaaa-mm-dd), vazio enquanto não lançado. */
  lf: string;
  pdfs: PdfLote[];
};

const pdf = (id: string, nome: string, kb: number, quando: string, por: string): PdfLote =>
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
    chave: 'l1', nome: 'LOTE 1 - LINHA SÃO JOSÉ - (6,00X10,00M) - PONTE', status: 'Concluído',
    coordenada: { lat: -29.3359, lng: -53.0532 }, lf: '2026-10-28',
    pdfs: [
      pdf('p1', 'LF_LOTE1_rev0.pdf', 412, '2026-10-21T14:12:00-03:00', 'Mariana Kern'),
      pdf('p2', 'LF_LOTE1_rev1.pdf', 436, '2026-10-28T09:47:00-03:00', 'Mariana Kern'),
    ],
  },
  {
    chave: 'l2', nome: 'LOTE 2 - SÍTIO ALTO - BUEIRO CELULAR 2,00X2,00M', status: 'Em execução',
    coordenada: { lat: -29.3051, lng: -53.0917 }, lf: '',
    pdfs: [pdf('p3', 'Projeto_bueiro_LOTE2.pdf', 1280, '2026-11-04T16:30:00-03:00', 'Rafael Dornelles')],
  },
  {
    chave: 'l3', nome: 'LOTE 3 - CORREDEIRA - (7,60X12,00M) - PONTE', status: 'Revisar escopo',
    coordenada: { lat: -29.3712, lng: -53.0204 }, lf: '', pdfs: [],
  },
  { chave: 'l4', nome: 'LOTE 4 - ACESSO CENTRO - PAVIMENTAÇÃO', status: 'Não iniciado', coordenada: null, lf: '', pdfs: [] },
];

const COR_STATUS: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
  'Concluído': 'success',
  'Em execução': 'info',
  'Revisar escopo': 'warning',
};

const dataHora = (data: Date) => data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const dataCivil = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const tamanhoTexto = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const maisRecente = (pdfs: PdfLote[]) => pdfs.reduce<PdfLote | null>((atual, item) => (!atual || item.anexadoEm > atual.anexadoEm ? item : atual), null);

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

/** Coluna principal: o mesmo chip de hoje (abre o Google Maps quando há coordenada), sem o status, que ganhou coluna. */
function ChipLote({ lote }: { lote: LoteMock }) {
  return lote.coordenada ? (
    <Tooltip title="Abrir no Google Maps">
      <Chip
        component="a"
        href={linkDoMapa(lote.coordenada)}
        target="_blank"
        rel="noopener noreferrer"
        clickable
        icon={<PlaceOutlinedIcon />}
        label={`${lote.nome} · ${coordenadaCurta(lote.coordenada)}`}
        variant="outlined"
        color="primary"
        sx={{ maxWidth: '100%' }}
      />
    </Tooltip>
  ) : <Chip label={lote.nome} variant="outlined" sx={{ maxWidth: '100%' }} />;
}

export default function TesteMkiPage() {
  const { authorizationProfile, currentUser } = useAuth();
  const usuario = authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || 'Você';
  const [local, setLocal] = useState(OBRA.local);
  const [sigla, setSigla] = useState(OBRA.siglaObra);
  const [lotes, setLotes] = useState(LOTES_INICIAIS);
  const [historico, setHistorico] = useState<string | null>(null); // chave do LOTE com o histórico aberto
  const [excluir, setExcluir] = useState<PdfLote | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const anexarEm = useRef<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const alterarLote = (chave: string, alterar: (lote: LoteMock) => LoteMock) =>
    setLotes((atuais) => atuais.map((lote) => (lote.chave === chave ? alterar(lote) : lote)));

  function escolherPdf(chave: string) {
    anexarEm.current = chave;
    entrada.current?.click();
  }

  function anexar(arquivo: File | undefined) {
    const chave = anexarEm.current;
    if (entrada.current) entrada.current.value = '';
    if (!arquivo || !chave) return;
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      setAviso('Só arquivos PDF.');
      return;
    }
    const url = URL.createObjectURL(arquivo);
    urls.current.push(url);
    const novo: PdfLote = { id: `${Date.now()}`, nome: arquivo.name, tamanho: arquivo.size, anexadoEm: new Date(), anexadoPor: usuario, url };
    alterarLote(chave, (lote) => ({ ...lote, pdfs: [...lote.pdfs, novo] }));
    setAviso(`${arquivo.name} anexado.`);
  }

  function abrirPdf(item: PdfLote) {
    if (item.url) window.open(item.url, '_blank', 'noopener');
    else setAviso('PDF fictício do teste: não há arquivo para abrir.');
  }

  function confirmarExclusao() {
    if (!excluir) return;
    setLotes((atuais) => atuais.map((lote) => ({ ...lote, pdfs: lote.pdfs.filter((item) => item.id !== excluir.id) })));
    setAviso(`${excluir.nome} excluído.`);
    setExcluir(null);
  }

  const loteHistorico = lotes.find((lote) => lote.chave === historico) ?? null;
  const salvar = (set: (valor: string) => void) => async (valor: string) => { set(valor.trim()); return true; };

  return (
    <>
      <div className="teste-aviso" role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface · MKI</strong>
        <span>Detalhe da obra com os LOTEs em lista. Obra e LOTEs fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
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
                  <TableCell>LOTE</TableCell>
                  <TableCell><Tooltip title="Lançamento Final"><span>LF</span></Tooltip></TableCell>
                  <TableCell>PDF</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Histórico</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lotes.map((lote) => {
                  const atual = maisRecente(lote.pdfs);
                  return (
                    <TableRow key={lote.chave} hover>
                      <TableCell className="mki-lotes__lote"><ChipLote lote={lote} /></TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          size="small"
                          value={lote.lf}
                          onChange={(event) => alterarLote(lote.chave, (atualLote) => ({ ...atualLote, lf: event.target.value }))}
                          inputProps={{ 'aria-label': `Lançamento Final do ${lote.nome}` }}
                          sx={{ width: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {atual && (
                            <Tooltip title={`${atual.nome} · ${dataHora(atual.anexadoEm)} · ${atual.anexadoPor}`}>
                              <Chip
                                size="small"
                                icon={<PictureAsPdfOutlinedIcon />}
                                label={lote.pdfs.length > 1 ? `${atual.nome} (+${lote.pdfs.length - 1})` : atual.nome}
                                onClick={() => abrirPdf(atual)}
                                variant="outlined"
                                color="error"
                                sx={{ maxWidth: 200 }}
                              />
                            </Tooltip>
                          )}
                          <Tooltip title="Anexar PDF">
                            <IconButton size="small" onClick={() => escolherPdf(lote.chave)} aria-label={`Anexar PDF ao ${lote.nome}`}>
                              <UploadFileOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={lote.status || 'Sem status'} color={COR_STATUS[lote.status] ?? 'default'} variant={COR_STATUS[lote.status] ? 'filled' : 'outlined'} />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Histórico de PDFs">
                          <IconButton size="small" onClick={() => setHistorico(lote.chave)} aria-label={`Histórico de PDFs do ${lote.nome}`}>
                            <Badge badgeContent={lote.pdfs.length} color="primary">
                              <HistoryIcon fontSize="small" />
                            </Badge>
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
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

      <Dialog open={Boolean(loteHistorico)} onClose={() => setHistorico(null)} fullWidth maxWidth="sm">
        <DialogTitle>Histórico de PDFs</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{loteHistorico?.nome}</Typography>
          {loteHistorico?.pdfs.length ? (
            <List dense disablePadding>
              {[...loteHistorico.pdfs].sort((a, b) => b.anexadoEm.getTime() - a.anexadoEm.getTime()).map((item, index) => (
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
                        <Box component="span" className="mki-link" onClick={() => abrirPdf(item)}>{item.nome}</Box>
                        {index === 0 && <Chip size="small" label="Atual" color="primary" />}
                      </Stack>
                    )}
                    secondary={`Anexado em ${dataHora(item.anexadoEm)} por ${item.anexadoPor} · ${tamanhoTexto(item.tamanho)}`}
                  />
                </ListItem>
              ))}
            </List>
          ) : <Typography color="text.secondary">Nenhum PDF anexado a este LOTE.</Typography>}
          {loteHistorico?.lf && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Lançamento Final em {dataCivil(loteHistorico.lf)}.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {loteHistorico && <Button startIcon={<UploadFileOutlinedIcon />} onClick={() => escolherPdf(loteHistorico.chave)}>Anexar PDF</Button>}
          <Button onClick={() => setHistorico(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(excluir)} onClose={() => setExcluir(null)}>
        <DialogTitle>Excluir PDF?</DialogTitle>
        <DialogContent>
          <Typography>{excluir?.nome} sai do LOTE e do histórico. Não dá para desfazer.</Typography>
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
