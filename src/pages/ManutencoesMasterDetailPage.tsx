import {
  Alert,
  Container,
  Snackbar,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import type { AlertColor } from '@mui/material/Alert';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import ManutencaoDetailPanel from '../components/ManutencaoDetailPanel';
import ManutencoesList from '../components/ManutencoesList';
import type { FonteManutencao, ManutencaoListItem } from '../components/ManutencoesList';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '@mui/material/styles';

const PAGE_SIZE = 50;

const getIdentificador = (data: Record<string, unknown>) => {
  const identificador =
    (data.identificador as string | undefined) ||
    (data.placa as string | undefined) ||
    (data.placaSnapshot as string | undefined) ||
    '';
  return identificador || 'Sem identificador';
};

const getResumo = (data: Record<string, unknown>) => {
  return (
    (data.fornecedorNomeSnapshot as string | undefined) ||
    (data.fornecedor as string | undefined) ||
    (data.categoriaNomeSnapshot as string | undefined) ||
    (data.categoria as string | undefined) ||
    (data.descricao as string | undefined) ||
    ''
  );
};

const getDataTimestamp = (data: Record<string, unknown>) => {
  const value = data.data;
  if (value instanceof Timestamp) return value;
  return null;
};

const buildCacheKey = (collectionName: FonteManutencao, docId: string) =>
  `${collectionName}/${docId}`;

type SnackbarState = { message: string; severity: AlertColor } | null;

const setDeepValue = (target: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.');
  let current = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  });
};

const deleteDeepValue = (target: Record<string, unknown>, path: string) => {
  const keys = path.split('.');
  let current = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      delete current[key];
      return;
    }
    if (!current[key] || typeof current[key] !== 'object') {
      return;
    }
    current = current[key] as Record<string, unknown>;
  });
};

