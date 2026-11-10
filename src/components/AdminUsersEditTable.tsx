import { memo, useEffect, useMemo, useState } from 'react';
import {
  ButtonBase,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import { nomeDoUsuario, type AdminUser } from '../services/adminUsersApi';
import { CREDENCIAIS } from '../services/credenciais';
import { isKioskCredentialEligible } from '../services/kioskCredentialEligibility';
import type { ModoEdicaoUsuario } from './AdminUserEditModal';

interface AdminUsersEditTableProps {
  rows: AdminUser[];
  loading: boolean;
  // Each cell opens its own popup: the name, everything; Credenciais, only the boxes; Situação, activate/deactivate.
  onEdit: (row: AdminUser, modo: ModoEdicaoUsuario) => void;
  onSenha: (row: AdminUser) => void;
  onExcluir: (row: AdminUser) => void;
  // Kiosk QR and PIN: only for whoever can use the Kiosk (active, frentista or adm2).
  onKiosk: (row: AdminUser) => void;
  dateFormatter: Intl.DateTimeFormat;
}

type Coluna = 'nome' | 'situacao' | 'ultimoAcesso';

// A tappable cell: the whole area reacts (hover, focus and ripple), not just the text.
const celulaSx = {
  width: '100%',
  justifyContent: 'flex-start',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  borderRadius: 1,
  px: 1,
  py: 0.75,
  mx: -1,
  '&:hover, &:focus-visible': { bgcolor: 'action.hover' },
} as const;

const ultimoAcesso = (u: AdminUser) => u.funcionario?.ultimoAcesso ?? u.lastLoginAt ?? '';
const situacao = (u: AdminUser) => (!u.funcionario ? 'Sem funcionário' : u.funcionario.ativo ? 'Ativo' : 'Inativo');
const tempo = (valor: string) => { const t = valor ? new Date(valor).getTime() : NaN; return Number.isNaN(t) ? -Infinity : t; };
const comparar: Record<Coluna, (a: AdminUser, b: AdminUser) => number> = {
  nome: (a, b) => nomeDoUsuario(a).localeCompare(nomeDoUsuario(b), 'pt-BR'),
  situacao: (a, b) => situacao(a).localeCompare(situacao(b), 'pt-BR') || nomeDoUsuario(a).localeCompare(nomeDoUsuario(b), 'pt-BR'),
  ultimoAcesso: (a, b) => tempo(ultimoAcesso(a)) - tempo(ultimoAcesso(b)),
};

function formatDate(value: string | null | undefined, dateFormatter: Intl.DateTimeFormat) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

// One row; memo keeps the rows that did not change from rendering again when the filter or another row changes.
const Linha = memo(function Linha({ row, onEdit, onSenha, onExcluir, onKiosk, dateFormatter }: Omit<AdminUsersEditTableProps, 'rows' | 'loading'> & { row: AdminUser }) {
  const nome = nomeDoUsuario(row);
  const marcadas = CREDENCIAIS.filter((c) => row.funcionario?.credenciais[c.chave]);
  return (
    <TableRow hover>
      <TableCell>
        {!row.funcionario ? nome : (
          <ButtonBase aria-label={`Abrir os dados de ${nome}`} onClick={() => onEdit(row, 'completo')} sx={{ ...celulaSx, fontWeight: 500, '&:hover, &:focus-visible': { ...celulaSx['&:hover, &:focus-visible'], color: 'secondary.main', textDecoration: 'underline' } }}>
            {nome}
          </ButtonBase>
        )}
      </TableCell>
      <TableCell>
        {!row.funcionario ? <Chip size="small" color="warning" variant="outlined" label="Sem funcionário" /> : (
          <ButtonBase aria-label={`Credenciais de ${nome}`} onClick={() => onEdit(row, 'credenciais')} sx={celulaSx}>
            {marcadas.length
              ? <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{marcadas.map((c) => <Chip key={c.chave} size="small" label={c.rotulo} sx={{ cursor: 'inherit' }} />)}</Stack>
              : <Typography variant="body2" color="text.secondary">Nenhuma</Typography>}
          </ButtonBase>
        )}
      </TableCell>
      <TableCell>
        {!row.funcionario ? <Typography variant="body2" color="text.secondary">—</Typography> : (
          <Chip size="small" color={row.funcionario.ativo ? 'success' : 'default'} label={row.funcionario.ativo ? 'Ativo' : 'Inativo'}
            aria-label={`${row.funcionario.ativo ? 'Desativar' : 'Ativar'} ${nome}`} onClick={() => onEdit(row, 'situacao')} />
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(ultimoAcesso(row), dateFormatter)}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Stack direction="row" spacing={0.5}>
          {row.funcionario && (
            <Tooltip title="Editar dados, situação e credenciais">
              <IconButton aria-label={`Editar ${nome}`} onClick={() => onEdit(row, 'completo')}><EditOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <Tooltip title="Definir senha nova">
            <IconButton aria-label={`Definir senha de ${nome}`} onClick={() => onSenha(row)}><KeyOutlinedIcon fontSize="small" /></IconButton>
          </Tooltip>
          {isKioskCredentialEligible(row) && (
            <Tooltip title="Kiosk: QR e PIN">
              <IconButton aria-label={`Kiosk de ${nome}`} onClick={() => onKiosk(row)}><QrCode2RoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {!row.funcionario && (
            <Tooltip title="Excluir a conta (sem funcionário)">
              <IconButton aria-label={`Excluir a conta de ${nome}`} color="error" onClick={() => onExcluir(row)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
});

// Plain MUI table (2026-11-10): the DataGrid measured every row's height on each update, and typing in the filter took
// 0.2–0.5 s per key with 300 people. Sorting by Nome, Situação and Último acesso; pages of 25, 50 or 100.
export default function AdminUsersEditTable({ rows, loading, ...acoes }: AdminUsersEditTableProps) {
  const [ordem, setOrdem] = useState<{ coluna: Coluna; sentido: 'asc' | 'desc' }>({ coluna: 'nome', sentido: 'asc' });
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);

  const ordenadas = useMemo(() => {
    const lista = [...rows].sort(comparar[ordem.coluna]);
    return ordem.sentido === 'asc' ? lista : lista.reverse();
  }, [rows, ordem]);
  // A new filter can leave the current page past the end.
  const ultimaPagina = Math.max(0, Math.ceil(ordenadas.length / porPagina) - 1);
  useEffect(() => { if (pagina > ultimaPagina) setPagina(ultimaPagina); }, [pagina, ultimaPagina]);
  const visiveis = ordenadas.slice(pagina * porPagina, (pagina + 1) * porPagina);

  const cabecalho = (coluna: Coluna, rotulo: string) => (
    <TableSortLabel active={ordem.coluna === coluna} direction={ordem.coluna === coluna ? ordem.sentido : 'asc'}
      onClick={() => setOrdem((o) => ({ coluna, sentido: o.coluna === coluna && o.sentido === 'asc' ? 'desc' : 'asc' }))}>
      {rotulo}
    </TableSortLabel>
  );

  return (
    <div style={{ width: '100%' }}>
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
        {loading && <LinearProgress />}
        <Table size="small" sx={{ minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 200 }}>{cabecalho('nome', 'Nome')}</TableCell>
              <TableCell sx={{ minWidth: 220 }}>Credenciais</TableCell>
              <TableCell>{cabecalho('situacao', 'Situação')}</TableCell>
              <TableCell>{cabecalho('ultimoAcesso', 'Último acesso')}</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visiveis.map((row) => <Linha key={row.uid} row={row} {...acoes} />)}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination component="div" count={ordenadas.length} page={Math.min(pagina, ultimaPagina)} rowsPerPage={porPagina}
        rowsPerPageOptions={[25, 50, 100]} labelRowsPerPage="Por página:" labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        onPageChange={(_e, p) => setPagina(p)} onRowsPerPageChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(0); }} />
    </div>
  );
}
