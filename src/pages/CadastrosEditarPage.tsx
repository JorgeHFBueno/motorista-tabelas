import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import CadastroEditModal, { type CadastroEditFormValues } from '../components/CadastroEditModal';
import CadastroEditTable, { type CadastroRow } from '../components/CadastroEditTable';
import CadastroUsuariosEditarPage from './CadastroUsuariosEditarPage';
import {
  getFornecedorNumeroErrorMessage,
  normalizeFornecedorNumero,
  updateFornecedorCadastro,
} from '../services/fornecedores.service';

type CadastroTipo = 'usuarios' | 'obras' | 'categorias' | 'fornecedores';

const CADASTRO_CONFIG: Record<CadastroTipo, { label: string; collectionName: string }> = {
  obras: {
    label: 'Obras',
    collectionName: 'obras',
  },
  categorias: {
    label: 'Categorias',
    collectionName: 'notas-categorias',
  },
  fornecedores: {
    label: 'Fornecedores',
    collectionName: 'notas-fornecedores',
  },
};

export default function CadastrosEditarPage() {
  const { tipo } = useParams();
  const cadastroTipo = tipo as CadastroTipo;

  if (cadastroTipo === 'usuarios') {
    return <CadastroUsuariosEditarPage />;
  }

  return <GenericCadastrosEditarPage cadastroTipo={cadastroTipo} />;
}

function GenericCadastrosEditarPage({ cadastroTipo }: { cadastroTipo: Exclude<CadastroTipo, 'usuarios'> }) {
  const config = CADASTRO_CONFIG[cadastroTipo];
  const [rows, setRows] = useState<CadastroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [editing, setEditing] = useState<CadastroRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CadastroRow | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }), []);

  const loadRows = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const rowsQuery = query(collection(db, config.collectionName), orderBy('nome', 'asc'));
      const snapshot = await getDocs(rowsQuery);
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<CadastroRow, 'id'>),
      }));
      setRows(data);
    } catch (error) {
      console.error('Erro ao carregar cadastros', error);
      setSnackbar({ message: 'Erro ao carregar cadastros.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const nomeMatch = row.nome?.toLowerCase().includes(term);
      const descricaoMatch = row.descricao?.toLowerCase().includes(term);
      const numeroMatch = cadastroTipo === 'fornecedores' && String(row.numero ?? '').includes(term);
      return nomeMatch || descricaoMatch || numeroMatch;
    });
  }, [cadastroTipo, rows, search]);

  const handleSave = async (values: CadastroEditFormValues) => {
    if (!config || !editing) return;
    setSaving(true);
    setEditError(null);
    try {
      if (cadastroTipo === 'fornecedores') {
        await updateFornecedorCadastro({
          id: editing.id,
          nome: values.nome,
          descricao: values.descricao,
          numero: values.numero,
          numeroAtual: editing.numero,
        });
      } else {
        await updateDoc(doc(db, config.collectionName, editing.id), {
          nome: values.nome.trim(),
          descricao: values.descricao.trim(),
          updatedAt: serverTimestamp(),
        });
      }
      setSnackbar({ message: 'Cadastro atualizado com sucesso.', severity: 'success' });
      setEditing(null);
      await loadRows();
    } catch (error) {
      console.error('Erro ao atualizar cadastro', error);
      const numeroErrorMessage = getFornecedorNumeroErrorMessage(error);
      if (numeroErrorMessage) {
        setEditError(numeroErrorMessage);
      } else {
        setSnackbar({ message: 'Erro ao atualizar cadastro.', severity: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config || !deleting) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, config.collectionName, deleting.id));
      setSnackbar({ message: 'Cadastro removido.', severity: 'success' });
      setDeleting(null);
      await loadRows();
    } catch (error) {
      console.error('Erro ao excluir cadastro', error);
      setSnackbar({ message: 'Erro ao excluir cadastro.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Alert severity="error">Tipo de cadastro inválido.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
            <Box>
              <Typography variant="h4" gutterBottom>
                Editar {config.label}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Gerencie registros de {config.label.toLowerCase()}.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" component={RouterLink} to="/cadastros">
                Voltar
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack spacing={2}>
            <TextField
              label="Filtrar por nome ou descrição"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
            />
            <CadastroEditTable
              rows={filteredRows}
              loading={loading}
              onEdit={(row) => {
                setEditError(null);
                setEditing(row);
              }}
              onDelete={(row) => setDeleting(row)}
              dateFormatter={dateFormatter}
              showNumero={cadastroTipo === 'fornecedores'}
            />
          </Stack>
        </Paper>
      </Stack>

      <CadastroEditModal
        open={Boolean(editing)}
        title={`Editar ${config.label.slice(0, -1)}`}
        initialValues={{
          nome: editing?.nome ?? '',
          descricao: editing?.descricao ?? '',
          numero: normalizeFornecedorNumero(editing?.numero)?.toString() ?? '',
        }}
        onClose={() => {
          setEditing(null);
          setEditError(null);
        }}
        onSave={handleSave}
        saving={saving}
        showNumero={cadastroTipo === 'fornecedores'}
        submitError={editError}
      />

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} fullWidth maxWidth="xs">
        <DialogTitle>Excluir cadastro</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Tem certeza que deseja excluir <strong>{deleting?.nome}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={saving}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>

      {snackbar && (
        <Snackbar
          open={Boolean(snackbar)}
          autoHideDuration={4000}
          onClose={() => setSnackbar(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      )}
    </Container>
  );
}
