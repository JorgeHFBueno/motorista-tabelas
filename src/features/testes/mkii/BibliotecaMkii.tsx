import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
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
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  CATEGORIAS_CATALOGO,
  formatar,
  gruposDaCategoria,
  nomeDaCategoria,
  obrasDoModelo,
  type CategoriaCatalogo,
  type ItemCatalogo,
  type ServicoDaObra,
  type ServicoModelo,
} from './composicoes';

// Biblioteca da Ledur no /testes/mkii (composicoes.ts): os cadastros e os serviços-modelo, que valem para todas as obras.

const cabecalho = (titulos: string[]) => (
  <TableHead><TableRow>{titulos.map((t, i) => <TableCell key={`${t}-${i}`} sx={{ fontWeight: 700 }}>{t}</TableCell>)}</TableRow></TableHead>
);
const UNIDADES_DE_SERVICO = ['m³', 'm²', 'm', 'un', 'peça', 'vb'];

/** Cadastros da Biblioteca: descrição e grupo (sugerido pelos grupos já usados na categoria). */
export function CatalogoMkii({ itens, modelos, onSalvar, onExcluir }: {
  itens: ItemCatalogo[];
  modelos: ServicoModelo[];
  onSalvar: (item: ItemCatalogo) => void;
  onExcluir: (item: ItemCatalogo) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaCatalogo>('insumos');
  const [form, setForm] = useState({ id: null as string | null, descricao: '', grupo: '' });
  const daCategoria = itens.filter((i) => i.categoria === categoria);
  const limpar = () => setForm({ id: null, descricao: '', grupo: '' });
  const salvar = () => {
    if (!form.descricao.trim()) return;
    onSalvar({ id: form.id ?? `${categoria}-${Date.now()}`, categoria, descricao: form.descricao.trim(), grupo: form.grupo.trim() });
    limpar();
  };
  const emModelos = (id: string) => modelos.filter((m) => m.itens.some((i) => i.item === id)).length;
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {CATEGORIAS_CATALOGO.map((c) => (
          <Chip key={c.id} label={`${c.nome} · ${itens.filter((i) => i.categoria === c.id).length}`} color={categoria === c.id ? 'primary' : 'default'} variant={categoria === c.id ? 'filled' : 'outlined'} onClick={() => { setCategoria(c.id); limpar(); }} />
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} component="form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <TextField size="small" label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} sx={{ flex: 1 }} />
        <Autocomplete
          freeSolo
          options={gruposDaCategoria(itens, categoria)}
          inputValue={form.grupo}
          onInputChange={(_e, valor) => setForm((atual) => ({ ...atual, grupo: valor }))}
          renderInput={(params) => <TextField {...params} size="small" label="Grupo" />}
          sx={{ width: { sm: 240 } }}
        />
        <Button type="submit" variant="contained" disabled={!form.descricao.trim()} startIcon={form.id ? <CheckIcon /> : <AddIcon />}>{form.id ? 'Salvar' : 'Adicionar'}</Button>
        {form.id && <Button onClick={limpar}>Cancelar</Button>}
      </Stack>
      <TableContainer>
        <Table size="small">
          {cabecalho(['Descrição', 'Grupo', 'Em modelos', ''])}
          <TableBody>
            {daCategoria.map((item) => (
              <TableRow key={item.id} selected={form.id === item.id}>
                <TableCell>{item.descricao}</TableCell>
                <TableCell>{item.grupo || '—'}</TableCell>
                <TableCell>{emModelos(item.id) || '—'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" aria-label={`Editar ${item.descricao}`} onClick={() => setForm({ id: item.id, descricao: item.descricao, grupo: item.grupo })}><EditOutlinedIcon fontSize="small" /></IconButton>
                  <Tooltip title="Excluir (sai também dos modelos)">
                    <IconButton size="small" aria-label={`Excluir ${item.descricao}`} onClick={() => onExcluir(item)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

/** Serviços-modelo: à esquerda a lista (com as obras que usam cada um), à direita o modelo com os coeficientes. */
export function ModelosMkii({ itens, modelos, servicos, nomeDaObra, onMudar, onExcluir }: {
  itens: ItemCatalogo[];
  modelos: ServicoModelo[];
  servicos: ServicoDaObra[];
  nomeDaObra: (id: string) => string;
  onMudar: (modelos: ServicoModelo[]) => void;
  onExcluir: (modelo: ServicoModelo) => void;
}) {
  const [selecionado, setSelecionado] = useState<string | null>(modelos[0]?.id ?? null);
  const modelo = modelos.find((m) => m.id === selecionado) ?? null;
  const alterar = (mudanca: Partial<ServicoModelo>) => modelo && onMudar(modelos.map((m) => (m.id === modelo.id ? { ...m, ...mudanca } : m)));
  const porId = new Map(itens.map((i) => [i.id, i]));
  const novo = () => {
    const id = `modelo-${Date.now()}`;
    onMudar([...modelos, { id, nome: 'Novo serviço', unidade: 'un', descricao: '', itens: [] }]);
    setSelecionado(id);
  };
  const usadoEm = modelo ? obrasDoModelo(modelo.id, servicos) : [];

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 4fr) minmax(0, 8fr)' }, alignItems: 'start' }}>
      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Serviços-modelo</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={novo}>Novo modelo</Button>
        </Stack>
        <Table size="small">
          <TableBody>
            {modelos.map((m) => {
              const obras = obrasDoModelo(m.id, servicos).length;
              return (
                <TableRow key={m.id} hover selected={m.id === selecionado} onClick={() => setSelecionado(m.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell>
                    {m.nome || '(sem nome)'}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {`por ${m.unidade || '—'} · ${m.itens.length} ${m.itens.length === 1 ? 'item' : 'itens'} · ${obras ? `usado em ${obras} ${obras === 1 ? 'obra' : 'obras'}` : 'sem uso'}`}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        {!modelo ? <Typography color="text.secondary">Nenhum modelo. Crie em Novo modelo.</Typography> : (
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField size="small" label="Nome do serviço" value={modelo.nome} onChange={(e) => alterar({ nome: e.target.value })} sx={{ flex: 1 }} />
              <Autocomplete
                freeSolo
                options={UNIDADES_DE_SERVICO}
                inputValue={modelo.unidade}
                onInputChange={(_e, valor) => alterar({ unidade: valor })}
                renderInput={(params) => <TextField {...params} size="small" label="Unidade do serviço" />}
                sx={{ width: { sm: 180 } }}
              />
            </Stack>
            <TextField size="small" label="Descrição" value={modelo.descricao} onChange={(e) => alterar({ descricao: e.target.value })} multiline minRows={2} />
            {usadoEm.length > 0 && (
              <Alert severity="info" variant="outlined">
                {`Usado em ${usadoEm.map(nomeDaObra).join(' e ')}: mudar o modelo muda as quantidades calculadas ${usadoEm.length === 1 ? 'nessa obra' : 'nessas obras'}.`}
              </Alert>
            )}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{`Itens por 1 ${modelo.unidade || 'unidade'} de serviço`}</Typography>
            {modelo.itens.length > 0 && (
              <TableContainer>
                <Table size="small">
                  {cabecalho(['Item', 'Coeficiente', 'Unidade', ''])}
                  <TableBody>
                    {modelo.itens.map((i) => {
                      const item = porId.get(i.item);
                      const mudar = (mudanca: Partial<typeof i>) => alterar({ itens: modelo.itens.map((x) => (x.item === i.item ? { ...x, ...mudanca } : x)) });
                      return (
                        <TableRow key={i.item}>
                          <TableCell>
                            {item?.descricao ?? '(item excluído)'}
                            {item && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{[nomeDaCategoria(item.categoria), item.grupo].filter(Boolean).join(' · ')}</Typography>}
                          </TableCell>
                          <TableCell>
                            <TextField size="small" type="number" value={i.coeficiente} onChange={(e) => mudar({ coeficiente: Math.max(0, Number(e.target.value) || 0) })} inputProps={{ min: 0, step: 'any', 'aria-label': `Coeficiente de ${item?.descricao}` }} sx={{ width: 110 }} />
                          </TableCell>
                          <TableCell>
                            <TextField size="small" value={i.unidade} placeholder="un" onChange={(e) => mudar({ unidade: e.target.value })} inputProps={{ 'aria-label': `Unidade de ${item?.descricao}` }} sx={{ width: 100 }} />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" aria-label={`Tirar ${item?.descricao} do modelo`} onClick={() => alterar({ itens: modelo.itens.filter((x) => x.item !== i.item) })}><CloseIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Autocomplete
              options={itens.filter((i) => !modelo.itens.some((x) => x.item === i.id)).sort((a, b) => a.categoria.localeCompare(b.categoria))}
              groupBy={(i) => nomeDaCategoria(i.categoria)}
              getOptionLabel={(i) => `${i.descricao}${i.grupo ? ` · ${i.grupo}` : ''}`}
              value={null}
              onChange={(_e, item) => item && alterar({ itens: [...modelo.itens, { item: item.id, coeficiente: 1, unidade: '' }] })}
              renderInput={(params) => <TextField {...params} size="small" label="Adicionar item da Biblioteca" />}
              blurOnSelect
            />
            <Typography variant="caption" color="text.secondary">
              {`Ex.: ${formatar(1.05)} m³ de concreto por m³ de sapata. Os pré-fabricados não entram no modelo: são as peças do LOTE, escolhidas na obra.`}
            </Typography>
            <Stack direction="row" justifyContent="flex-end">
              <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => { onExcluir(modelo); setSelecionado(modelos.find((m) => m.id !== modelo.id)?.id ?? null); }}>Excluir modelo</Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
