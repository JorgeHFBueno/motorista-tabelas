import { useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ButtonBase, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
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

function formatDate(value: string | null | undefined, dateFormatter: Intl.DateTimeFormat) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export default function AdminUsersEditTable({ rows, loading, onEdit, onSenha, onExcluir, onKiosk, dateFormatter }: AdminUsersEditTableProps) {
  const columns = useMemo<GridColDef<AdminUser>[]>(() => [
    {
      field: 'nome',
      headerName: 'Nome',
      minWidth: 220,
      flex: 1.2,
      valueGetter: (_v, row) => nomeDoUsuario(row),
      renderCell: ({ row }) => (!row.funcionario
        ? nomeDoUsuario(row)
        : (
          <ButtonBase aria-label={`Abrir os dados de ${nomeDoUsuario(row)}`} onClick={() => onEdit(row, 'completo')} sx={{ ...celulaSx, fontWeight: 500, '&:hover, &:focus-visible': { ...celulaSx['&:hover, &:focus-visible'], color: 'secondary.main', textDecoration: 'underline' } }}>
            {nomeDoUsuario(row)}
          </ButtonBase>
        )),
    },
    {
      field: 'credenciais',
      headerName: 'Credenciais',
      minWidth: 260,
      flex: 1.4,
      sortable: false,
      valueGetter: (_v, row) => CREDENCIAIS.filter((c) => row.funcionario?.credenciais[c.chave]).map((c) => c.rotulo).join(', '),
      renderCell: ({ row }) => {
        if (!row.funcionario) return <Chip size="small" color="warning" variant="outlined" label="Sem funcionário" />;
        const marcadas = CREDENCIAIS.filter((c) => row.funcionario?.credenciais[c.chave]);
        return (
          <ButtonBase aria-label={`Credenciais de ${nomeDoUsuario(row)}`} onClick={() => onEdit(row, 'credenciais')} sx={celulaSx}>
            {marcadas.length
              ? <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{marcadas.map((c) => <Chip key={c.chave} size="small" label={c.rotulo} sx={{ cursor: 'inherit' }} />)}</Stack>
              : <Typography variant="body2" color="text.secondary">Nenhuma</Typography>}
          </ButtonBase>
        );
      },
    },
    {
      field: 'situacao',
      headerName: 'Situação',
      minWidth: 120,
      valueGetter: (_v, row) => (!row.funcionario ? 'Sem funcionário' : row.funcionario.ativo ? 'Ativo' : 'Inativo'),
      renderCell: ({ row }) => (!row.funcionario
        ? <Typography variant="body2" color="text.secondary">—</Typography>
        : <Chip size="small" color={row.funcionario.ativo ? 'success' : 'default'} label={row.funcionario.ativo ? 'Ativo' : 'Inativo'}
            aria-label={`${row.funcionario.ativo ? 'Desativar' : 'Ativar'} ${nomeDoUsuario(row)}`} onClick={() => onEdit(row, 'situacao')} />),
    },
    {
      field: 'ultimoAcesso',
      headerName: 'Último acesso',
      minWidth: 150,
      valueGetter: (_v, row) => row.funcionario?.ultimoAcesso ?? row.lastLoginAt ?? '',
      renderCell: ({ row }) => formatDate(row.funcionario?.ultimoAcesso ?? row.lastLoginAt, dateFormatter),
    },
    {
      field: 'acoes',
      headerName: 'Ações',
      minWidth: 140,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          {row.funcionario && (
            <Tooltip title="Editar dados, situação e credenciais">
              <IconButton aria-label={`Editar ${nomeDoUsuario(row)}`} onClick={() => onEdit(row, 'completo')}><EditOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <Tooltip title="Definir senha nova">
            <IconButton aria-label={`Definir senha de ${nomeDoUsuario(row)}`} onClick={() => onSenha(row)}><KeyOutlinedIcon fontSize="small" /></IconButton>
          </Tooltip>
          {isKioskCredentialEligible(row) && (
            <Tooltip title="Kiosk: QR e PIN">
              <IconButton aria-label={`Kiosk de ${nomeDoUsuario(row)}`} onClick={() => onKiosk(row)}><QrCode2RoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {!row.funcionario && (
            <Tooltip title="Excluir a conta (sem funcionário)">
              <IconButton aria-label={`Excluir a conta de ${nomeDoUsuario(row)}`} color="error" onClick={() => onExcluir(row)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ], [dateFormatter, onEdit, onExcluir, onKiosk, onSenha]);

  return (
    <div style={{ width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.uid}
        loading={loading}
        getRowHeight={() => 'auto'}
        disableRowSelectionOnClick
        autoHeight
        initialState={{ pagination: { paginationModel: { pageSize: 25 } }, sorting: { sortModel: [{ field: 'nome', sort: 'asc' }] } }}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  );
}
