import { useState, useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import { Button, Stack, IconButton, Snackbar } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Registro } from '../types';
import useCombustivel from '../hooks/useCombustivel';
import CombustivelForm from './CombustivelForm';
import { useAuth } from '../contexts/AuthContext';

export default function TabelaCombustivel() {
  const { data: rows, loading, create, update, remove } = useCombustivel();
  const { isAdmin } = useAuth();

  const [view, setView] = useState<'principal' | 'porNome'>('principal');
  const [editing, setEditing] = useState<Registro | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  /* ───────────────────────── helpers ───────────────────────── */
  const brNumberFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  async function handleSave(values: Partial<Registro>) {
    try {
      if (editing?.id) {
        await update(editing.id, values);
      } else {
        await create(values as Omit<Registro, 'id'>);
      }
      setSnack('Salvo com sucesso');
    } catch (err: any) {
      setSnack(err.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove(id);
      setSnack('Excluído');
    } catch (err: any) {
      setSnack(err.message);
    }
  }

  /* ───────────────────────── Data parsing ───────────────────────── */
  const rowsOk = useMemo(() => {
    return rows.map((r) => {
      const raw = (r as any).data; // campo vindo do Firestore
      let dataJS: Date | null = null;

      if (raw?.toDate) dataJS = raw.toDate();                // Timestamp → Date
      else if (raw?.seconds) dataJS = new Date(raw.seconds * 1_000);
      else if (raw) dataJS = new Date(raw);                  // string ou number

      if (!dataJS || isNaN(dataJS.getTime())) {
        // <-- LOGA toda a linha que ainda der problema
        console.log('Data inválida:', r);
        dataJS = null;
      }

      return { ...r, dataJS };
    });
  }, [rows]);

  /* ───────────────────────── Columns ───────────────────────── */
  const colunas: GridColDef[] = [
    {
      field: 'dataJS',
      headerName: 'Data',
      type: 'dateTime',
      minWidth: 160,
      flex: 1.2,
      valueFormatter: ({ value }) =>
        value ? dayjs(value as Date).format('DD/MM/YY HH:mm') : '—',
    },
    {
      field: 'lf',
      headerName: 'Montante Final',
      minWidth: 120,
      flex: 1,
      renderCell: ({ value }) =>
        isNaN(Number(value)) ? '—' : brNumberFormatter.format(Number(value) / 10),
    },
    {
      field: 'qa',
      headerName: 'Qnt. Abastecida',
      minWidth: 120,
      flex: 1,
      renderCell: ({ value }) =>
        isNaN(Number(value)) ? '—' : brNumberFormatter.format(Number(value) / 10),
    },
    {
      field: 'li',
      headerName: 'Montante Inicial',
      minWidth: 120,
      flex: 1,
      renderCell: ({ value }) =>
        isNaN(Number(value)) ? '—' : brNumberFormatter.format(Number(value) / 10),
    },
    {
      field: 'arla',
      headerName: 'Arla',
      minWidth: 80,
      flex: 1,
      renderCell: ({ value }) =>
        isNaN(Number(value)) ? '—' : brNumberFormatter.format(Number(value) / 10),
    },
    { field: 'motorista', headerName: 'Frentista', minWidth: 150, flex: 1.2 },
    { field: 'para_quem', headerName: 'Operador', minWidth: 150, flex: 1.2 },
    { field: 'placa', headerName: 'Placa', minWidth: 120, flex: 1 },
    { field: 'local', headerName: 'Destino', minWidth: 180, flex: 1.5 },
    { field: 'motivo', headerName: 'Motivo', minWidth: 200, flex: 1.5 },
    { field: 'observacao', headerName: 'Obs', minWidth: 220, flex: 2 },
  ];

  if (isAdmin) {
    colunas.push({
      field: 'actions',
      headerName: 'Excluir',
      width: 80,
      renderCell: (params) => (
        <IconButton onClick={() => handleDelete(params.row.id)}>
          <DeleteIcon />
        </IconButton>
      ),
    });
  }

  /* ────── agregados “Por Nome” ────── */
  const agregadosPorNome = useMemo(() => {
    const map: Record<string, { nome: string; abastecimentos: number; litros: number }> = {};

    for (const r of rowsOk) {
      const nome = (r as any).motorista || '—';
      const litros = Number((r as any).qa) / 10;
      if (!map[nome]) map[nome] = { nome, abastecimentos: 1, litros };
      else {
        map[nome].abastecimentos += 1;
        map[nome].litros += litros;
      }
    }

    return Object.values(map)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((it, idx) => ({ id: idx, ...it }));
  }, [rowsOk]);

  /* ───────────────────────── UI ───────────────────────── */
  return (
    <>
      <Button variant="contained" onClick={() => setEditing({} as Registro)} sx={{ mb: 1 }}>
        Novo
      </Button>

      {view === 'principal' && (
        <div style={{ height: 700, width: '100%' }}>
          <DataGrid
            rows={rowsOk}
            columns={colunas}
            loading={loading}
            disableRowSelectionOnClick
            density="compact"
            getRowHeight={() => 'auto'}
            onRowDoubleClick={(p) => setEditing(p.row as Registro)}
            initialState={{
              sorting: { sortModel: [{ field: 'dataJS', sort: 'desc' }] },
            }}
            getRowClassName={({ row }) =>
              (row as any).para_quem === 'ERRO' ? 'row-error' : ''
            }
            sx={{
              '& .row-error': { bgcolor: 'rgba(255,0,0,0.6)' },
            }}
          />
        </div>
      )}

      {view === 'porNome' && (
        <div style={{ height: 400, width: '100%', marginTop: 16 }}>
          <DataGrid
            rows={agregadosPorNome}
            columns={[
              { field: 'nome', headerName: 'Nome', minWidth: 200, flex: 1 },
              { field: 'abastecimentos', headerName: 'Abastecimentos', minWidth: 150, flex: 0.7 },
              { field: 'litros', headerName: 'Litros', minWidth: 150, flex: 0.7 },
            ]}
            disableRowSelectionOnClick
            density="compact"
            getRowHeight={() => 'auto'}
          />
        </div>
      )}

      <Stack direction="row" spacing={2} mt={2}>
        <Button
          variant={view === 'principal' ? 'contained' : 'outlined'}
          onClick={() => setView('principal')}
        >
          Principal
        </Button>
        <Button
          variant={view === 'porNome' ? 'contained' : 'outlined'}
          onClick={() => setView('porNome')}
        >
          Por Nome
        </Button>
      </Stack>

      <CombustivelForm
        open={!!editing}
        initialData={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={handleSave}
      />

      <Snackbar
        open={!!snack}
        onClose={() => setSnack(null)}
        message={snack}
        autoHideDuration={4000}
      />
    </>
  );
}