export default function ManutencoesMasterDetailPage() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('md'));
  const { isAdmin } = useAuth();
  const [fonte, setFonte] = useState<FonteManutencao>('manutencoes');
  const [items, setItems] = useState<ManutencaoListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<FonteManutencao>('manutencoes');
  const [selectedDocData, setSelectedDocData] = useState<Record<string, unknown> | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);
  const cacheRef = useRef(new Map<string, Record<string, unknown>>());

  const loadManutencoes = useCallback(
    async (options?: { reset?: boolean }) => {
      const reset = options?.reset ?? false;
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const collectionRef = collection(db, fonte);
        const constraints: QueryConstraint[] = [orderBy('data', 'desc'), limit(PAGE_SIZE)];
        if (!reset && lastDoc) {
          constraints.push(startAfter(lastDoc));
        }
        const snapshot = await getDocs(query(collectionRef, ...constraints));
        const newItems = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            collection: fonte,
            identificador: getIdentificador(data),
            data: getDataTimestamp(data),
            resumo: getResumo(data),
          } satisfies ManutencaoListItem;
        });
        setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
        setHasMore(snapshot.docs.length === PAGE_SIZE);
      } catch (err) {
        console.error('Erro ao carregar manutenções', err);
        setError('Não foi possível carregar as manutenções.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fonte, lastDoc],
  );

  const handleFonteChange = (value: FonteManutencao) => {
    setFonte(value);
    setItems([]);
    setSearch('');
    setHasMore(true);
    setLastDoc(null);
    setSelectedDocId(null);
    setSelectedDocData(null);
    setSelectedError(null);
    setSelectedCollection(value);
    cacheRef.current.clear();
    void loadManutencoes({ reset: true });
  };

  useEffect(() => {
    if (items.length === 0 && !loading && !error) {
      void loadManutencoes({ reset: true });
    }
  }, [items.length, loading, error, loadManutencoes]);

  const handleSelectDoc = async (item: ManutencaoListItem) => {
    setSelectedDocId(item.id);
    setSelectedCollection(item.collection);
    setSelectedError(null);
    const cacheKey = buildCacheKey(item.collection, item.id);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSelectedDocData(cached);
      setSelectedLoading(false);
      return;
    }

    setSelectedLoading(true);
    try {
      const docRef = doc(db, item.collection, item.id);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        setSelectedDocData(null);
        setSelectedError('Documento não encontrado.');
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      cacheRef.current.set(cacheKey, data);
      setSelectedDocData(data);
    } catch (err) {
      console.error('Erro ao carregar documento', err);
      setSelectedError('Não foi possível carregar o documento.');
    } finally {
      setSelectedLoading(false);
    }
  };

  const handleReloadSelected = async () => {
    if (!selectedDocId) return;
    setSelectedLoading(true);
    setSelectedError(null);
    try {
      const docRef = doc(db, selectedCollection, selectedDocId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        setSelectedDocData(null);
        setSelectedError('Documento não encontrado.');
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      cacheRef.current.set(buildCacheKey(selectedCollection, selectedDocId), data);
      setSelectedDocData(data);
      setSnackbar({ message: 'Documento recarregado.', severity: 'success' });
    } catch (err) {
      console.error('Erro ao recarregar documento', err);
      setSelectedError('Não foi possível recarregar o documento.');
    } finally {
      setSelectedLoading(false);
    }
  };

  const handleUpdateField = async (fieldPath: string, value: unknown) => {
    if (!selectedDocId) return;
    const docRef = doc(db, selectedCollection, selectedDocId);
    try {
      if (fieldPath.includes('.')) {
        const field = new FieldPath(...fieldPath.split('.'));
        await updateDoc(docRef, field, value);
      } else {
        await updateDoc(docRef, { [fieldPath]: value });
      }
      setSelectedDocData((prev) => {
        if (!prev) return prev;
        const updated = { ...prev } as Record<string, unknown>;
        if (fieldPath.includes('.')) {
          setDeepValue(updated, fieldPath, value);
        } else {
          updated[fieldPath] = value;
        }
        cacheRef.current.set(buildCacheKey(selectedCollection, selectedDocId), updated);
        return updated;
      });
      setSnackbar({ message: 'Campo atualizado com sucesso.', severity: 'success' });
    } catch (err) {
      console.error('Erro ao atualizar campo', err);
      setSnackbar({ message: 'Erro ao atualizar campo.', severity: 'error' });
      throw err;
    }
  };

  const handleDeleteField = async (fieldPath: string) => {
    if (!selectedDocId) return;
    const confirmed = window.confirm(`Deseja remover o campo "${fieldPath}"?`);
    if (!confirmed) return;
    const docRef = doc(db, selectedCollection, selectedDocId);
    try {
      if (fieldPath.includes('.')) {
        const field = new FieldPath(...fieldPath.split('.'));
        await updateDoc(docRef, field, deleteField());
      } else {
        await updateDoc(docRef, { [fieldPath]: deleteField() });
      }
      setSelectedDocData((prev) => {
        if (!prev) return prev;
        const updated = { ...prev } as Record<string, unknown>;
        if (fieldPath.includes('.')) {
          deleteDeepValue(updated, fieldPath);
        } else {
          delete updated[fieldPath];
        }
        cacheRef.current.set(buildCacheKey(selectedCollection, selectedDocId), updated);
        return updated;
      });
      setSnackbar({ message: 'Campo removido com sucesso.', severity: 'success' });
    } catch (err) {
      console.error('Erro ao remover campo', err);
      setSnackbar({ message: 'Erro ao remover campo.', severity: 'error' });
      throw err;
    }
  };

  const handleDeleteDoc = async () => {
    if (!selectedDocId) return;
    const confirmed = window.confirm('Deseja excluir este documento?');
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, selectedCollection, selectedDocId));
      setItems((prev) => prev.filter((item) => item.id !== selectedDocId));
      cacheRef.current.delete(buildCacheKey(selectedCollection, selectedDocId));
      setSelectedDocId(null);
      setSelectedDocData(null);
      setSnackbar({ message: 'Documento excluído com sucesso.', severity: 'success' });
    } catch (err) {
      console.error('Erro ao excluir documento', err);
      setSnackbar({ message: 'Erro ao excluir documento.', severity: 'error' });
    }
  };

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = `${item.identificador} ${item.resumo} ${item.id}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search]);

  const snackbarContent = snackbar ? (
    <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} sx={{ width: '100%' }}>
      {snackbar.message}
    </Alert>
  ) : undefined;

  return (
    <Container sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Stack>
          <Typography variant="h4">Manutenções</Typography>
          <Typography variant="body2" color="text.secondary">
            Visualização Master–Detail para documentos de manutenção.
          </Typography>
        </Stack>
        <Stack direction={isSmall ? 'column' : 'row'} spacing={3} alignItems="stretch">
          <Stack flex={1} sx={{ minWidth: 280, maxWidth: isSmall ? '100%' : 420 }}>
            <ManutencoesList
              items={filteredItems}
              loading={loading}
              loadingMore={loadingMore}
              error={error}
              search={search}
              selectedId={selectedDocId}
              fonte={fonte}
              hasMore={hasMore}
              onSearchChange={setSearch}
              onSelect={handleSelectDoc}
              onLoadMore={() => loadManutencoes({ reset: false })}
              onFonteChange={handleFonteChange}
            />
          </Stack>
          <Stack flex={2} sx={{ minWidth: 280 }}>
            <ManutencaoDetailPanel
              selectedDocId={selectedDocId}
              selectedDocData={selectedDocData}
              loading={selectedLoading}
              isAdmin={isAdmin}
              error={selectedError}
              onReload={handleReloadSelected}
              onDeleteDoc={handleDeleteDoc}
              onUpdateField={handleUpdateField}
              onDeleteField={handleDeleteField}
            />
            {!isAdmin && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Você está em modo leitura. Apenas administradores podem editar ou excluir campos.
              </Alert>
            )}
          </Stack>
        </Stack>
      </Stack>
      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbarContent}
      </Snackbar>
    </Container>
  );
}