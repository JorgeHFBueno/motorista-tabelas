import { useMemo, useState } from 'react';
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { etapaPlannix } from '../../obras/preFabricados';
import {
  CATEGORIAS_CADASTRO,
  adicionarAoPacote,
  alterarQuantidade,
  avisoDoItem,
  formatarQuantidade,
  livreDoItem,
  nomeDaCategoria,
  removerDoPacote,
  usoDoItem,
  type CategoriaCadastro,
  type ItemCadastro,
  type Pacote,
} from './pacotesTrabalho';

// Aba Atividade do /testes/mki (pacotesTrabalho.ts): Cadastros (os itens da obra por categoria) e Pacotes (a "receita":
// itens dos cadastros, à esquerda, levados ao pacote, à direita). Tudo em memória.

const cabecalho = (titulos: string[]) => (
  <TableHead><TableRow>{titulos.map((titulo, index) => <TableCell key={`${titulo}-${index}`} sx={{ fontWeight: 700 }}>{titulo}</TableCell>)}</TableRow></TableHead>
);

function ChipsDeCategoria({ valor, onMudar, itens, todas = false }: { valor: CategoriaCadastro | 'todas'; onMudar: (valor: CategoriaCadastro | 'todas') => void; itens: ItemCadastro[]; todas?: boolean }) {
  const opcoes = [...(todas ? [{ id: 'todas' as const, nome: 'Todas' }] : []), ...CATEGORIAS_CADASTRO];
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {opcoes.map((opcao) => {
        const quantos = opcao.id === 'todas' ? itens.length : itens.filter((item) => item.categoria === opcao.id).length;
        return (
          <Chip
            key={opcao.id}
            label={`${opcao.nome} · ${quantos}`}
            color={valor === opcao.id ? 'primary' : 'default'}
            variant={valor === opcao.id ? 'filled' : 'outlined'}
            onClick={() => onMudar(opcao.id)}
          />
        );
      })}
    </Stack>
  );
}

function EtapaDaPeca({ etapa }: { etapa?: string }) {
  const { rotulo, cor } = etapaPlannix(etapa ?? '');
  return <Chip size="small" label={rotulo} color={cor} variant="outlined" />;
}

type Formulario = { id: string | null; descricao: string; quantidade: string; unidade: string };
const VAZIO: Formulario = { id: null, descricao: '', quantidade: '', unidade: '' };

