import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { etapaPlannix, type PreFabricado } from '../../obras/preFabricados';
import {
  CATEGORIAS,
  atividadePorId,
  chavePeca,
  conflitosDoMestre,
  dataCurta,
  dentroDaAlocacao,
  diasDoPeriodo,
  lotesDoPacote,
  montadasNosPacotes,
  pecasAgendadas,
  pecasDaAtividade,
  periodoValido,
  somarDias,
  type Alocacao,
  type Pacote,
} from './pacotesTrabalho';

export type MarcarPeca = (pacoteId: string, chave: string, para: 'montada' | 'agendada' | 'expedida') => void;

// Aba Mestres do /testes/mki: Pacotes de Trabalho (pacotesTrabalho.ts). Atividades agenda; Lista mostra as alocações do
// CronoObra e os pacotes (com as peças marcadas Montada ou de volta a Expedida, e o serviço concluído); Calendários desenha
// os dois por mestre, semana a semana. Tudo em memória.

type LoteMki = { chave: string; nome: string; itens: PreFabricado[] | null };
const porcentagem = (valor: number) => `${Math.round(valor * 100)}%`;
const nomeCurto = (nome: string) => nome.split(' - ')[0].trim() || nome;
/** Cor de cada categoria (identidade Ledur, sem roxo). */
const COR_CATEGORIA: Record<string, string> = { Fundação: '#E79A25', 'Super Estrutura': '#2F6B98', Mesoestruturas: '#2E9D6F' };
const corDoPacote = (pacote: Pacote) => COR_CATEGORIA[atividadePorId(pacote.atividade)?.categoria ?? ''] ?? '#12293B';

