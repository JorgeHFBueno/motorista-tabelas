import { useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Chip, IconButton, Stack, Tooltip } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { AdminUser } from '../services/adminUsersApi';

interface AdminUsersEditTableProps {
  rows: AdminUser[];
  loading: boolean;
  onEdit: (row: AdminUser) => void;
  dateFormatter: Intl.DateTimeFormat;
}

function getDisplayName(user: AdminUser) {
  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const authorizationName = user.authorization.nome?.trim();
  if (authorizationName) {
    return authorizationName;
  }

  const email = user.email?.trim().toLowerCase();
  if (email) {
    return email.split('@')[0];
  }

  return user.uid;
}

function getProfileLabel(user: AdminUser) {
  if (!user.authorization.exists) {
    return 'Sem autorizacao cadastrada';
  }

  return user.authorization.profile;
}

function formatDate(value: string | undefined, dateFormatter: Intl.DateTimeFormat) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateFormatter.format(date);
}

export default function AdminUsersEditTable({
  rows,
  loading,
  onEdit,
  dateFormatter,
}: AdminUsersEditTableProps) {
  const columns = useMemo<GridColDef<AdminUser>[]>(() => [
    {
      field: 'displayName',
      headerName: 'Nome',
      minWidth: 220,
      flex: 1,
      renderCell: (params) => getDisplayName(params.row),
    },
    {
      field: 'email',
      headerName: 'Email',
      minWidth: 240,
      flex: 1.2,
      renderCell: (params) => params.row.email ?? '-',
    },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 130,
      flex: 0.5,
      sortable: false,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.row.disabled ? 'Inativo' : 'Ativo'}
          color={params.row.disabled ? 'default' : 'success'}
          variant={params.row.disabled ? 'outlined' : 'filled'}
        />
      ),
    },
    {
      field: 'profile',
      headerName: 'Perfil',
      minWidth: 220,
      flex: 0.9,
      sortable: false,
      renderCell: (params) => getProfileLabel(params.row),
    },
    {
      field: 'lastLoginAt',
      headerName: 'Ultimo acesso',
      minWidth: 170,
      flex: 0.8,
      renderCell: (params) => formatDate(params.row.lastLoginAt, dateFormatter),
    },
    {
      field: 'createdAt',
      headerName: 'Criado em',
      minWidth: 170,
      flex: 0.8,
      renderCell: (params) => formatDate(params.row.createdAt, dateFormatter),
    },
    {
      field: 'acoes',
      headerName: 'Acoes',
      minWidth: 110,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Tooltip title="Editar">
            <IconButton size="small" onClick={() => onEdit(params.row)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ], [dateFormatter, onEdit]);

  return (
    <DataGrid
      autoHeight
      rows={rows}
      columns={columns}
      loading={loading}
      getRowId={(row) => row.uid}
      pageSizeOptions={[10, 25, 50]}
      initialState={{
        pagination: { paginationModel: { pageSize: 10, page: 0 } },
      }}
      disableRowSelectionOnClick
    />
  );
}
