import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { DataGrid, GridToolbar, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import { db } from '../firebase';

interface Props {
  collectionName: string;
}

export default function CollectionViewer({ collectionName }: Props) {
  const [rows, setRows] = useState<GridRowsProp>([]);

  useEffect(() => {
    getDocs(collection(db, collectionName)).then((snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [collectionName]);

  const columns: GridColDef[] = Object.keys(rows[0] ?? {}).map((k) => ({
    field: k,
    headerName: k.toUpperCase(),
    flex: 1,
  }));

  return (
    <div style={{ height: 600, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        slots={{ toolbar: GridToolbar }}
        disableRowSelectionOnClick
      />
    </div>
  );
}
