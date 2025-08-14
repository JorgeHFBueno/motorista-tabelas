import { useState, useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import { Button, Stack, IconButton, Snackbar } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Registro } from '../types';
import useCombustivel from '../hooks/useCombustivel';
import CombustivelForm from './CombustivelForm';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';

export default function TabelaCombustivel() {
  const { data: rows, loading, create, update, remove } = useCombustivel();
  const { isAdmin } = useAuth();

  const [view, setView] = useState<'principal' | 'porNome'>('principal');
  const [editing, setEditing] = useState<Registro | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const brNumberFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const [exportOpen, setExportOpen] = useState(false);
  const [fromMonth, setFromMonth] = useState(dayjs().format('YYYY-MM'));
  const [toMonth, setToMonth] = useState(dayjs().format('YYYY-MM'));

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

  function toDateAny(raw: any): Date | null {
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw.seconds != null) return new Date(raw.seconds * 1e3 + (raw.nanoseconds ?? 0) / 1e6);
    if (raw._seconds != null) return new Date(raw._seconds * 1e3 + (raw._nanoseconds ?? 0) / 1e6);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  const rowsOk = useMemo(() => rows.map(r => {
    const dataJS = toDateAny((r as any).data);
    if (!dataJS) console.log('Data inválida:', r); // só loga quando realmente falhar
    return { ...r, dataJS };
  }), [rows]);

  function monthRange(fromYM: string, toYM: string) {
    const start = dayjs(`${fromYM}-01`).startOf('month').toDate();
    const end = dayjs(`${toYM}-01`).endOf('month').toDate();
    return { start, end };
  }

  function exportExcel() {
    // validação simples
    if (fromMonth > toMonth) {
      alert('Mês inicial não pode ser maior que o final.');
      return;
    }

    const { start, end } = monthRange(fromMonth, toMonth);

    // usa seus rows já normalizados (rowsOk)
    const rowsFiltrados = rowsOk.filter(r =>
      r.dataJS && r.dataJS >= start && r.dataJS <= end
    );

    // mapeia para objetos “planos” (Excel)
    const dataForExcel = rowsFiltrados.map((r: any) => ({
      Data: r.dataJS ? dateFmt.format(r.dataJS) : '',
      'Montante Final': Number(r.lf ?? 0) / 10,
      'Qnt. Abastecida': Number(r.qa ?? 0) / 10,
      'Montante Inicial': Number(r.li ?? 0) / 10,
      Arla: Number(r.arla ?? 0) / 10,
      Frentista: r.motorista ?? '',
      Operador: r.para_quem ?? '',
      Placa: r.placa ?? '',
      Destino: r.local ?? '',
      Motivo: r.motivo ?? '',
      Obs: r.observacao ?? '',
      ID: r.id ?? ''
    }));

    // cria workbook e planilha
    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Combustível');

    // salva arquivo
    const nome = `combustivel_${fromMonth}_a_${toMonth}.xlsx`;
    XLSX.writeFile(wb, nome);

    setExportOpen(false);
  }

  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  const colunas: GridColDef[] = [
    {
      field: 'dataJS',
      headerName: 'Data',
      minWidth: 160,
      flex: 1.2,
      renderCell: (params) => {
        const v = params.row.dataJS as Date | null;
        return v ? dateFmt.format(v) : '—';
      },
      sortComparator: (a, b) => {
        const ta = a instanceof Date ? a.getTime() : 0;
        const tb = b instanceof Date ? b.getTime() : 0;
        return ta - tb;
      },
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

  return (
    <>
      <Stack direction="row" spacing={2} mt={2}>
        <Button variant="contained" onClick={() => setEditing({} as Registro)} sx={{ mb: 1 }}>
          Novo
        </Button>
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

      {view === 'principal' && (
        <div style={{ height: 700, width: '100%' }}>
          <DataGrid
            rows={rowsOk}
            columns={colunas}
            loading={loading}
            getRowId={(row) => row.id}
            disableRowSelectionOnClick
            density="compact"
            getRowHeight={() => 'auto'}
            onRowDoubleClick={(p) => setEditing(p.row as Registro)}
            initialState={{ sorting: { sortModel: [{ field: 'dataJS', sort: 'desc' }] } }}
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
        <Button variant="outlined" onClick={() => setExportOpen(true)} sx={{ mb: 1, ml: 1 }}>
          Exportar Excel
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

      <Dialog open={exportOpen} onClose={() => setExportOpen(false)}>
        <DialogTitle>Exportar para Excel</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} mt={1}>
            <TextField
              type="month"
              label="Mês inicial"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="month"
              label="Mês final"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={exportExcel}>Exportar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