/** Cadastros: os itens da obra por categoria. Pré-fabricados vêm do Plannix; os outros se criam, editam e excluem aqui. */
export function Cadastros({ itens, pacotes, nomeDoLote, onSalvar, onExcluir }: {
  itens: ItemCadastro[];
  pacotes: Pacote[];
  nomeDoLote: (chave: string) => string;
  onSalvar: (item: ItemCadastro) => void;
  onExcluir: (item: ItemCadastro) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaCadastro>('insumos');
  const [form, setForm] = useState<Formulario>(VAZIO);
  const daCategoria = itens.filter((item) => item.categoria === categoria);
  const quantidade = Number(form.quantidade.replace(',', '.'));
  const valido = form.descricao.trim() !== '' && Number.isFinite(quantidade) && quantidade > 0;

  const salvar = () => {
    if (!valido) return;
    onSalvar({ id: form.id ?? `${categoria}-${Date.now()}`, categoria, descricao: form.descricao.trim(), quantidade, unidade: form.unidade.trim() || 'un' });
    setForm(VAZIO);
  };
  const emPacotes = (item: ItemCadastro) => {
    const uso = usoDoItem(pacotes, item.id);
    return uso ? `${formatarQuantidade(uso)} ${item.unidade}` : '—';
  };

  return (
    <Stack spacing={2}>
      <ChipsDeCategoria valor={categoria} onMudar={(valor) => { setCategoria(valor as CategoriaCadastro); setForm(VAZIO); }} itens={itens} />

      {categoria === 'prefabricados' ? (
        <>
          <Typography variant="body2" color="text.secondary">As peças dos LOTEs no Plannix, uma por código. Não se criam aqui: entram nos pacotes como estão.</Typography>
          <TableContainer>
            <Table size="small">
              {cabecalho(['LOTE', 'Peça', 'Quantidade', 'Etapa', 'Em pacotes'])}
              <TableBody>
                {daCategoria.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{nomeDoLote(item.lote ?? '')}</TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell>{`${formatarQuantidade(item.quantidade)} ${item.unidade}`}</TableCell>
                    <TableCell><EtapaDaPeca etapa={item.etapa} /></TableCell>
                    <TableCell>{emPacotes(item)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }} component="form" onSubmit={(event) => { event.preventDefault(); salvar(); }}>
            <TextField size="small" label="Descrição" value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} sx={{ flex: 1 }} />
            <TextField size="small" label="Quantidade" value={form.quantidade} onChange={(event) => setForm({ ...form, quantidade: event.target.value })} inputProps={{ inputMode: 'decimal' }} sx={{ width: { sm: 130 } }} />
            <TextField size="small" label="Unidade" placeholder="un" value={form.unidade} onChange={(event) => setForm({ ...form, unidade: event.target.value })} sx={{ width: { sm: 110 } }} />
            <Button type="submit" variant="contained" disabled={!valido} startIcon={form.id ? <CheckIcon /> : <AddIcon />}>{form.id ? 'Salvar' : 'Adicionar'}</Button>
            {form.id && <Button onClick={() => setForm(VAZIO)}>Cancelar</Button>}
          </Stack>
          {!daCategoria.length ? <Typography color="text.secondary">Nenhum item em {nomeDaCategoria(categoria)}.</Typography> : (
            <TableContainer>
              <Table size="small">
                {cabecalho(['Descrição', 'Quantidade', 'Em pacotes', ''])}
                <TableBody>
                  {daCategoria.map((item) => (
                    <TableRow key={item.id} selected={form.id === item.id}>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{`${formatarQuantidade(item.quantidade)} ${item.unidade}`}</TableCell>
                      <TableCell>{emPacotes(item)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Editar">
                          <IconButton size="small" aria-label={`Editar ${item.descricao}`} onClick={() => setForm({ id: item.id, descricao: item.descricao, quantidade: String(item.quantidade).replace('.', ','), unidade: item.unidade })}><EditOutlinedIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir (sai também dos pacotes)">
                          <IconButton size="small" aria-label={`Excluir ${item.descricao}`} onClick={() => { onExcluir(item); if (form.id === item.id) setForm(VAZIO); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Stack>
  );
}

/** Pacotes: à esquerda os cadastros, à direita o pacote; a seta leva o item ao pacote. Sem mestre nem data por enquanto. */
export function Pacotes({ itens, pacotes, nomeDoLote, onMudar, onAvisar }: {
  itens: ItemCadastro[];
  pacotes: Pacote[];
  nomeDoLote: (chave: string) => string;
  onMudar: (pacotes: Pacote[]) => void;
  onAvisar: (aviso: string) => void;
}) {
  const [selecionado, setSelecionado] = useState<string | null>(pacotes[0]?.id ?? null);
  const [categoria, setCategoria] = useState<CategoriaCadastro | 'todas'>('todas');
  const [lote, setLote] = useState('todos');
  const [busca, setBusca] = useState('');
  const pacote = pacotes.find((p) => p.id === selecionado) ?? null;
  const porId = useMemo(() => new Map(itens.map((item) => [item.id, item])), [itens]);
  const lotes = [...new Set(itens.flatMap((item) => (item.lote ? [item.lote] : [])))];

  const termo = busca.trim().toLowerCase();
  const visiveis = itens.filter((item) => (categoria === 'todas' || item.categoria === categoria)
    && (categoria !== 'prefabricados' || lote === 'todos' || item.lote === lote)
    && (!termo || item.descricao.toLowerCase().includes(termo)));

  const novoPacote = () => {
    const id = `pacote-${Date.now()}`;
    let numero = pacotes.length + 1;
    while (pacotes.some((p) => p.nome === `Pacote ${numero}`)) numero += 1;
    onMudar([...pacotes, { id, nome: `Pacote ${numero}`, itens: [] }]);
    setSelecionado(id);
  };
  const excluirPacote = (alvo: Pacote) => {
    const restantes = pacotes.filter((p) => p.id !== alvo.id);
    onMudar(restantes);
    setSelecionado(restantes[0]?.id ?? null);
    onAvisar(`${alvo.nome} excluído.`);
  };

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}>
      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Cadastros</Typography>
        <ChipsDeCategoria valor={categoria} onMudar={setCategoria} itens={itens} todas />
        <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField size="small" label="Buscar" value={busca} onChange={(event) => setBusca(event.target.value)} sx={{ flex: 1 }} />
          {categoria === 'prefabricados' && (
            <TextField select size="small" label="LOTE" value={lote} onChange={(event) => setLote(event.target.value)} sx={{ width: 130 }}>
              <MenuItem value="todos">Todos</MenuItem>
              {lotes.map((chave) => <MenuItem key={chave} value={chave}>{nomeDoLote(chave)}</MenuItem>)}
            </TextField>
          )}
        </Stack>
        <TableContainer sx={{ mt: 1, maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            {cabecalho(['Item', 'Livre', ''])}
            <TableBody>
              {visiveis.map((item) => {
                const noPacote = Boolean(pacote?.itens.some((i) => i.item === item.id));
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.descricao}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {[categoria === 'todas' ? nomeDaCategoria(item.categoria) : '', item.lote ? nomeDoLote(item.lote) : '', item.categoria === 'prefabricados' ? etapaPlannix(item.etapa ?? '').rotulo : ''].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{`${formatarQuantidade(livreDoItem(item, pacotes))} de ${formatarQuantidade(item.quantidade)} ${item.unidade}`}</TableCell>
                    <TableCell align="right">
                      <Tooltip title={!pacote ? 'Crie ou escolha um pacote' : noPacote ? 'Já está no pacote' : 'Levar ao pacote'}>
                        <span>
                          <IconButton size="small" color="primary" aria-label={`Levar ${item.descricao} ao pacote`} disabled={!pacote || noPacote} onClick={() => pacote && onMudar(adicionarAoPacote(pacotes, pacote.id, item))}>
                            {noPacote ? <CheckIcon fontSize="small" /> : <ArrowForwardIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visiveis.length && <TableRow><TableCell colSpan={3}><Typography color="text.secondary">Nenhum item.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Pacote</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {pacotes.map((p) => (
            <Chip key={p.id} label={`${p.nome} · ${p.itens.length}`} color={p.id === selecionado ? 'primary' : 'default'} variant={p.id === selecionado ? 'filled' : 'outlined'} onClick={() => setSelecionado(p.id)} />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={novoPacote}>Novo pacote</Button>
        </Stack>

        {!pacote ? (
          <Typography color="text.secondary" sx={{ mt: 2 }}>Nenhum pacote. Crie um em Novo pacote e leve os itens dos cadastros com a seta.</Typography>
        ) : (
          <>
            <TextField size="small" label="Nome do pacote" value={pacote.nome} onChange={(event) => onMudar(pacotes.map((p) => (p.id === pacote.id ? { ...p, nome: event.target.value } : p)))} fullWidth sx={{ mt: 2 }} />
            {!pacote.itens.length ? (
              <Typography color="text.secondary" sx={{ mt: 2 }}>Pacote vazio: leve os itens dos cadastros com a seta.</Typography>
            ) : (
              <TableContainer sx={{ mt: 1 }}>
                <Table size="small">
                  {cabecalho(['Item', 'Categoria', 'Quantidade', ''])}
                  <TableBody>
                    {pacote.itens.map((noPacote) => {
                      const item = porId.get(noPacote.item);
                      if (!item) return null;
                      const aviso = avisoDoItem(pacotes, pacote.id, item);
                      return (
                        <TableRow key={noPacote.item}>
                          <TableCell>
                            {item.descricao}
                            {item.lote && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{nomeDoLote(item.lote)}</Typography>}
                            {aviso && <Typography variant="caption" color="warning.dark" sx={{ display: 'block' }}>{aviso}</Typography>}
                          </TableCell>
                          <TableCell>{nomeDaCategoria(item.categoria)}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {item.unidade === 'peça' ? '1 peça' : (
                              <TextField
                                size="small"
                                type="number"
                                value={noPacote.quantidade}
                                onChange={(event) => onMudar(alterarQuantidade(pacotes, pacote.id, item.id, Math.max(0, Number(event.target.value) || 0)))}
                                inputProps={{ min: 0, step: 'any', 'aria-label': `Quantidade de ${item.descricao}` }}
                                InputProps={{ endAdornment: <InputAdornment position="end">{item.unidade}</InputAdornment> }}
                                sx={{ width: 140 }}
                              />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Tirar do pacote">
                              <IconButton size="small" aria-label={`Tirar ${item.descricao} do pacote`} onClick={() => onMudar(removerDoPacote(pacotes, pacote.id, item.id))}><CloseIcon fontSize="small" /></IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => excluirPacote(pacote)}>Excluir pacote</Button>
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}
