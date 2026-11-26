import { Fragment, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
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
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import {
  avisoDasPecas,
  formatar,
  itensCalculados,
  listaDeMateriais,
  pecasUsadas,
  type ItemCatalogo,
  type Pacote,
  type PreFabricadoDaObra,
  type ServicoDaObra,
  type ServicoModelo,
} from './composicoes';

// A obra no /testes/mkii (composicoes.ts): o serviço-modelo aplicado com quantidade e LOTE (itens calculados e as peças
// do Plannix) e os pacotes, que juntam serviços da obra e se vinculam ao mestre alocado.

const cabecalho = (titulos: string[]) => (
  <TableHead><TableRow>{titulos.map((t, i) => <TableCell key={`${t}-${i}`} sx={{ fontWeight: 700 }}>{t}</TableCell>)}</TableRow></TableHead>
);

export type ObraMkii = { id: string; nome: string; lotes: { chave: string; nome: string }[]; preFabricados: PreFabricadoDaObra[]; alocacoes: { id: string; mestre: string; lote: string }[] };

const nomeDoLote = (obra: ObraMkii, chave: string) => obra.lotes.find((l) => l.chave === chave)?.nome ?? chave;

/** Serviços da obra: aplicar um modelo (quantidade e LOTE) e ver os itens calculados; escolher as peças do LOTE. */
export function ServicosDaObraMkii({ obra, itens, modelos, servicos, onMudar }: {
  obra: ObraMkii;
  itens: ItemCatalogo[];
  modelos: ServicoModelo[];
  servicos: ServicoDaObra[];
  onMudar: (servicos: ServicoDaObra[]) => void;
}) {
  const daObra = servicos.filter((s) => s.obra === obra.id);
  const [form, setForm] = useState({ modelo: modelos[0]?.id ?? '', quantidade: '', lote: obra.lotes[0]?.chave ?? '', observacao: '' });
  const [aberto, setAberto] = useState<string | null>(null);
  const [peca, setPeca] = useState({ preFabricado: '', quantidade: '1' });
  const modeloDoForm = modelos.find((m) => m.id === form.modelo);
  const quantidade = Number(form.quantidade.replace(',', '.'));
  const porId = new Map(itens.map((i) => [i.id, i]));
  const alterar = (id: string, mudanca: Partial<ServicoDaObra>) => onMudar(servicos.map((s) => (s.id === id ? { ...s, ...mudanca } : s)));

  const aplicar = () => {
    if (!modeloDoForm || !(quantidade > 0)) return;
    const id = `so-${Date.now()}`;
    onMudar([...servicos, { id, obra: obra.id, modelo: form.modelo, quantidade, lote: form.lote, pecas: [], observacao: form.observacao.trim() }]);
    setForm({ ...form, quantidade: '', observacao: '' });
    setAberto(id);
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Aplicar um serviço-modelo nesta obra</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} component="form" onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
          <TextField select size="small" label="Serviço-modelo" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} sx={{ minWidth: 240 }}>
            {modelos.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Quantidade" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} inputProps={{ inputMode: 'decimal' }} InputProps={{ endAdornment: <InputAdornment position="end">{modeloDoForm?.unidade}</InputAdornment> }} sx={{ width: { md: 150 } }} />
          <TextField select size="small" label="LOTE" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} sx={{ minWidth: 120 }}>
            {obra.lotes.map((l) => <MenuItem key={l.chave} value={l.chave}>{l.nome}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Observação (opcional)" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} sx={{ flex: 1 }} />
          <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={!modeloDoForm || !(quantidade > 0)}>Aplicar</Button>
        </Stack>
      </Paper>

      {!daObra.length ? <Typography color="text.secondary">Nenhum serviço aplicado nesta obra.</Typography> : (
        <TableContainer>
          <Table size="small">
            {cabecalho(['', 'Serviço', 'LOTE', 'Quantidade', 'Pré-fabricados', ''])}
            <TableBody>
              {daObra.map((s) => {
                const modelo = modelos.find((m) => m.id === s.modelo);
                const estaAberto = aberto === s.id;
                const doLote = obra.preFabricados.filter((pf) => pf.lote === s.lote);
                return (
                  <Fragment key={s.id}>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <IconButton size="small" aria-label={estaAberto ? 'Fechar' : 'Ver os itens'} onClick={() => setAberto(estaAberto ? null : s.id)}>{estaAberto ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}</IconButton>
                      </TableCell>
                      <TableCell>
                        {modelo?.nome ?? '(modelo excluído)'}
                        {s.observacao && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{s.observacao}</Typography>}
                      </TableCell>
                      <TableCell>{nomeDoLote(obra, s.lote)}</TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={s.quantidade} onChange={(e) => alterar(s.id, { quantidade: Math.max(0, Number(e.target.value) || 0) })} inputProps={{ min: 0, step: 'any', 'aria-label': `Quantidade de ${modelo?.nome}` }} InputProps={{ endAdornment: <InputAdornment position="end">{modelo?.unidade}</InputAdornment> }} sx={{ width: 140 }} />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {s.pecas.map((p) => {
                            const pf = obra.preFabricados.find((x) => x.id === p.preFabricado);
                            return pf ? <Chip key={p.preFabricado} size="small" label={`${pf.tipo} × ${p.quantidade}`} color={avisoDasPecas(servicos.filter((x) => x.obra === obra.id), pf) ? 'warning' : 'default'} onDelete={() => alterar(s.id, { pecas: s.pecas.filter((x) => x.preFabricado !== p.preFabricado) })} /> : null;
                          })}
                          {!s.pecas.length && '—'}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Tirar da obra (sai também dos pacotes)">
                          <IconButton size="small" aria-label={`Tirar ${modelo?.nome} da obra`} onClick={() => onMudar(servicos.filter((x) => x.id !== s.id))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                    {estaAberto && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Itens calculados</Typography>
                              {itensCalculados(s, modelos).map((i) => {
                                const coeficiente = modelo?.itens.find((x) => x.item === i.item)?.coeficiente ?? 0;
                                return (
                                  <Typography key={i.item} variant="body2">
                                    {`${porId.get(i.item)?.descricao ?? '(item excluído)'}: ${formatar(coeficiente)} × ${formatar(s.quantidade)} = `}<strong>{`${formatar(i.quantidade)} ${i.unidade}`}</strong>
                                  </Typography>
                                );
                              })}
                              {!modelo?.itens.length && <Typography variant="body2" color="text.secondary">O modelo não tem itens.</Typography>}
                            </Box>
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{`Peças do ${nomeDoLote(obra, s.lote)} (Plannix)`}</Typography>
                              {!doLote.length ? <Typography variant="body2" color="text.secondary">O LOTE não tem pré-fabricados.</Typography> : (
                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                  <TextField select size="small" label="Tipo de peça" value={peca.preFabricado} onChange={(e) => setPeca({ ...peca, preFabricado: e.target.value })} sx={{ minWidth: 200 }}>
                                    {doLote.map((pf) => (
                                      <MenuItem key={pf.id} value={pf.id}>{`${pf.tipo} · ${pf.quantidade - pecasUsadas(servicos, pf.id)} de ${pf.quantidade} livres · ${pf.expedidas} expedidas`}</MenuItem>
                                    ))}
                                  </TextField>
                                  <TextField size="small" type="number" label="Peças" value={peca.quantidade} onChange={(e) => setPeca({ ...peca, quantidade: e.target.value })} inputProps={{ min: 1, step: 1 }} sx={{ width: 90 }} />
                                  <Button
                                    disabled={!doLote.some((pf) => pf.id === peca.preFabricado) || !(Number(peca.quantidade) >= 1)}
                                    onClick={() => {
                                      const n = Math.round(Number(peca.quantidade));
                                      alterar(s.id, { pecas: [...s.pecas.filter((p) => p.preFabricado !== peca.preFabricado), { preFabricado: peca.preFabricado, quantidade: n }] });
                                    }}
                                  >
                                    Incluir
                                  </Button>
                                </Stack>
                              )}
                              {doLote.map((pf) => {
                                const aviso = avisoDasPecas(servicos.filter((x) => x.obra === obra.id), pf);
                                return aviso ? <Typography key={pf.id} variant="caption" color="warning.dark" sx={{ display: 'block', mt: 0.5 }}>{aviso}</Typography> : null;
                              })}
                            </Box>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

/** Pacotes da obra: à esquerda os serviços da obra, à direita o pacote, o mestre e a lista de materiais somada. */
export function PacotesMkii({ obra, itens, modelos, servicos, pacotes, onMudar }: {
  obra: ObraMkii;
  itens: ItemCatalogo[];
  modelos: ServicoModelo[];
  servicos: ServicoDaObra[];
  pacotes: Pacote[];
  onMudar: (pacotes: Pacote[]) => void;
}) {
  const daObra = pacotes.filter((p) => p.obra === obra.id);
  const servicosDaObra = servicos.filter((s) => s.obra === obra.id);
  const [selecionado, setSelecionado] = useState<string | null>(daObra[0]?.id ?? null);
  const pacote = daObra.find((p) => p.id === selecionado) ?? null;
  const alterar = (mudanca: Partial<Pacote>) => pacote && onMudar(pacotes.map((p) => (p.id === pacote.id ? { ...p, ...mudanca } : p)));
  const porId = new Map(itens.map((i) => [i.id, i]));
  const nomeDoServico = (s: ServicoDaObra) => {
    const m = modelos.find((x) => x.id === s.modelo);
    return `${m?.nome ?? '(modelo excluído)'} · ${formatar(s.quantidade)} ${m?.unidade ?? ''}`;
  };
  const novo = () => {
    const id = `pacote-${Date.now()}`;
    let n = daObra.length + 1;
    while (daObra.some((p) => p.nome === `Pacote ${n}`)) n += 1;
    onMudar([...pacotes, { id, obra: obra.id, nome: `Pacote ${n}`, servicos: [], alocacao: '' }]);
    setSelecionado(id);
  };
  const doPacote = servicosDaObra.filter((s) => pacote?.servicos.includes(s.id));
  const pecasDoPacote = new Map<string, number>();
  doPacote.forEach((s) => s.pecas.forEach((p) => pecasDoPacote.set(p.preFabricado, (pecasDoPacote.get(p.preFabricado) ?? 0) + p.quantidade)));

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}>
      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Serviços da obra</Typography>
        <Table size="small">
          <TableBody>
            {servicosDaObra.map((s) => {
              const noPacote = Boolean(pacote?.servicos.includes(s.id));
              const outros = daObra.filter((p) => p.id !== pacote?.id && p.servicos.includes(s.id)).map((p) => p.nome);
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    {nomeDoServico(s)}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{[nomeDoLote(obra, s.lote), outros.length ? `em ${outros.join(', ')}` : ''].filter(Boolean).join(' · ')}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={!pacote ? 'Crie ou escolha um pacote' : noPacote ? 'Já está no pacote' : 'Levar ao pacote'}>
                      <span>
                        <IconButton size="small" color="primary" aria-label={`Levar ${nomeDoServico(s)} ao pacote`} disabled={!pacote || noPacote} onClick={() => pacote && alterar({ servicos: [...pacote.servicos, s.id] })}>
                          {noPacote ? <CheckIcon fontSize="small" /> : <ArrowForwardIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {!servicosDaObra.length && <TableRow><TableCell><Typography color="text.secondary">Nenhum serviço aplicado: aplique em Serviços da obra.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Pacote</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {daObra.map((p) => <Chip key={p.id} label={p.nome || '(sem nome)'} color={p.id === selecionado ? 'primary' : 'default'} variant={p.id === selecionado ? 'filled' : 'outlined'} onClick={() => setSelecionado(p.id)} />)}
          <Button size="small" startIcon={<AddIcon />} onClick={novo}>Novo pacote</Button>
        </Stack>
        {!pacote ? <Typography color="text.secondary" sx={{ mt: 2 }}>Nenhum pacote nesta obra.</Typography> : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField size="small" label="Nome do pacote" value={pacote.nome} onChange={(e) => alterar({ nome: e.target.value })} sx={{ flex: 1 }} />
              <TextField select size="small" label="Mestre (alocação no CronoObra)" value={pacote.alocacao} onChange={(e) => alterar({ alocacao: e.target.value })} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ minWidth: 240 }}>
                <MenuItem value=""><em>Sem mestre</em></MenuItem>
                {obra.alocacoes.map((a) => <MenuItem key={a.id} value={a.id}>{`${a.mestre} · ${nomeDoLote(obra, a.lote)}`}</MenuItem>)}
              </TextField>
            </Stack>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Serviços</Typography>
              {!doPacote.length ? <Typography variant="body2" color="text.secondary">Leve os serviços da obra com a seta.</Typography> : (
                <Table size="small">
                  <TableBody>
                    {doPacote.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{nomeDoServico(s)}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{nomeDoLote(obra, s.lote)}</Typography></TableCell>
                        <TableCell align="right"><IconButton size="small" aria-label={`Tirar ${nomeDoServico(s)} do pacote`} onClick={() => alterar({ servicos: pacote.servicos.filter((id) => id !== s.id) })}><CloseIcon fontSize="small" /></IconButton></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
            {doPacote.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>O que o pacote leva (somado dos serviços)</Typography>
                <Table size="small">
                  {cabecalho(['Item', 'Quantidade'])}
                  <TableBody>
                    {listaDeMateriais(doPacote, modelos).map((i) => (
                      <TableRow key={`${i.item}|${i.unidade}`}>
                        <TableCell>{porId.get(i.item)?.descricao ?? '(item excluído)'}</TableCell>
                        <TableCell>{`${formatar(i.quantidade)} ${i.unidade}`}</TableCell>
                      </TableRow>
                    ))}
                    {[...pecasDoPacote].map(([id, n]) => {
                      const pf = obra.preFabricados.find((x) => x.id === id);
                      return pf ? (
                        <TableRow key={id}>
                          <TableCell>{`${pf.tipo} (${nomeDoLote(obra, pf.lote)}, Plannix)`}</TableCell>
                          <TableCell>{`${n} ${n === 1 ? 'peça' : 'peças'} · ${pf.expedidas} de ${pf.quantidade} expedidas`}</TableCell>
                        </TableRow>
                      ) : null;
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
            <Stack direction="row" justifyContent="flex-end">
              <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => { onMudar(pacotes.filter((p) => p.id !== pacote.id)); setSelecionado(daObra.find((p) => p.id !== pacote.id)?.id ?? null); }}>Excluir pacote</Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
