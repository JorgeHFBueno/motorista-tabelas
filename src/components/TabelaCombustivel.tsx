import { useState, useMemo, useEffect } from 'react';
import { DataGrid, type GridColDef, useGridApiRef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { gridFilteredSortedRowIdsSelector } from '@mui/x-data-grid/hooks/features/filter';
import dayjs from 'dayjs';
import { Button, Stack, IconButton, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate } from 'react-router-dom';
import type { Registro } from '../types';
import useCombustivel from '../hooks/useCombustivel';
import CombustivelForm from './CombustivelForm';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { useAdm1MontanteGate } from '../hooks/useAdm1MontanteGate';
import * as XLSX from 'xlsx';
import useOnlineStatus from '../hooks/useOnlineStatus';

type View = 'principal' | 'porNome' | 'custo';

interface CustoRow {
  id: string;
  placa: string;
  kmMes: number | null;
  litrosMes: number;
  mediaKmPorLitro: number | null;
  statusKm: 'OK' | 'SEM_ODOMETRO' | 'DADOS_INSUFICIENTES';
}

const EXCEL_KNOWN_COLUMNS = [
  { field: 'id', label: 'ID' },
  { field: 'data', label: 'Data' },
  { field: 'placa', label: 'Placa' },
  { field: 'motorista', label: 'Motorista' },
  { field: 'km', label: 'KM' },
  { field: 'li', label: 'Montante Inicial' },
  { field: 'qa', label: 'Quantidade Abastecida' },
  { field: 'lf', label: 'Montante Final' },
  { field: 'arla', label: 'Arla' },
  { field: 'para_quem', label: 'Para quem' },
  { field: 'local', label: 'Local' },
  { field: 'obra', label: 'Obra' },
  { field: 'motivo', label: 'Motivo' },
  { field: 'observacao', label: 'Observacao' },
  { field: 'galao', label: 'Galao' },
  { field: 'semKm', label: 'Sem KM' },
  { field: 'tipoPlaca', label: 'KM flag' },
] as const;

const DECIMAL_TENTH_FIELDS = new Set(['li', 'qa', 'lf', 'arla']);
const IGNORED_EXCEL_FIELDS = new Set(['dataJS', 'actions', 'tipo', 'hnf']);
const DATE_FIELD_PATTERN = /(data|date|created|updated|criado|alterado|editado|timestamp)/i;
const BR_THOUSANDS_NUMBER_PATTERN = /^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/;
const DATA_GRID_LOCALE_TEXT = ptBR.components.MuiDataGrid.defaultProps.localeText;

function parseKmNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = BR_THOUSANDS_NUMBER_PATTERN.test(trimmed)
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function TabelaCombustivel() {
  const { data: rows, loading, create, update, remove } = useCombustivel();
  const principalGridApiRef = useGridApiRef();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading, isAdmin } = useAuth();
  const { profile } = useAuthorizationProfile(currentUser, authLoading);
  const isAdm1 = profile?.adm1 === true;
  const { requestAccess, dialog } = useAdm1MontanteGate(isAdm1);
  const { isOnline } = useOnlineStatus();

  const [view, setView] = useState<View>('principal');
  const [editing, setEditing] = useState<Registro | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const brNumberFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const kmFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const [exportOpen, setExportOpen] = useState(false);
  const [fromMonth, setFromMonth] = useState(dayjs().format('YYYY-MM'));
  const [toMonth, setToMonth] = useState(dayjs().format('YYYY-MM'));
  const [selectedMonth, setSelectedMonth] = useState('');

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

  function formatExcelValue(field: string, value: any, row: any) {
    if (value === undefined || value === null || value === '') return '';

    const shouldFormatAsDate =
      field === 'data' ||
      DATE_FIELD_PATTERN.test(field) ||
      value instanceof Date ||
      typeof value?.toDate === 'function' ||
      value?.seconds != null ||
      value?._seconds != null;
    const dateValue = shouldFormatAsDate ? (field === 'data' ? row.dataJS : toDateAny(value)) : null;
    if (dateValue) return excelDateFmt.format(dateValue);

    if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';

    if (DECIMAL_TENTH_FIELDS.has(field)) {
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? value : numberValue / 10;
    }

    if (typeof value === 'number') return value;
    if (Array.isArray(value)) return value.map((item) => formatExcelValue(field, item, row)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);

    return value;
  }

  function getExcelFieldValue(field: string, row: Record<string, unknown>) {
    if (field === 'obra') {
      return typeof row.obra === 'string' ? row.obra.trim() : '';
    }
    return row[field];
  }

  function getFilteredPrincipalRows() {
    const api = principalGridApiRef.current;
    if (!api) return rowsOk;

    try {
      const filteredSortedIds = gridFilteredSortedRowIdsSelector(principalGridApiRef);
      return filteredSortedIds
        .map((id) => api.getRow(id))
        .filter(Boolean) as any[];
    } catch {
      return rowsOk;
    }
  }

  function buildExcelColumns(exportRows: any[]) {
    const knownFields = new Set(EXCEL_KNOWN_COLUMNS.map((column) => column.field));
    const extraFields = Array.from(
      exportRows.reduce((fields, row) => {
        Object.keys(row).forEach((field) => {
          if (!knownFields.has(field) && !IGNORED_EXCEL_FIELDS.has(field)) {
            fields.add(field);
          }
        });
        return fields;
      }, new Set<string>()),
    ).sort((a, b) => a.localeCompare(b));

    return [
      ...EXCEL_KNOWN_COLUMNS,
      ...extraFields.map((field) => ({ field, label: field })),
    ];
  }

  function formatKmValue(value: unknown) {
    const numericValue = parseKmNumber(value);
    if (numericValue !== null) return kmFormatter.format(numericValue);
    if (typeof value === 'string' && value.trim()) return value.trim();
    return '—';
  }

  function exportExcel() {
    // validação simples
    if (fromMonth > toMonth) {
      alert('Mês inicial não pode ser maior que o final.');
      return;
    }

    const { start, end } = monthRange(fromMonth, toMonth);
    const sourceRows: any[] = view === 'principal' ? getFilteredPrincipalRows() : rowsOk;

    // usa seus rows já normalizados (rowsOk)
    const rowsFiltrados = sourceRows.filter(r =>
      r.dataJS && r.dataJS >= start && r.dataJS <= end
    );

    // mapeia para objetos “planos” (Excel)
    const excelColumns = buildExcelColumns(rowsFiltrados);
    const dataForExcel = rowsFiltrados.map((r: any) => (
      excelColumns.reduce<Record<string, any>>((acc, column) => {
        acc[column.label] = formatExcelValue(column.field, getExcelFieldValue(column.field, r), r);
        return acc;
      }, {})
    ));

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

  const excelDateFmt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
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
      renderCell: (params) => {
        const value = params?.value;
        if (value === null || value === undefined || isNaN(Number(value))) return '—';
        return brNumberFormatter.format(Number(value) / 10);
      },
    },
    {
      field: 'qa',
      headerName: 'Qnt. Abastecida',
      minWidth: 120,
      flex: 1,
      renderCell: (params) => {
        const value = params?.value;
        if (value === null || value === undefined || isNaN(Number(value))) return '—';
        return brNumberFormatter.format(Number(value) / 10);
      },
    },
    {
      field: 'li',
      headerName: 'Montante Inicial',
      minWidth: 120,
      flex: 1,
      renderCell: (params) => {
        const value = params?.value;
        if (value === null || value === undefined || isNaN(Number(value))) return '—';
        return brNumberFormatter.format(Number(value) / 10);
      },
    },
    {
      field: 'arla',
      headerName: 'Arla',
      minWidth: 80,
      flex: 1,
      renderCell: (params) => {
        const value = params?.value;
        if (value === null || value === undefined || isNaN(Number(value))) return '—';
        return brNumberFormatter.format(Number(value) / 10);
      },
    },
    { field: 'motorista', headerName: 'Frentista', minWidth: 150, flex: 1.2 },
    { field: 'para_quem', headerName: 'Operador', minWidth: 150, flex: 1.2 },
    { field: 'placa', headerName: 'Placa', minWidth: 120, flex: 1 },
    {
      field: 'km',
      headerName: 'KM',
      minWidth: 100,
      flex: 0.8,
      renderCell: ({ value }) => formatKmValue(value),
      sortComparator: (a, b) => {
        const aNumber = parseKmNumber(a);
        const bNumber = parseKmNumber(b);
        if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
        if (aNumber !== null) return 1;
        if (bNumber !== null) return -1;
        return String(a ?? '').localeCompare(String(b ?? ''));
      },
    },
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

  const monthOptions = useMemo(() => {
    const monthLabels = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const map = new Map<string, { value: string; label: string; year: number; month: number }>();

    for (const r of rowsOk) {
      const dataJS = (r as any).dataJS as Date | null | undefined;
      if (!dataJS || !(dataJS instanceof Date) || isNaN(dataJS.getTime())) continue;
      const year = dataJS.getFullYear();
      const month = dataJS.getMonth();
      const value = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = `${monthLabels[month]}-${String(year).slice(-2)}`;
      if (!map.has(value)) {
        map.set(value, { value, label, year, month });
      }
    }

    const options = Array.from(map.values())
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .map(({ value, label }) => ({ value, label }));

    console.log('[Custo] monthOptions:', options);
    return options;
  }, [rowsOk]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      if (selectedMonth !== '') setSelectedMonth('');
      return;
    }
    const hasSelected = monthOptions.some(option => option.value === selectedMonth);
    if (!hasSelected) {
      setSelectedMonth(monthOptions[monthOptions.length - 1].value);
    }
  }, [monthOptions, selectedMonth]);

  useEffect(() => {
    console.log('[Custo] selectedMonth:', selectedMonth);
  }, [selectedMonth]);

  const registrosDoMes = useMemo(() => {
    if (!selectedMonth) return [];
    const [anoStr, mesStr] = selectedMonth.split('-');
    const anoSelecionado = Number(anoStr);
    const mesSelecionado = Number(mesStr) - 1;

    const registros = rowsOk.filter((r) => {
      const dataJS = (r as any).dataJS as Date | null | undefined;
      if (!dataJS || !(dataJS instanceof Date) || isNaN(dataJS.getTime())) return false;
      return dataJS.getFullYear() === anoSelecionado && dataJS.getMonth() === mesSelecionado;
    });

    console.log('[Custo] registrosDoMes length para', selectedMonth, ':', registros.length);
    return registros;
  }, [rowsOk, selectedMonth]);

  function buildCustoRows(registros: Registro[], month: string): CustoRow[] {
    if (!month) return [];
    const grouped: Record<string, Registro[]> = {};

    for (const r of registros) {
      const placa = (r.placa ?? '').trim() || '—';
      if (!grouped[placa]) grouped[placa] = [];
      grouped[placa].push(r);
    }

    const custoRows = Object.entries(grouped).map(([placa, registrosPlaca]) => {
      const semOdometro = registrosPlaca.every((r) => r.semKm === 'Sem Odômetro' || r.tipoPlaca === false);
      const registrosComKm = registrosPlaca
        .filter((r) => typeof r.km === 'number' && !Number.isNaN(r.km))
        .sort((a, b) => {
          const aData = (a as any).dataJS as Date | null | undefined;
          const bData = (b as any).dataJS as Date | null | undefined;
          const aTime = aData instanceof Date && !isNaN(aData.getTime()) ? aData.getTime() : 0;
          const bTime = bData instanceof Date && !isNaN(bData.getTime()) ? bData.getTime() : 0;
          return aTime - bTime;
        });

      let kmMes: number | null = null;
      let statusKm: CustoRow['statusKm'] = 'DADOS_INSUFICIENTES';

      if (semOdometro) {
        statusKm = 'SEM_ODOMETRO';
      } else if (registrosComKm.length >= 2) {
        const firstKm = registrosComKm[0].km as number;
        const lastKm = registrosComKm[registrosComKm.length - 1].km as number;
        if (lastKm >= firstKm) {
          kmMes = lastKm - firstKm;
          statusKm = 'OK';
        }
      }

      const litrosMes = registrosPlaca.reduce((acc, r) => acc + Number(r.qa ?? 0), 0) / 10;
      const mediaKmPorLitro = statusKm === 'OK' && litrosMes > 0 && kmMes !== null ? kmMes / litrosMes : null;

      console.log('[Custo] placa', placa, 'registrosPlaca:', registrosPlaca.length, 'registrosComKm:', registrosComKm.length, 'semOdometro:', semOdometro);

      return {
        id: `${placa}-${month}`,
        placa,
        kmMes,
        litrosMes,
        mediaKmPorLitro,
        statusKm,
      };
    });

    custoRows.sort((a, b) => a.placa.localeCompare(b.placa));
    console.log('[Custo] custoRows para', month, ':', custoRows);
    return custoRows;
  }

  const custoRows = useMemo(() => buildCustoRows(registrosDoMes, selectedMonth), [registrosDoMes, selectedMonth]);

  const custoColumns: GridColDef[] = useMemo(
  () => [
    { field: 'placa', headerName: 'Placa', minWidth: 140, flex: 1 },
    {
      field: 'kmMes',
      headerName: 'Quilômetro Mês',
      minWidth: 160,
      flex: 1,
      renderCell: (params) => {
        if (!params) return '—';

        const row = params.row as CustoRow | undefined;
        const value = params.value as number | null | undefined;

        if (row?.statusKm === 'SEM_ODOMETRO') return 'Sem odômetro';
        if (row?.statusKm === 'DADOS_INSUFICIENTES') return 'Dados insuficientes';
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';

        return kmFormatter.format(Number(value));
      },
    },
    {
      field: 'litrosMes',
      headerName: 'Litros Mês',
      minWidth: 140,
      flex: 1,
      renderCell: (params) => {
        if (!params) return '—';

        const value = params.value as number | null | undefined;
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';

        return brNumberFormatter.format(Number(value));
      },
    },
    {
      field: 'mediaKmPorLitro',
      headerName: 'Média (km/l)',
      minWidth: 140,
      flex: 1,
      renderCell: (params) => {
        if (!params) return '—';

        const row = params.row as CustoRow | undefined;
        const value = params.value as number | null | undefined;

        if (row?.statusKm !== 'OK') return '—';
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';

        return brNumberFormatter.format(Number(value));
      },
    },
  ],
  [brNumberFormatter, kmFormatter],
);
  
  return (
    <>
      {!isOnline && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Você está offline. Os dados exibidos podem estar em cache e novas alterações serão sincronizadas quando a conexão voltar.
        </Alert>
      )}
      <Stack direction="row" spacing={2} mt={2}>
        <Button variant="contained" onClick={() => requestAccess(() => navigate('/combustivel/novo'))} sx={{ mb: 1 }}>
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
          Por Nom3
        </Button>
        <Button
          variant={view === 'custo' ? 'contained' : 'outlined'}
          onClick={() => setView('custo')}
        >
          Custo2
        </Button>
      </Stack>

      {view === 'principal' && (
        <div style={{ height: 700, width: '100%' }}>
          <DataGrid
            apiRef={principalGridApiRef}
            rows={rowsOk}
            columns={colunas}
            localeText={DATA_GRID_LOCALE_TEXT}
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
            localeText={DATA_GRID_LOCALE_TEXT}
            disableRowSelectionOnClick
            density="compact"
            getRowHeight={() => 'auto'}
          />
        </div>
      )}

      {view === 'custo' && (
        <>
          <Stack direction="row" spacing={2} mt={2}>
            <TextField
              select
              label="Por mês"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              {monthOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <div style={{ height: 400, width: '100%', marginTop: 16 }}>
            <DataGrid
              rows={custoRows}
              columns={custoColumns}
              localeText={DATA_GRID_LOCALE_TEXT}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
              density="compact"
              getRowHeight={() => 'auto'}
            />
          </div>
        </>
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
              slotProps={{ htmlInput: { lang: 'pt-BR' } }}
            />
            <TextField
              type="month"
              label="Mês final"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              InputLabelProps={{ shrink: true }}
              slotProps={{ htmlInput: { lang: 'pt-BR' } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={exportExcel}>Exportar</Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </>
  );
}
