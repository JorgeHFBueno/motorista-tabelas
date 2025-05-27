import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { DataGrid } from '@mui/x-data-grid';        // import padrão
import dayjs from 'dayjs';
import { db } from '../firebase';
import type { Registro } from '../types';

export default function TabelaCombustivel() {
  const [rows, setRows] = useState<Registro[]>([]);

  useEffect(() => {
    async function fetchData() {
      const snap = await getDocs(collection(db, '03-combustivel'));
      setRows(snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      })));
    }
    fetchData();
  }, []);

  const brNumberFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});
  // só uma coluna ID para testar
  const colunas: any[] = [
    { field: 'id', headerName: 'ID', minWidth: 200 },
    {
      field: 'data',
      headerName: 'Data',
      minWidth: 160,
      flex: 1.2,
      renderCell: (params: any) => {
        try {
          const raw = params.row.data;
          let d: Date;
          if (raw?.toDate)            d = raw.toDate();
          else if (raw?.seconds)      d = new Date(raw.seconds * 1000);
          else                         d = new Date(raw);
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

  return (
    <div style={{ height: 700, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={colunas}
        // ❌ sem toolbar
        disableRowSelectionOnClick
        density="compact"
        getRowHeight={() => 'auto'}
      />
    </div>
  );
}
