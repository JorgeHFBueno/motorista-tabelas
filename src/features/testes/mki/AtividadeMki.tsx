import { useMemo, useState, type ReactNode } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
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
import {
  CATEGORIAS_CADASTRO,
  adicionarItem,
  alterarQuantidade,
  avisoDasPecas,
  ehPreFabricado,
  gruposDaCategoria,
  nomeDaCategoria,
  pecasLivres,
  pecasUsadas,
  removerItem,
  usosDoItem,
  type CategoriaCadastro,
  type ItemCadastro,
  type ItemNoConjunto,
  type Pacote,
  type Servico,
} from './pacotesTrabalho';

// Aba Atividade do /testes/mki (pacotesTrabalho.ts): Cadastros (itens da obra com descrição e grupo; os pré-fabricados
// por tipo de peça), Serviços (nome, descrição e itens dos cadastros) e Pacotes (serviços e itens soltos). Serviços e
// Pacotes montam-se em duas colunas: à esquerda o que se pode levar, à direita o serviço ou o pacote. Tudo em memória.

const cabecalho = (titulos: string[]) => (
  <TableHead><TableRow>{titulos.map((titulo, index) => <TableCell key={`${titulo}-${index}`} sx={{ fontWeight: 700 }}>{titulo}</TableCell>)}</TableRow></TableHead>
);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Filtro = CategoriaCadastro | 'todas' | 'servicos';
function ChipsDeCategoria({ valor, onMudar, contagem, extras = [] }: { valor: Filtro; onMudar: (valor: Filtro) => void; contagem: (filtro: Filtro) => number; extras?: { id: Filtro; nome: string }[] }) {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {[...extras, ...CATEGORIAS_CADASTRO].map((opcao) => (
        <Chip
          key={opcao.id}
          label={`${opcao.nome} · ${contagem(opcao.id)}`}
          color={valor === opcao.id ? 'primary' : 'default'}
          variant={valor === opcao.id ? 'filled' : 'outlined'}
          onClick={() => onMudar(opcao.id)}
        />
      ))}
    </Stack>
  );
}

/** "5 de 12 expedidas", verde quando todas foram. */
function Expedidas({ item }: { item: ItemCadastro }) {
  const total = item.quantidade ?? 0;
  const todas = total > 0 && item.expedidas === total;
  return <Chip size="small" variant="outlined" color={todas ? 'success' : 'default'} label={`${item.expedidas ?? 0} de ${total} ${total === 1 ? 'expedida' : 'expedidas'}`} />;
}

type Formulario = { id: string | null; descricao: string; grupo: string };
const VAZIO: Formulario = { id: null, descricao: '', grupo: '' };