function Passo({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <Box sx={{ '& + &': { mt: 3 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
        <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'primary.main', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{numero}</Box>
        <Typography sx={{ fontWeight: 700 }}>{titulo}</Typography>
      </Stack>
      {children}
    </Box>
  );
}

/** Atividades: escolher a atividade, as peças (por LOTE, das mais completas), o mestre e o período, e agendar o pacote. */
export function AgendarPacote({ lotes, pacotes, alocacoes, mestres, hoje, onAgendar }: {
  lotes: LoteMki[];
  pacotes: Pacote[];
  alocacoes: Alocacao[];
  mestres: string[];
  hoje: string;
  onAgendar: (pacote: Pacote) => void;
}) {
  const [atividadeId, setAtividadeId] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const [mestre, setMestre] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  // Serviço (Fundação): os LOTEs e o que o mestre vai fazer.
  const [lotesServico, setLotesServico] = useState<Set<string>>(() => new Set());
  const [observacao, setObservacao] = useState('');
  const atividade = atividadeId ? atividadePorId(atividadeId) : undefined;
  const servico = Boolean(atividade && !atividade.filtro);
  const agendadas = useMemo(() => pecasAgendadas(pacotes), [pacotes]);
  const montadasAqui = useMemo(() => montadasNosPacotes(pacotes), [pacotes]);
  const doLote = useMemo(() => (atividade ? pecasDaAtividade(lotes, atividade, montadasAqui) : []), [lotes, atividade, montadasAqui]);
  const livres = (lote: (typeof doLote)[number]) => lote.pecas.filter((peca) => !peca.montada && !agendadas.has(chavePeca(peca.lote, peca.codigo)));
  const contagem = (id: string) => pecasDaAtividade(lotes, atividadePorId(id)!, montadasAqui).reduce((total, lote) => total + livres(lote).length, 0);

  const escolherAtividade = (id: string) => { setAtividadeId(id); setSelecionadas(new Set()); setLotesServico(new Set()); setObservacao(''); };
  const alternar = (chaves: string[], marcar: boolean) => setSelecionadas((atuais) => {
    const proximas = new Set(atuais);
    for (const chave of chaves) if (marcar) proximas.add(chave); else proximas.delete(chave);
    return proximas;
  });

  const periodo = { inicio, fim };
  const temPeriodo = periodoValido(periodo);
  const conflitos = mestre && temPeriodo ? conflitosDoMestre(pacotes, mestre, periodo) : [];
  const foraDaAlocacao = Boolean(mestre && temPeriodo && !dentroDaAlocacao(alocacoes, mestre, periodo));
  const escolhidas = doLote.flatMap((lote) => lote.pecas).filter((peca) => selecionadas.has(chavePeca(peca.lote, peca.codigo)));
  const lotesEscolhidos = servico ? lotesServico.size : new Set(escolhidas.map((peca) => peca.lote)).size;
  const quantos = servico ? lotesServico.size : selecionadas.size;
  const pronto = atividade && quantos > 0 && mestre && temPeriodo;

  function agendar() {
    if (!pronto || !atividade) return;
    const texto = observacao.trim();
    onAgendar({
      id: `${Date.now()}`, atividade: atividade.id, mestre, inicio, fim,
      pecas: servico ? [] : escolhidas.map((peca) => ({ lote: peca.lote, codigo: peca.codigo, tipo: peca.tipo })),
      ...(servico ? { lotes: lotes.filter((lote) => lotesServico.has(lote.chave)).map((lote) => lote.chave) } : {}),
      ...(texto ? { observacao: texto } : {}),
    });
    setSelecionadas(new Set());
    setLotesServico(new Set());
    setObservacao('');
  }

  return (
    <Box>
      <Passo numero={1} titulo="Atividade">
        <Stack spacing={1.25}>
          {CATEGORIAS.map((categoria) => (
            <Stack key={categoria.nome} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 130, color: COR_CATEGORIA[categoria.nome] }}>{categoria.nome}</Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {categoria.atividades.map((item) => {
                  const n = item.filtro ? contagem(item.id) : 1;
                  return (
                    <Chip
                      key={item.id}
                      label={item.filtro ? `${item.nome} · ${n}` : item.nome}
                      onClick={() => escolherAtividade(item.id)}
                      color={atividadeId === item.id ? 'primary' : 'default'}
                      variant={atividadeId === item.id ? 'filled' : 'outlined'}
                      sx={{ opacity: n || atividadeId === item.id ? 1 : 0.6 }}
                    />
                  );
                })}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Passo>

      {atividade && servico && (
        <Passo numero={2} titulo={`LOTEs · ${atividade.categoria} → ${atividade.nome}`}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Serviço na obra, sem peças do Plannix: marque onde o mestre vai e o que vai fazer.</Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {lotes.map((lote) => (
              <Tooltip key={lote.chave} title={lote.nome}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={lotesServico.has(lote.chave)} onChange={(event) => setLotesServico((atuais) => {
                    const proximos = new Set(atuais);
                    if (event.target.checked) proximos.add(lote.chave); else proximos.delete(lote.chave);
                    return proximos;
                  })} />}
                  label={nomeCurto(lote.nome)}
                />
              </Tooltip>
            ))}
          </Stack>
          <TextField size="small" fullWidth label="O que vai ser feito (opcional)" placeholder="Ex.: 4 sapatas do encontro A" value={observacao} onChange={(event) => setObservacao(event.target.value.slice(0, 200))} sx={{ mt: 1, maxWidth: 560 }} />
        </Passo>
      )}

      {atividade && !servico && (
        <Passo numero={2} titulo={`Peças · ${atividade.categoria} → ${atividade.nome}`}>
          {!doLote.length ? (
            <Typography variant="body2" color="text.secondary">Nenhuma peça desta atividade nos LOTEs da obra.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {doLote.map((lote) => {
                const disponiveis = livres(lote).map((peca) => chavePeca(peca.lote, peca.codigo));
                const marcadas = disponiveis.filter((chave) => selecionadas.has(chave)).length;
                return (
                  <Paper key={lote.lote} variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.75, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider' }}>
                      <Checkbox
                        size="small"
                        checked={disponiveis.length > 0 && marcadas === disponiveis.length}
                        indeterminate={marcadas > 0 && marcadas < disponiveis.length}
                        disabled={!disponiveis.length}
                        onChange={(event) => alternar(disponiveis, event.target.checked)}
                        inputProps={{ 'aria-label': `Todas as peças livres do ${lote.nome}` }}
                      />
                      <Tooltip title={lote.nome}><Typography sx={{ fontWeight: 700 }}>{nomeCurto(lote.nome)}</Typography></Tooltip>
                      <Box sx={{ flex: 1, maxWidth: 220 }}><LinearProgress variant="determinate" value={lote.completude * 100} color="success" sx={{ height: 6, borderRadius: 3 }} /></Box>
                      <Typography variant="body2" color="text.secondary">
                        {lote.pendentes ? `${porcentagem(lote.completude)} pronto · ${lote.pendentes} a montar` : 'Tudo montado'}
                        {lote.pecas.length > lote.pendentes ? ` · ${lote.pecas.length - lote.pendentes} ${lote.pecas.length - lote.pendentes === 1 ? 'montada' : 'montadas'}` : ''}
                      </Typography>
                    </Stack>
                    {lote.aguardandoProjeto > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>{`${lote.aguardandoProjeto} aguardando projeto no Plannix (sem código ainda).`}</Typography>
                    )}
                    {lote.pecas.length > 0 && (
                      <Table size="small">
                        <TableBody>
                          {lote.pecas.map((peca) => {
                            const chave = chavePeca(peca.lote, peca.codigo);
                            const pacote = agendadas.get(chave);
                            const etapa = etapaPlannix(peca.etapa);
                            const ocupada = Boolean(pacote) || peca.montada;
                            return (
                              <TableRow key={chave} hover={!ocupada} sx={{ opacity: ocupada ? 0.6 : 1 }}>
                                <TableCell padding="checkbox">
                                  <Checkbox size="small" checked={selecionadas.has(chave)} disabled={ocupada} onChange={(event) => alternar([chave], event.target.checked)} inputProps={{ 'aria-label': `Peça ${peca.codigo}` }} />
                                </TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{peca.codigo}</TableCell>
                                <TableCell>{peca.tipo}</TableCell>
                                <TableCell><Chip size="small" label={etapa.rotulo} color={etapa.cor} variant={etapa.cor === 'default' ? 'outlined' : 'filled'} /></TableCell>
                                <TableCell sx={{ width: 150 }}>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <LinearProgress variant="determinate" value={peca.completude * 100} color="success" sx={{ flex: 1, height: 5, borderRadius: 3 }} />
                                    <Typography variant="caption" color="text.secondary">{porcentagem(peca.completude)}</Typography>
                                  </Stack>
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                  {peca.montada ? (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Chip size="small" label="Montada" color="success" />
                                      <Typography variant="caption" color="text.secondary">{pacote ? `${pacote.mestre}, ${dataCurta(pacote.inicio)}–${dataCurta(pacote.fim)}` : 'no Plannix'}</Typography>
                                    </Stack>
                                  ) : pacote ? (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Chip size="small" label="Agendada" color="info" />
                                      <Typography variant="caption" color="text.secondary">{`${pacote.mestre}, ${dataCurta(pacote.inicio)}–${dataCurta(pacote.fim)}`}</Typography>
                                    </Stack>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Passo>
      )}

      {atividade && (
        <Passo numero={3} titulo="Mestre e período">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField select size="small" label="Mestre" value={mestre} onChange={(event) => setMestre(event.target.value)} sx={{ minWidth: 260 }}>
              {mestres.map((nome) => {
                const alocacao = alocacoes.find((item) => item.mestre === nome && item.fim >= hoje);
                return (
                  <MenuItem key={nome} value={nome}>
                    <Stack>
                      <span>{nome}</span>
                      <Typography variant="caption" color="text.secondary">
                        {alocacao ? `Nesta obra (${nomeCurto(lotes.find((l) => l.chave === alocacao.lote)?.nome ?? '')}) até ${dataCurta(alocacao.fim)}` : 'Sem alocação nesta obra'}
                      </Typography>
                    </Stack>
                  </MenuItem>
                );
              })}
            </TextField>
            <TextField size="small" type="date" label="Início" value={inicio} onChange={(event) => setInicio(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Fim" value={fim} onChange={(event) => setFim(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: inicio || undefined } }} />
            <Button variant="contained" disabled={!pronto} onClick={agendar}>
              {!quantos ? 'Agendar' : servico ? `Agendar em ${quantos} ${quantos === 1 ? 'LOTE' : 'LOTEs'}` : `Agendar ${quantos} ${quantos === 1 ? 'peça' : 'peças'}`}
            </Button>
          </Stack>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {inicio && fim && !temPeriodo && <Alert severity="error">O fim é antes do início.</Alert>}
            {conflitos.length > 0 && (
              <Alert severity="warning">
                {`${mestre} já tem ${conflitos.map((p) => `${atividadePorId(p.atividade)?.nome} (${dataCurta(p.inicio)}–${dataCurta(p.fim)})`).join(', ')} neste período.`}
              </Alert>
            )}
            {!servico && lotesEscolhidos > 1 && <Alert severity="info">{`Peças de ${lotesEscolhidos} LOTEs no mesmo pacote.`}</Alert>}
            {foraDaAlocacao && <Alert severity="info">{`${mestre} não está alocado nesta obra no CronoObra o período todo.`}</Alert>}
            {temPeriodo && <Typography variant="body2" color="text.secondary">{`${diasDoPeriodo(periodo)} dias.`}</Typography>}
          </Stack>
        </Passo>
      )}
    </Box>
  );
}

/** Lista: as alocações do CronoObra e os pacotes de trabalho agendados. */
export function ListaMestres({ lotes, alocacoes, pacotes, onExcluir, onMarcarPeca, onConcluir }: {
  lotes: LoteMki[];
  alocacoes: Alocacao[];
  pacotes: Pacote[];
  onExcluir: (pacote: Pacote) => void;
  onMarcarPeca: MarcarPeca;
  onConcluir: (pacote: Pacote, concluido: boolean) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const pacoteAberto = pacotes.find((pacote) => pacote.id === aberto);
  const nomeDoLote = (chave: string) => nomeCurto(lotes.find((lote) => lote.chave === chave)?.nome ?? chave);
  const cabecalho = (titulos: string[]) => <TableHead><TableRow>{titulos.map((t) => <TableCell key={t} sx={{ fontWeight: 700 }}>{t}</TableCell>)}</TableRow></TableHead>;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Alocados no CronoObra</Typography>
        <TableContainer>
          <Table size="small">
            {cabecalho(['Mestre', 'LOTE', 'Início', 'Fim', 'Dias'])}
            <TableBody>
              {alocacoes.map((a) => (
                <TableRow key={`${a.mestre}:${a.inicio}`}>
                  <TableCell>{a.mestre}</TableCell><TableCell>{nomeDoLote(a.lote)}</TableCell>
                  <TableCell>{dataCurta(a.inicio)}/{a.inicio.slice(0, 4)}</TableCell><TableCell>{dataCurta(a.fim)}/{a.fim.slice(0, 4)}</TableCell>
                  <TableCell>{`${diasDoPeriodo(a)} dias`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>Pacotes de trabalho</Typography>
        {!pacotes.length ? <Typography color="text.secondary">Nenhum pacote agendado. Agende em Atividades.</Typography> : (
          <TableContainer>
            <Table size="small">
              {cabecalho(['Atividade', 'Peças', 'LOTE', 'Mestre', 'Período', 'Dias', ''])}
              <TableBody>
                {[...pacotes].sort((a, b) => a.inicio.localeCompare(b.inicio)).map((p) => {
                  const atividade = atividadePorId(p.atividade);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: corDoPacote(p), flexShrink: 0 }} />
                          <Box>
                            <span>{atividade ? `${atividade.categoria} → ${atividade.nome}` : p.atividade}</span>
                            {p.observacao && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{p.observacao}</Typography>}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {p.pecas.length ? (
                          <Button size="small" onClick={() => setAberto(p.id)}>
                            {`${p.pecas.filter((peca) => peca.montada).length} de ${p.pecas.length} ${p.pecas.length === 1 ? 'montada' : 'montadas'}`}
                          </Button>
                        ) : (
                          <FormControlLabel control={<Checkbox size="small" checked={Boolean(p.concluido)} onChange={(event) => onConcluir(p, event.target.checked)} />} label="Serviço feito" />
                        )}
                      </TableCell>
                      <TableCell>{lotesDoPacote(p).map(nomeDoLote).join(', ')}</TableCell>
                      <TableCell>{p.mestre}</TableCell>
                      <TableCell>{`${dataCurta(p.inicio)} a ${dataCurta(p.fim)}`}</TableCell>
                      <TableCell>{diasDoPeriodo(p)}</TableCell>
                      <TableCell padding="checkbox">
                        <Tooltip title="Excluir o pacote (as peças voltam a ficar livres)">
                          <IconButton size="small" onClick={() => onExcluir(p)} aria-label={`Excluir o pacote de ${atividade?.nome ?? p.atividade}`}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Dialog open={Boolean(pacoteAberto)} onClose={() => setAberto(null)} fullWidth maxWidth="sm">
        <DialogTitle>{pacoteAberto && `${atividadePorId(pacoteAberto.atividade)?.nome} · ${pacoteAberto.mestre}, ${dataCurta(pacoteAberto.inicio)} a ${dataCurta(pacoteAberto.fim)}`}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Expedida no Plannix → Agendada aqui → Montada. A que não foi montada volta a Expedida e sai do pacote.
          </Typography>
          <Table size="small">
            <TableBody>
              {pacoteAberto?.pecas.map((peca) => {
                const chave = chavePeca(peca.lote, peca.codigo);
                return (
                  <TableRow key={chave}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{peca.codigo}</TableCell>
                    <TableCell>{peca.tipo}</TableCell>
                    <TableCell>{nomeDoLote(peca.lote)}</TableCell>
                    <TableCell><Chip size="small" label={peca.montada ? 'Montada' : 'Agendada'} color={peca.montada ? 'success' : 'info'} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {peca.montada ? (
                        <Button size="small" color="inherit" onClick={() => onMarcarPeca(pacoteAberto.id, chave, 'agendada')}>Desfazer</Button>
                      ) : (
                        <>
                          <Button size="small" onClick={() => onMarcarPeca(pacoteAberto.id, chave, 'montada')}>Montada</Button>
                          <Tooltip title="Não foi montada: sai do pacote e fica livre para agendar de novo">
                            <Button size="small" color="inherit" onClick={() => onMarcarPeca(pacoteAberto.id, chave, 'expedida')}>Voltar a Expedida</Button>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          {pacoteAberto && pacoteAberto.pecas.some((peca) => !peca.montada) && (
            <Button onClick={() => pacoteAberto.pecas.filter((peca) => !peca.montada).forEach((peca) => onMarcarPeca(pacoteAberto.id, chavePeca(peca.lote, peca.codigo), 'montada'))}>
              Todas montadas
            </Button>
          )}
          <Button onClick={() => setAberto(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

const DIAS = 42;
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const diaDaSemana = (data: string) => new Date(`${data}T12:00:00Z`).getUTCDay();
const segundaDe = (data: string) => somarDias(data, -((diaDaSemana(data) + 6) % 7));

/** Calendários: por mestre, 6 semanas; a alocação do CronoObra (faixa clara) e os pacotes (cor da categoria). */
export function CalendarioMestres({ lotes, mestres, alocacoes, pacotes, hoje }: { lotes: LoteMki[]; mestres: string[]; alocacoes: Alocacao[]; pacotes: Pacote[]; hoje: string }) {
  const [inicio, setInicio] = useState(() => segundaDe(hoje));
  const dias = Array.from({ length: DIAS }, (_, i) => somarDias(inicio, i));
  const fim = dias[DIAS - 1];
  const coluna = (data: string) => Math.max(0, Math.min(DIAS - 1, Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000)));
  const grade = { display: 'grid', gridTemplateColumns: `150px repeat(${DIAS}, minmax(20px, 1fr))`, minWidth: 150 + DIAS * 20 };
  const fundoDoDia = (data: string) => (data === hoje ? 'rgba(46,157,111,.14)' : diaDaSemana(data) % 6 === 0 ? '#f3f5f7' : 'transparent');

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <IconButton size="small" onClick={() => setInicio(somarDias(inicio, -7))} aria-label="Semana anterior"><ChevronLeftIcon /></IconButton>
        <Button size="small" onClick={() => setInicio(segundaDe(hoje))}>Hoje</Button>
        <IconButton size="small" onClick={() => setInicio(somarDias(inicio, 7))} aria-label="Próxima semana"><ChevronRightIcon /></IconButton>
        <Typography variant="body2" color="text.secondary">{`${dataCurta(inicio)}/${inicio.slice(0, 4)} a ${dataCurta(fim)}/${fim.slice(0, 4)}`}</Typography>
      </Stack>
      <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ ...grade, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ p: 0.75, fontWeight: 700, fontSize: 13 }}>Mestre</Box>
          {dias.map((data) => (
            <Box key={data} sx={{ textAlign: 'center', fontSize: 11, py: 0.5, bgcolor: fundoDoDia(data), borderLeft: data.endsWith('-01') ? '2px solid #12293B' : undefined }}>
              <div style={{ color: '#5B5D5B' }}>{SEMANA[diaDaSemana(data)]}</div>
              <div style={{ fontWeight: data === hoje ? 800 : 500 }}>{Number(data.slice(8, 10))}</div>
            </Box>
          ))}
        </Box>
        {mestres.map((mestre) => {
          const faixas = [
            ...alocacoes.filter((a) => a.mestre === mestre && a.inicio <= fim && a.fim >= inicio)
              .map((a) => ({ chave: `a:${a.inicio}`, de: a.inicio, ate: a.fim, rotulo: `CronoObra · ${nomeCurto(lotes.find((l) => l.chave === a.lote)?.nome ?? '')}`, cor: '', titulo: `Alocado no CronoObra: ${dataCurta(a.inicio)} a ${dataCurta(a.fim)}` })),
            ...pacotes.filter((p) => p.mestre === mestre && p.inicio <= fim && p.fim >= inicio)
              .map((p) => ({
                chave: p.id, de: p.inicio, ate: p.fim, rotulo: atividadePorId(p.atividade)?.nome ?? p.atividade, cor: corDoPacote(p),
                titulo: `${atividadePorId(p.atividade)?.nome}: ${p.pecas.length ? `${p.pecas.filter((peca) => peca.montada).length} de ${p.pecas.length} peças montadas` : `serviço${p.concluido ? ' feito' : ''}`}, ${dataCurta(p.inicio)} a ${dataCurta(p.fim)}${p.observacao ? ` · ${p.observacao}` : ''}`,
              })),
          ];
          // Uma linha por faixa que se cruza (o mestre em dois pacotes ao mesmo tempo aparece em duas linhas).
          const linhas: { ate: string }[] = [];
          const comLinha = faixas.map((f) => {
            let linha = linhas.findIndex((l) => l.ate < f.de);
            if (linha < 0) { linha = linhas.length; linhas.push({ ate: f.ate }); } else linhas[linha] = { ate: f.ate };
            return { ...f, linha };
          });
          return (
            <Box key={mestre} sx={{ ...grade, gridAutoRows: 26, borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
              <Box sx={{ gridColumn: 1, gridRow: `1 / span ${Math.max(1, linhas.length)}`, p: 0.75, fontSize: 13, fontWeight: 600, borderRight: 1, borderColor: 'divider' }}>{mestre}</Box>
              {dias.map((data, i) => (
                <Box key={data} sx={{ gridColumn: i + 2, gridRow: `1 / span ${Math.max(1, linhas.length)}`, bgcolor: fundoDoDia(data), borderLeft: data.endsWith('-01') ? '2px solid #12293B' : undefined }} />
              ))}
              {comLinha.map((f) => (
                <Tooltip key={f.chave} title={f.titulo}>
                  <Box sx={{
                    gridColumn: `${coluna(f.de) + 2} / ${coluna(f.ate) + 3}`, gridRow: f.linha + 1, m: '3px 1px', px: 0.75, borderRadius: 1, fontSize: 11, fontWeight: 700,
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: '20px', zIndex: 1,
                    ...(f.cor ? { bgcolor: f.cor, color: '#fff' } : { bgcolor: '#E8EEF3', color: '#12293B', border: '1px dashed #9fb3c4' }),
                  }}>
                    {f.rotulo}
                  </Box>
                </Tooltip>
              ))}
            </Box>
          );
        })}
      </Box>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 14, height: 10, bgcolor: '#E8EEF3', border: '1px dashed #9fb3c4' }} /><Typography variant="caption">Alocação no CronoObra</Typography></Stack>
        {Object.entries(COR_CATEGORIA).map(([nome, cor]) => (
          <Fragment key={nome}>
            <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 14, height: 10, bgcolor: cor, borderRadius: 0.5 }} /><Typography variant="caption">{nome}</Typography></Stack>
          </Fragment>
        ))}
      </Stack>
    </Box>
  );
}

