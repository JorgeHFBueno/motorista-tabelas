import { useState, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid'; // import padrão
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
  const brNumberFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  // só uma coluna ID para testar
  const colunas: any[] = [
    //{ field: 'id', headerName: 'ID', minWidth: 200 },
    {
      field: 'data',
      headerName: 'Data',
      minWidth: 160,
      flex: 1.2,
      renderCell: (params: any) => {
        try {
          const raw = params.row.data;
          let d: Date;
          if (raw?.toDate) d = raw.toDate();
          else if (raw?.seconds) d = new Date(raw.seconds * 1000);
          else d = new Date(raw);
          return <>{dayjs(d).format('DD/MM/YY HH:mm')}</>;
        } catch {
          return <>–</>;
        }
      }
    },
    {
      field: 'lf',
      headerName: 'Montante Final',
      minWidth: 120,
      flex: 1,
      renderCell: (params: any) => {
        try {
          const raw = params.row.lf;
          const num = typeof raw === 'number' ? raw : Number(raw);
          if (isNaN(num)) return <>–</>;
          // divide por 10 e formata
          return <>{brNumberFormatter.format(num / 10)}</>;
        } catch {
          return <>–</>;
        }
      }
    },
    {
      field: 'qa',
      headerName: 'Qnt. Abastecida',
      minWidth: 120,
      flex: 1,
      renderCell: (params: any) => {
        try {
          const raw = params.row.qa;
          const num = typeof raw === 'number' ? raw : Number(raw);
          if (isNaN(num)) return <>–</>;
          return <>{brNumberFormatter.format(num / 10)}</>;
        } catch {
          return <>–</>;
        }
      }
    },
    {
      field: 'li',
      headerName: 'Montante Inicial',
      minWidth: 120,
      flex: 1,
      renderCell: (params: any) => {
        try {
          const raw = params.row.li;
          const num = typeof raw === 'number' ? raw : Number(raw);
          if (isNaN(num)) return <>–</>;
          return <>{brNumberFormatter.format(num / 10)}</>;
        } catch {
          return <>–</>;
        }
      }
    },
    {
      field: 'arla',
      headerName: 'Arla',
      minWidth: 80,
      flex: 1,
      renderCell: (params: any) => {
        try {
          const raw = params.row.arla;
          const num = typeof raw === 'number' ? raw : Number(raw);
          if (isNaN(num)) return <>–</>;
          return <>{brNumberFormatter.format(num / 10)}</>;
        } catch {
          return <>–</>;
        }
      }
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
      renderCell: (params: any) => (
        <IconButton onClick={() => handleDelete(params.row.id)}>
          <DeleteIcon />
        </IconButton>
      ),
    });
  }

  const colunasPorNome: any[] = [
    { field: 'nome', headerName: 'Nome', minWidth: 200, flex: 1 },
    { field: 'abastecimentos', headerName: 'Abastecimentos', type: 'number', minWidth: 150, flex: 0.7 },
    { field: 'litros', headerName: 'Litros', type: 'number', minWidth: 150, flex: 0.7 },
  ];

  // **3) Use useMemo para agrupar e somar sempre que `rows` mudar**  
  const agregadosPorNome = useMemo(() => {
    const map: Record<string, { nome: string; abastecimentos: number; litros: number }> = {};

    for (const r of rows) {
      const nome = r.motorista || '—';
      const quantidade = 1;
      const litros = Number(r.qa) / 10;               // ja dividido
      if (!map[nome]) {
        map[nome] = { nome, abastecimentos: quantidade, litros };
      } else {
        map[nome].abastecimentos += quantidade;
        map[nome].litros += litros;
      }
    }

    // converte pra array e ordena por nome
    return Object.values(map)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((item, idx) => ({ id: idx, ...item }));
  }, [rows]);

  return (
    <>
    <Button variant="contained" onClick={() => setEditing({} as Registro)} sx={{ mb: 1 }}>
      Novo
    </Button>
    {view === 'principal' && (
      <div style={{ height: 700, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={colunas}
          disableRowSelectionOnClick
          density="compact"
          getRowHeight={() => 'auto'}
          loading={loading}
          onRowDoubleClick={(params) => setEditing(params.row as Registro)}
          initialState={{
            sorting: {
              sortModel: [{ field: 'data', sort: 'desc' }]
            }
          }}
          getRowClassName={(params: any) =>
            params.row.para_quem === 'ERRO' ? 'row-error' : ''
          }
        sx={{ // define o background vermelho claro para essas linhas
            '& .row-error': {
              bgcolor: 'rgba(255, 0, 0, 0.6)',
            },
          }}
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

      {/* --- tabela agregada “Por Nome” --- */}
      {view === 'porNome' && (
        <div style={{ height: 400, width: '100%', marginTop: 16 }}>
          <DataGrid
            rows={agregadosPorNome}
            columns={colunasPorNome}
            disableRowSelectionOnClick
            density="compact"
            getRowHeight={() => 'auto'}
          />
        </div>
      )}
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
