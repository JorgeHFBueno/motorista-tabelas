import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';
import EditableFieldRow from './EditableFieldRow';

interface ManutencaoDetailPanelProps {
  selectedDocId: string | null;
  selectedDocData: Record<string, unknown> | null;
  loading: boolean;
  isAdmin: boolean;
  error: string | null;
  onReload: () => void;
  onDeleteDoc: () => Promise<void>;
  onUpdateField: (fieldPath: string, value: unknown) => Promise<void>;
  onDeleteField: (fieldPath: string) => Promise<void>;
}

interface FlattenedField {
  path: string;
  value: unknown;
}

const isPlainObject = (value: unknown) => {
  if (value === null || typeof value !== 'object') return false;
  if (value instanceof Timestamp) return false;
  if (value instanceof Date) return false;
  if (Array.isArray(value)) return false;
  return true;
};

const flattenFields = (data: Record<string, unknown>, prefix = ''): FlattenedField[] => {
  const fields: FlattenedField[] = [];
  Object.entries(data).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      fields.push(...flattenFields(value as Record<string, unknown>, path));
    } else {
      fields.push({ path, value });
    }
  });
  return fields;
};

export default function ManutencaoDetailPanel({
  selectedDocId,
  selectedDocData,
  loading,
  isAdmin,
  error,
  onReload,
  onDeleteDoc,
  onUpdateField,
  onDeleteField,
}: ManutencaoDetailPanelProps) {
  if (!selectedDocId) {
    return (
      <Paper sx={{ p: 3, minHeight: 240 }}>
        <Typography variant="body1" color="text.secondary">
          Selecione um documento.
        </Typography>
      </Paper>
    );
  }

  if (loading) {
    return (
      <Paper sx={{ p: 3, minHeight: 240 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size={22} />
          <Typography variant="body2">Carregando detalhes...</Typography>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 3, minHeight: 240 }}>
        <Alert severity="error">{error}</Alert>
      </Paper>
    );
  }

  if (!selectedDocData) {
    return (
      <Paper sx={{ p: 3, minHeight: 240 }}>
        <Typography variant="body1" color="text.secondary">
          Documento não encontrado.
        </Typography>
      </Paper>
    );
  }

  const fields = flattenFields(selectedDocData).sort((a, b) => a.path.localeCompare(b.path));

  return (
    <Paper sx={{ p: 3, minHeight: 240 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              ID do documento
            </Typography>
            <Typography variant="h6">{selectedDocId}</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onReload}>
              Recarregar
            </Button>
            {isAdmin && (
              <Button variant="contained" color="error" onClick={onDeleteDoc}>
                Excluir documento
              </Button>
            )}
          </Stack>
        </Stack>
        <Divider />
        <Stack spacing={1}>
          {fields.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nenhum campo disponível.
            </Typography>
          ) : (
            fields.map((field) => (
              <EditableFieldRow
                key={field.path}
                fieldPath={field.path}
                value={field.value}
                isAdmin={isAdmin}
                onSave={onUpdateField}
                onDelete={onDeleteField}
              />
            ))
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}