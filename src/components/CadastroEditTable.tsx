import { useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { IconButton, Stack, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

export type CadastroRow = {
  id: string;
  numero?: unknown;
  nome: string;
  descricao?: string;
  createdAt?: unknown;
};

interface CadastroEditTableProps {
  rows: CadastroRow[];
  loading: boolean;
  onEdit: (row: CadastroRow) => void;
  onDelete: (row: CadastroRow) => void;
  dateFormatter: Intl.DateTimeFormat;
  showNumero?: boolean;
}

const toDate = (raw: unknown): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
};

export default function CadastroEditTable({
  rows,
  loading,
  onEdit,
  onDelete,
  dateFormatter,
  showNumero = false,
}: CadastroEditTableProps) {
  const columns = useMemo<GridColDef<CadastroRow>[]>(() => [
    ...(showNumero ? [{
      field: 'numero',
      headerName: 'Numero',
      type: 'number',
      minWidth: 110,
      flex: 0.4,
      renderCell: (params) => params.value || '-',
    } satisfies GridColDef<CadastroRow>] : []),
    {
      field: 'nome',
      headerName: 'Nome',
      minWidth: 220,
      flex: 1,
    },
    {
      field: 'descricao',
      headerName: 'Descrição',
      minWidth: 260,
      flex: 1.4,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'createdAt',
      headerName: 'Criado em',
      minWidth: 180,
      flex: 1,
      renderCell: (params) => {
        const date = toDate(params.value);
        return date ? dateFormatter.format(date) : '—';
      },
    },
    {
      field: 'acoes',
      headerName: 'Ações',
      sortable: false,
      filterable: false,
      minWidth: 140,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Tooltip title="Editar">
            <IconButton size="small" onClick={() => onEdit(params.row)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Excluir">
            <IconButton size="small" color="error" onClick={() => onDelete(params.row)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ], [dateFormatter, onDelete, onEdit, showNumero]);

  return (
    <DataGrid
      autoHeight
      rows={rows}
      columns={columns}
      loading={loading}
      pageSizeOptions={[10, 25, 50]}
      initialState={{
        pagination: { paginationModel: { pageSize: 10, page: 0 } },
      }}
      disableRowSelectionOnClick
    />
  );
}
