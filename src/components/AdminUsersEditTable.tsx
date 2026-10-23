import { useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { loginDoUsuario, nomeDoUsuario, type AdminUser } from '../services/adminUsersApi';
import { CREDENCIAIS } from '../services/credenciais';

interface AdminUsersEditTableProps {
  rows: AdminUser[];
  loading: boolean;
  onEdit: (row: AdminUser) => void;
  onSenha: (row: AdminUser) => void;
  onExcluir: (row: AdminUser) => void;
  dateFormatter: Intl.DateTimeFormat;
}

function formatDate(value: string | null | undefined, dateFormatter: Intl.DateTimeFormat) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export default function AdminUsersEditTable({ rows, loading, onEdit, onSenha, onExcluir, dateFormatter }: AdminUsersEditTableProps) {
  const columns = useMemo<GridColDef<AdminUser>[]>(() => [
    { field: 'nome', headerName: 'Nome', minWidth: 200, flex: 1, valueGetter: (_v, row) => nomeDoUsuario(row) },
    { field: 'login', headerName: 'Login', minWidth: 210, flex: 1, valueGetter: (_v, row) => loginDoUsuario(row) },
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
        return marcadas.length
          ? <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 0.5 }}>{marcadas.map((c) => <Chip key={c.chave} size="small" label={c.rotulo} />)}</Stack>
          : <Typography variant="body2" color="text.secondary">Nenhuma</Typography>;
      },
    },
    {
      field: 'situacao',
      headerName: 'Situação',
      minWidth: 120,
      valueGetter: (_v, row) => (!row.funcionario ? 'Sem funcionário' : row.funcionario.ativo ? 'Ativo' : 'Inativo'),
      renderCell: ({ row }) => (!row.funcionario
        ? <Typography variant="body2" color="text.secondary">—</Typography>
        : <Chip size="small" color={row.funcionario.ativo ? 'success' : 'default'} label={row.funcionario.ativo ? 'Ativo' : 'Inativo'} />),
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
            <Tooltip title="Editar credenciais e situação">
              <IconButton aria-label={`Editar ${nomeDoUsuario(row)}`} onClick={() => onEdit(row)}><EditOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <Tooltip title="Definir senha nova">
            <IconButton aria-label={`Definir senha de ${nomeDoUsuario(row)}`} onClick={() => onSenha(row)}><KeyOutlinedIcon fontSize="small" /></IconButton>
          </Tooltip>
          {!row.funcionario && (
            <Tooltip title="Excluir a conta (sem funcionário)">
              <IconButton aria-label={`Excluir a conta de ${nomeDoUsuario(row)}`} color="error" onClick={() => onExcluir(row)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ], [dateFormatter, onEdit, onExcluir, onSenha]);

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
