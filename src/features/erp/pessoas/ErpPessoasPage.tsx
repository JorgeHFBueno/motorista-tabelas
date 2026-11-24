import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Collapse, Container, FormControlLabel, FormGroup, InputAdornment, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { formatarDocumento } from '../../portal-cliente/portalDominio';
import {
  AVISO_DEMONSTRACAO, CATEGORIAS, PAPEIS, PESSOAS_EXEMPLO, REGIMES, UFS, VENDEDORES_EXEMPLO, type Papel, type PessoaExemplo,
} from './pessoasExemplo';

// /erp/pessoas: Consulta de Clientes e Fornecedores, como a do ERP (CL_Clientes do Elevor): pesquisa por nome, fantasia ou
// CPF/CNPJ, "Mais filtros" e a grade de 25 por página. Demonstração sobre os exemplos de pessoasExemplo.ts.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FILTROS_VAZIOS = {
  tipo: '', codigo: '', papeis: [] as Papel[], situacao: 'ativos', uf: '', cidade: '', bairro: '', vendedor: '', regime: '', categoria: '',
};
type Filtros = typeof FILTROS_VAZIOS;

function passa(p: PessoaExemplo, busca: string, f: Filtros) {
  const b = semAcento(busca.trim());
  if (b && !semAcento(`${p.nome} ${p.fantasia} ${p.documento} ${formatarDocumento(p.documento)}`).includes(b)) return false;
  if (f.situacao !== 'todos' && p.ativo !== (f.situacao === 'ativos')) return false;
  if (f.tipo && p.tipo !== f.tipo) return false;
  if (f.codigo && String(p.codigo) !== f.codigo.trim()) return false;
  if (f.papeis.length && !f.papeis.some((papel) => p.papeis.includes(papel))) return false;
  if (f.uf && p.uf !== f.uf) return false;
  if (f.cidade && !semAcento(p.cidade).includes(semAcento(f.cidade))) return false;
  if (f.bairro && !semAcento(p.bairro).includes(semAcento(f.bairro))) return false;
  if (f.vendedor && p.vendedor !== f.vendedor) return false;
  if (f.regime && p.regime !== f.regime) return false;
  return !f.categoria || p.categoria === f.categoria;
}

const papeisTexto = (p: PessoaExemplo) => PAPEIS.filter((x) => p.papeis.includes(x.valor)).map((x) => x.rotulo).join(' · ');

export default function ErpPessoasPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [mais, setMais] = useState(false);
  const [f, setF] = useState<Filtros>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);

  const visiveis = useMemo(() => PESSOAS_EXEMPLO.filter((p) => passa(p, busca, f)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [busca, f]);
  const daPagina = visiveis.slice(pagina * porPagina, (pagina + 1) * porPagina);
  const mudar = <K extends keyof Filtros>(campo: K, valor: Filtros[K]) => { setF((x) => ({ ...x, [campo]: valor })); setPagina(0); };
  const marcarPapel = (papel: Papel, sim: boolean) => mudar('papeis', sim ? [...f.papeis, papel] : f.papeis.filter((x) => x !== papel));
  const lista = (campo: 'tipo' | 'situacao' | 'uf' | 'vendedor' | 'regime' | 'categoria', rotulo: string, opcoes: Array<string | [string, string]>, vazio = 'Todos') => (
    <TextField select size="small" label={rotulo} value={f[campo]} onChange={(e) => mudar(campo, e.target.value)} fullWidth>
      {vazio && <MenuItem value="">{vazio}</MenuItem>}
      {opcoes.map((o) => (typeof o === 'string' ? <MenuItem key={o} value={o}>{o}</MenuItem> : <MenuItem key={o[0]} value={o[0]}>{o[1]}</MenuItem>))}
    </TextField>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Alert severity="info" sx={{ mb: 2 }}>{AVISO_DEMONSTRACAO}</Alert>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField
          size="small" placeholder="Pesquisar nome, nome fantasia ou CPF/CNPJ" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
          sx={{ flex: 1 }} autoFocus
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <Button variant="outlined" endIcon={mais ? <ExpandLessIcon /> : <ExpandMoreIcon />} onClick={() => setMais((m) => !m)}>Mais filtros</Button>
        <Button variant="outlined" onClick={() => navigate('/erp/vendedores')}>Vendedores</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/pessoas/novo')}>Novo</Button>
      </Stack>

      <Collapse in={mais}>
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
            {lista('tipo', 'Tipo de pessoa', [['F', 'Física'], ['J', 'Jurídica']])}
            <TextField size="small" label="Código" value={f.codigo} onChange={(e) => mudar('codigo', e.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            {lista('situacao', 'Situação', [['ativos', 'Ativos'], ['inativos', 'Inativos'], ['todos', 'Todos']], '')}
            {lista('vendedor', 'Vendedor', VENDEDORES_EXEMPLO.map((v) => v[0]))}
            {lista('uf', 'Estado', UFS)}
            <TextField size="small" label="Cidade" value={f.cidade} onChange={(e) => mudar('cidade', e.target.value)} />
            <TextField size="small" label="Bairro" value={f.bairro} onChange={(e) => mudar('bairro', e.target.value)} />
            {lista('categoria', 'Categoria', CATEGORIAS)}
            {lista('regime', 'Regime tributário', REGIMES)}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} mt={1.5}>
            <FormGroup row>
              {PAPEIS.map((p) => (
                <FormControlLabel key={p.valor} label={p.rotulo}
                  control={<Checkbox size="small" checked={f.papeis.includes(p.valor)} onChange={(e) => marcarPapel(p.valor, e.target.checked)} />} />
              ))}
            </FormGroup>
            <Button onClick={() => { setF(FILTROS_VAZIOS); setPagina(0); }}>Limpar filtros</Button>
          </Stack>
        </Paper>
      </Collapse>

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Código', 'Descrição', 'Nome Fantasia', 'CPF/CNPJ', 'Cidade - UF', 'Telefone'].map((t) => <TableCell key={t} sx={{ fontWeight: 700 }}>{t}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {daPagina.map((p) => (
              <TableRow key={p.codigo} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/pessoas/${p.codigo}`)}>
                <TableCell>{p.codigo}</TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{p.nome}</Typography>
                  <Typography variant="caption" color="text.secondary">{papeisTexto(p)}{p.ativo ? '' : ' · Inativo'}</Typography>
                </TableCell>
                <TableCell>{p.fantasia !== p.nome ? p.fantasia : ''}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatarDocumento(p.documento)}</TableCell>
                <TableCell>{p.cidade ? `${p.cidade} - ${p.uf}` : ''}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.telefones[0]?.[1] ?? ''}</TableCell>
              </TableRow>
            ))}
            {!visiveis.length && (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Nenhum cadastro encontrado.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={visiveis.length} page={pagina} rowsPerPage={porPagina} rowsPerPageOptions={[25, 50, 100]}
          onPageChange={(_e, n) => setPagina(n)} onRowsPerPageChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(0); }}
          labelRowsPerPage="Por página" labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </TableContainer>
    </Container>
  );
}
