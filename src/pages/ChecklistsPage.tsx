import { useEffect, useMemo, useState } from 'react';
import { Alert, Chip, Container, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listarChecklists, type Checklist } from '../services/checklists.service';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Area of vehicle and machine checklists (checklists-v2), apart from the Saída/Chegada records. */
export default function ChecklistsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const tipo = searchParams.get('tipo') ?? 'todos';
  const veiculo = searchParams.get('veiculo') ?? '';

  useEffect(() => {
    let active = true;
    listarChecklists()
      .then((data) => active && setRows(data))
      .catch(() => active && setErro('Não foi possível carregar os checklists.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const veiculos = useMemo(() => [...new Map(rows.filter((r) => r.veiculoId).map((r) => [r.veiculoId as string, r.placa])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const filtrados = useMemo(() => rows.filter((r) => (tipo === 'todos' || r.tipo === tipo) && (!veiculo || r.veiculoId === veiculo)), [rows, tipo, veiculo]);
  const setFiltro = (chave: string, valor: string) => setSearchParams((prev) => { const p = new URLSearchParams(prev); if (valor && valor !== 'todos') p.set(chave, valor); else p.delete(chave); return p; }, { replace: true });

  const colunas: GridColDef<Checklist>[] = [
    { field: 'concluidoEm', headerName: 'Data', minWidth: 140, flex: 1, valueFormatter: (value: Date | null) => (value ? dateFmt.format(value) : '—'), sortComparator: (a: Date | null, b: Date | null) => (a?.getTime() ?? 0) - (b?.getTime() ?? 0) },
    { field: 'tipo', headerName: 'Tipo', minWidth: 100, flex: 0.6, valueGetter: (value) => (value === 'chegada' ? 'Chegada' : 'Saída') },
    { field: 'placa', headerName: 'Veículo', minWidth: 130, flex: 1 },
    { field: 'veiculoNome', headerName: 'Descrição', minWidth: 160, flex: 1.2 },
    { field: 'motorista', headerName: 'Motorista', minWidth: 160, flex: 1.2 },
    { field: 'mecanico', headerName: 'Feito por', minWidth: 150, flex: 1.1 },
    { field: 'avarias', headerName: 'Avarias', minWidth: 90, flex: 0.5, valueGetter: (_v, row) => row.totais.avaria, renderCell: ({ value }) => (value ? <Chip size="small" color="error" label={value} /> : '0') },
    { field: 'origem', headerName: 'Origem', minWidth: 120, flex: 0.7, valueGetter: (_v, row) => (row.migradoDoLegado ? 'Checklist antigo' : 'App') },
  ];

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>Checklists</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Checklists de veículos e máquinas, independentes dos registros de saída e chegada. Os checklists antigos (anteriores ao app novo) aparecem como “Checklist antigo”.
      </Typography>
      {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setFiltro('tipo', e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="todos">Saída e chegada</MenuItem>
          <MenuItem value="saida">Saída</MenuItem>
          <MenuItem value="chegada">Chegada</MenuItem>
        </TextField>
        <TextField select size="small" label="Veículo" value={veiculo} onChange={(e) => setFiltro('veiculo', e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {veiculos.map(([id, placa]) => <MenuItem key={id} value={id}>{placa}</MenuItem>)}
        </TextField>
      </Stack>
      <div style={{ height: 650, width: '100%' }}>
        <DataGrid
          rows={filtrados}
          columns={colunas}
          loading={loading}
          density="compact"
          disableRowSelectionOnClick
          onRowClick={(p) => navigate(`/checklists/${encodeURIComponent(String(p.id))}`)}
          initialState={{ sorting: { sortModel: [{ field: 'concluidoEm', sort: 'desc' }] } }}
          localeText={{ ...ptBR.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: 'Nenhum checklist encontrado.' }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </div>
    </Container>
  );
}