/** Cadastros: os itens da obra por categoria, com descrição e grupo. Pré-fabricados vêm do Plannix, por tipo de peça. */
export function Cadastros({ itens, servicos, pacotes, nomeDoLote, onSalvar, onExcluir }: {
  itens: ItemCadastro[];
  servicos: Servico[];
  pacotes: Pacote[];
  nomeDoLote: (chave: string) => string;
  onSalvar: (item: ItemCadastro) => void;
  onExcluir: (item: ItemCadastro) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaCadastro>('insumos');
  const [form, setForm] = useState<Formulario>(VAZIO);
  const daCategoria = itens.filter((item) => item.categoria === categoria);
  const valido = form.descricao.trim() !== '';

  const salvar = () => {
    if (!valido) return;
    onSalvar({ id: form.id ?? `${categoria}-${Date.now()}`, categoria, descricao: form.descricao.trim(), grupo: form.grupo.trim() });
    setForm(VAZIO);
  };
  const emUso = (item: ItemCadastro) => {
    const usos = usosDoItem(servicos, pacotes, item.id);
    return [usos.servicos ? plural(usos.servicos, 'serviço', 'serviços') : '', usos.pacotes ? plural(usos.pacotes, 'pacote', 'pacotes') : ''].filter(Boolean).join(' · ') || '—';
  };

  return (
    <Stack spacing={2}>
      <ChipsDeCategoria valor={categoria} onMudar={(valor) => { setCategoria(valor as CategoriaCadastro); setForm(VAZIO); }} contagem={(filtro) => itens.filter((item) => item.categoria === filtro).length} />

      {categoria === 'prefabricados' ? (
        <>
          <Typography variant="body2" color="text.secondary">Os tipos de peça dos LOTEs no Plannix. Não se criam aqui: entram nos serviços e pacotes com quantas peças usar.</Typography>
          <TableContainer>
            <Table size="small">
              {cabecalho(['LOTE', 'Peça', 'Quantidade', 'Etapa', 'Em pacotes'])}
              <TableBody>
                {daCategoria.map((item) => {
                  const usadas = pecasUsadas(pacotes, servicos, item.id);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{nomeDoLote(item.lote ?? '')}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{`${item.quantidade} un`}</TableCell>
                      <TableCell><Expedidas item={item} /></TableCell>
                      <TableCell>{usadas ? `${usadas} un` : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }} component="form" onSubmit={(event) => { event.preventDefault(); salvar(); }}>
            <TextField size="small" label="Descrição" value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} sx={{ flex: 1 }} />
            <Autocomplete
              freeSolo
              options={gruposDaCategoria(itens, categoria)}
              inputValue={form.grupo}
              onInputChange={(_event, valor) => setForm((atual) => ({ ...atual, grupo: valor }))}
              renderInput={(params) => <TextField {...params} size="small" label="Grupo" />}
              sx={{ width: { sm: 240 } }}
            />
            <Button type="submit" variant="contained" disabled={!valido} startIcon={form.id ? <CheckIcon /> : <AddIcon />}>{form.id ? 'Salvar' : 'Adicionar'}</Button>
            {form.id && <Button onClick={() => setForm(VAZIO)}>Cancelar</Button>}
          </Stack>
          {!daCategoria.length ? <Typography color="text.secondary">Nenhum item em {nomeDaCategoria(categoria)}.</Typography> : (
            <TableContainer>
              <Table size="small">
                {cabecalho(['Descrição', 'Grupo', 'Em uso', ''])}
                <TableBody>
                  {daCategoria.map((item) => (
                    <TableRow key={item.id} selected={form.id === item.id}>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{item.grupo || '—'}</TableCell>
                      <TableCell>{emUso(item)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Editar">
                          <IconButton size="small" aria-label={`Editar ${item.descricao}`} onClick={() => setForm({ id: item.id, descricao: item.descricao, grupo: item.grupo })}><EditOutlinedIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir (sai também dos serviços e pacotes)">
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

type Conjunto = { id: string; nome: string; descricao?: string; servicos?: string[]; itens: ItemNoConjunto[] };

/**
 * Serviços e Pacotes: à esquerda os cadastros (e, no pacote, os serviços), à direita o serviço ou o pacote; a seta leva
 * ao da direita. Pré-fabricado entra com as peças livres (1 se nada sobrou) e a quantidade muda ali.
 */
export function Montador({ modo, itens, servicos, pacotes, nomeDoLote, onServicos, onPacotes, onAvisar }: {
  modo: 'servico' | 'pacote';
  itens: ItemCadastro[];
  servicos: Servico[];
  pacotes: Pacote[];
  nomeDoLote: (chave: string) => string;
  onServicos: (servicos: Servico[]) => void;
  onPacotes: (pacotes: Pacote[]) => void;
  onAvisar: (aviso: string) => void;
}) {
  const ehPacote = modo === 'pacote';
  const lista: Conjunto[] = ehPacote ? pacotes : servicos;
  const mudar = (proxima: Conjunto[]) => (ehPacote ? onPacotes(proxima as Pacote[]) : onServicos(proxima as Servico[]));
  const palavra = ehPacote ? 'pacote' : 'serviço';
  const Palavra = ehPacote ? 'Pacote' : 'Serviço';

  const [selecionado, setSelecionado] = useState<string | null>(lista[0]?.id ?? null);
  const [filtro, setFiltro] = useState<Filtro>(ehPacote ? 'servicos' : 'todas');
  const [lote, setLote] = useState('todos');
  const [busca, setBusca] = useState('');
  const atual = lista.find((c) => c.id === selecionado) ?? null;
  const porId = useMemo(() => new Map(itens.map((item) => [item.id, item])), [itens]);
  const lotes = [...new Set(itens.flatMap((item) => (item.lote ? [item.lote] : [])))];
  const alterar = (mudanca: Partial<Conjunto>) => atual && mudar(lista.map((c) => (c.id === atual.id ? { ...c, ...mudanca } : c)));

  const termo = busca.trim().toLowerCase();
  const casa = (...textos: string[]) => !termo || textos.some((texto) => texto.toLowerCase().includes(termo));
  const itensVisiveis = filtro === 'servicos' ? [] : itens.filter((item) => (filtro === 'todas' || item.categoria === filtro)
    && (filtro !== 'prefabricados' || lote === 'todos' || item.lote === lote)
    && casa(item.descricao, item.grupo));
  const servicosVisiveis = ehPacote && (filtro === 'servicos' || filtro === 'todas') ? servicos.filter((s) => casa(s.nome, s.descricao)) : [];

  const novo = () => {
    const id = `${modo}-${Date.now()}`;
    let numero = lista.length + 1;
    while (lista.some((c) => c.nome === `${Palavra} ${numero}`)) numero += 1;
    mudar([...lista, ehPacote ? { id, nome: `${Palavra} ${numero}`, servicos: [], itens: [] } : { id, nome: `${Palavra} ${numero}`, descricao: '', itens: [] }]);
    setSelecionado(id);
  };
  const excluir = (alvo: Conjunto) => {
    const restantes = lista.filter((c) => c.id !== alvo.id);
    mudar(restantes);
    setSelecionado(restantes[0]?.id ?? null);
    onAvisar(`${alvo.nome} excluído${ehPacote ? '' : ' (saiu também dos pacotes)'}.`);
  };
  const legenda = (item: ItemCadastro) =>
    [filtro === 'todas' ? nomeDaCategoria(item.categoria) : '', item.grupo, item.lote ? nomeDoLote(item.lote) : ''].filter(Boolean).join(' · ');
  const nomesDosItens = (s: Servico) => s.itens.map((i) => {
    const item = porId.get(i.item);
    return item ? `${item.descricao}${i.quantidade ? ` (${i.quantidade})` : ''}` : '';
  }).filter(Boolean).join(', ');

  const botaoLevar = (rotulo: string, jaEsta: boolean, levar: () => void) => (
    <Tooltip title={!atual ? `Crie ou escolha um ${palavra}` : jaEsta ? `Já está no ${palavra}` : `Levar ao ${palavra}`}>
      <span>
        <IconButton size="small" color="primary" aria-label={`Levar ${rotulo} ao ${palavra}`} disabled={!atual || jaEsta} onClick={levar}>
          {jaEsta ? <CheckIcon fontSize="small" /> : <ArrowForwardIcon fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );
  const linhaTirar = (rotulo: string, tirar: () => void) => (
    <Tooltip title={`Tirar do ${palavra}`}>
      <IconButton size="small" aria-label={`Tirar ${rotulo} do ${palavra}`} onClick={tirar}><CloseIcon fontSize="small" /></IconButton>
    </Tooltip>
  );
  const secao = (titulo: string, conteudo: ReactNode) => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{titulo}</Typography>
      {conteudo}
    </Box>
  );

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}>
      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{ehPacote ? 'Serviços e cadastros' : 'Cadastros'}</Typography>
        <ChipsDeCategoria
          valor={filtro}
          onMudar={setFiltro}
          extras={[...(ehPacote ? [{ id: 'servicos' as const, nome: 'Serviços' }] : []), { id: 'todas', nome: 'Todos os cadastros' }]}
          contagem={(f) => (f === 'servicos' ? servicos.length : f === 'todas' ? itens.length : itens.filter((item) => item.categoria === f).length)}
        />
        <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField size="small" label="Buscar" value={busca} onChange={(event) => setBusca(event.target.value)} sx={{ flex: 1 }} />
          {filtro === 'prefabricados' && (
            <TextField select size="small" label="LOTE" value={lote} onChange={(event) => setLote(event.target.value)} sx={{ width: 130 }}>
              <MenuItem value="todos">Todos</MenuItem>
              {lotes.map((chave) => <MenuItem key={chave} value={chave}>{nomeDoLote(chave)}</MenuItem>)}
            </TextField>
          )}
        </Stack>
        <TableContainer sx={{ mt: 1, maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            {cabecalho(['Item', ''])}
            <TableBody>
              {servicosVisiveis.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label="Serviço" color="primary" variant="outlined" /><span>{s.nome}</span></Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{nomesDosItens(s) || 'sem itens'}</Typography>
                  </TableCell>
                  <TableCell align="right">{botaoLevar(s.nome, Boolean(atual?.servicos?.includes(s.id)), () => alterar({ servicos: [...(atual?.servicos ?? []), s.id] }))}</TableCell>
                </TableRow>
              ))}
              {itensVisiveis.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.descricao}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {[legenda(item), ehPreFabricado(item) ? `${pecasLivres(item, pacotes, servicos)} de ${item.quantidade} livres` : ''].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {botaoLevar(item.descricao, Boolean(atual?.itens.some((i) => i.item === item.id)), () => atual && alterar({ itens: adicionarItem(atual.itens, item, pecasLivres(item, pacotes, servicos)) }))}
                  </TableCell>
                </TableRow>
              ))}
              {!servicosVisiveis.length && !itensVisiveis.length && (
                <TableRow><TableCell colSpan={2}><Typography color="text.secondary">{filtro === 'servicos' && !servicos.length ? 'Nenhum serviço: crie em Serviços.' : 'Nada encontrado.'}</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{Palavra}</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {lista.map((c) => (
            <Chip key={c.id} label={c.nome || `(${palavra} sem nome)`} color={c.id === selecionado ? 'primary' : 'default'} variant={c.id === selecionado ? 'filled' : 'outlined'} onClick={() => setSelecionado(c.id)} />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={novo}>{`Novo ${palavra}`}</Button>
        </Stack>

        {!atual ? (
          <Typography color="text.secondary" sx={{ mt: 2 }}>{`Nenhum ${palavra}. Crie um em Novo ${palavra} e leve os itens da esquerda com a seta.`}</Typography>
        ) : (
          <>
            <TextField size="small" label={ehPacote ? 'Nome do pacote' : 'Nome do serviço'} value={atual.nome} onChange={(event) => alterar({ nome: event.target.value })} fullWidth sx={{ mt: 2 }} />
            {!ehPacote && (
              <TextField size="small" label="Descrição" value={atual.descricao ?? ''} onChange={(event) => alterar({ descricao: event.target.value })} fullWidth multiline minRows={2} sx={{ mt: 1.5 }} />
            )}

            {ehPacote && secao('Serviços', !atual.servicos?.length ? (
              <Typography variant="body2" color="text.secondary">Nenhum serviço no pacote.</Typography>
            ) : (
              <Table size="small">
                <TableBody>
                  {atual.servicos.map((id) => {
                    const s = servicos.find((x) => x.id === id);
                    if (!s) return null;
                    return (
                      <TableRow key={id}>
                        <TableCell>
                          {s.nome}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{[s.descricao, nomesDosItens(s)].filter(Boolean).join(' · ') || 'sem itens'}</Typography>
                        </TableCell>
                        <TableCell align="right">{linhaTirar(s.nome, () => alterar({ servicos: atual.servicos?.filter((x) => x !== id) }))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ))}

            {secao(ehPacote ? 'Itens soltos' : 'Itens', !atual.itens.length ? (
              <Typography variant="body2" color="text.secondary">{ehPacote ? 'Nenhum item solto.' : 'Serviço sem itens: leve os itens dos cadastros com a seta.'}</Typography>
            ) : (
              <Table size="small">
                <TableBody>
                  {atual.itens.map((noConjunto) => {
                    const item = porId.get(noConjunto.item);
                    if (!item) return null;
                    const aviso = ehPacote
                      ? avisoDasPecas(pacotes, servicos, item)
                      : ehPreFabricado(item) && (noConjunto.quantidade ?? 0) > (item.quantidade ?? 0) ? `O LOTE tem ${item.quantidade} peças.` : null;
                    return (
                      <TableRow key={noConjunto.item}>
                        <TableCell>
                          {item.descricao}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{[nomeDaCategoria(item.categoria), item.grupo, item.lote ? nomeDoLote(item.lote) : ''].filter(Boolean).join(' · ')}</Typography>
                          {aviso && <Typography variant="caption" color="warning.dark" sx={{ display: 'block' }}>{aviso}</Typography>}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {ehPreFabricado(item) && (
                            <TextField
                              size="small"
                              type="number"
                              label="Peças"
                              value={noConjunto.quantidade ?? 1}
                              onChange={(event) => alterar({ itens: alterarQuantidade(atual.itens, item.id, Math.max(1, Math.round(Number(event.target.value)) || 1)) })}
                              inputProps={{ min: 1, step: 1, 'aria-label': `Peças de ${item.descricao}` }}
                              sx={{ width: 90 }}
                            />
                          )}
                        </TableCell>
                        <TableCell align="right">{linhaTirar(item.descricao, () => alterar({ itens: removerItem(atual.itens, item.id) }))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ))}

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => excluir(atual)}>{`Excluir ${palavra}`}</Button>
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}
