import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Container, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { Timestamp } from 'firebase/firestore';
import type { Bomba } from '../types/Bomba';
import { listBombas } from '../services/bombasService';

function toDateAny(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const maybeTimestamp = value as Timestamp;
  if (typeof maybeTimestamp?.toDate === 'function') {
    return maybeTimestamp.toDate();
  }
  if (typeof (value as { seconds?: number; nanoseconds?: number }).seconds === 'number') {
    const { seconds, nanoseconds = 0 } = value as { seconds: number; nanoseconds?: number };
    return new Date(seconds * 1000 + nanoseconds / 1e6);
  }
  const parsed = new Date(value as string);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export default function BombasPage() {
  const [bombas, setBombas] = useState<Bomba[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 0,
      }),
    [],
  );

  const columns: GridColDef<Bomba>[] = useMemo(
    () => [
      {
        field: 'nomeBomba',
        headerName: 'Bomba',
        minWidth: 160,
        flex: 1.2,
        renderCell: ({ value }) => (
          <Typography variant="subtitle2" fontWeight={600}>
            {value || '—'}
          </Typography>
        ),
      },
      {
        field: 'ativo',
        headerName: 'Status',
        minWidth: 120,
        flex: 0.8,
        renderCell: ({ value }) => {
          if (value === true) return 'Ativa';
          if (value === false) return 'Inativa';
          return '—';
        },
      },
      {
        field: 'capacidadeLitros',
        headerName: 'Capacidade (L)',
        minWidth: 140,
        flex: 1,
        renderCell: ({ value }) =>
          Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
      },
      {
        field: 'estoqueAtual',
        headerName: 'Estoque atual',
        minWidth: 140,
        flex: 1,
        renderCell: ({ value }) =>
          Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
      },
      {
        field: 'montanteAtual',
        headerName: 'Montante atual',
        minWidth: 140,
        flex: 1,
        renderCell: ({ value }) =>
          Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
      },
      {
        field: 'folgaLitros',
        headerName: 'Folga (L)',
        minWidth: 120,
        flex: 1,
        renderCell: ({ value }) =>
          Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
      },
      {
        field: 'ultimoAbastecimento',
        headerName: 'Último abastecimento',
        minWidth: 180,
        flex: 1.2,
        renderCell: ({ value }) => {
          const date = toDateAny(value);
          return date ? dateFormatter.format(date) : '—';
        },
        sortComparator: (a, b) => {
          const ta = toDateAny(a)?.getTime() ?? 0;
          const tb = toDateAny(b)?.getTime() ?? 0;
          return ta - tb;
        },
      },
      {
        field: 'ultimoFrentista',
        headerName: 'Último frentista',
        minWidth: 160,
        flex: 1.1,
        renderCell: ({ value }) => value || '—',
      },
    ],
    [dateFormatter, numberFormatter],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listBombas()
      .then((data) => {
        if (active) {
          setBombas(data);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar bombas:', err);
        if (active) {
          setError('Não foi possível carregar as bombas. Tente novamente mais tarde.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Bombas
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Visualize as bombas cadastradas no sistema.
          </Typography>
        </Box>

        <Paper elevation={1} sx={{ p: 3 }}>
          {loading && <LinearProgress sx={{ mb: 2 }} />}
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {!loading && !error && bombas.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Nenhuma bomba cadastrada.
            </Alert>
          )}
          <DataGrid
            autoHeight
            rows={bombas}
            columns={columns}
            disableRowSelectionOnClick
            loading={loading}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10 },
              },
            }}
            sx={{
              '& .MuiDataGrid-cell:focus': {
                outline: 'none',
              },
            }}
          />
        </Paper>
      </Stack>
    </Container>
  );
}