import {
  Box,
  Button,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Timestamp } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export type EditableFieldValue = unknown;

type FieldType = 'string' | 'number' | 'boolean' | 'timestamp' | 'json';

interface EditableFieldRowProps {
  fieldPath: string;
  value: EditableFieldValue;
  isAdmin: boolean;
  onSave: (fieldPath: string, value: unknown) => Promise<void>;
  onDelete: (fieldPath: string) => Promise<void>;
}

const getFieldType = (value: EditableFieldValue): FieldType => {
  if (value instanceof Timestamp) return 'timestamp';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string' || value === null || value === undefined) return 'string';
  return 'json';
};

const formatValue = (value: EditableFieldValue) => {
  if (value === null || value === undefined) return '—';
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString('pt-BR');
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const toDateTimeLocalValue = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export default function EditableFieldRow({
  fieldPath,
  value,
  isAdmin,
  onSave,
  onDelete,
}: EditableFieldRowProps) {
  const fieldType = useMemo(() => getFieldType(value), [value]);
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<string | boolean>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    if (fieldType === 'boolean') {
      setDraftValue(Boolean(value));
      return;
    }
    if (fieldType === 'timestamp') {
      const date = value instanceof Timestamp ? value.toDate() : new Date();
      setDraftValue(toDateTimeLocalValue(date));
      return;
    }
    if (fieldType === 'number') {
      setDraftValue(value === null || value === undefined ? '' : String(value));
      return;
    }
    if (fieldType === 'json') {
      setDraftValue(value ? JSON.stringify(value, null, 2) : '');
      return;
    }
    setDraftValue(value === null || value === undefined ? '' : String(value));
  }, [editing, fieldType, value]);

  const handleSave = async () => {
    setError(null);
    let nextValue: unknown = draftValue;

    if (fieldType === 'number') {
      const parsed = Number(draftValue);
      if (Number.isNaN(parsed)) {
        setError('Informe um número válido.');
        return;
      }
      nextValue = parsed;
    }

    if (fieldType === 'timestamp') {
      const date = new Date(String(draftValue));
      if (Number.isNaN(date.getTime())) {
        setError('Informe uma data válida.');
        return;
      }
      nextValue = Timestamp.fromDate(date);
    }

    if (fieldType === 'boolean') {
      nextValue = Boolean(draftValue);
    }

    if (fieldType === 'json') {
      if (!draftValue) {
        nextValue = {};
      } else {
        try {
          nextValue = JSON.parse(String(draftValue));
        } catch (err) {
          setError('JSON inválido.');
          return;
        }
      }
    }

    setSaving(true);
    try {
      await onSave(fieldPath, nextValue);
      setEditing(false);
    } catch (err) {
      setError('Não foi possível salvar o campo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(fieldPath);
    } catch (err) {
      setError('Não foi possível remover o campo.');
    } finally {
      setSaving(false);
    }
  };

  const renderEditor = () => {
    if (fieldType === 'boolean') {
      return (
        <Stack>
          <Switch
            checked={Boolean(draftValue)}
            onChange={(event) => setDraftValue(event.target.checked)}
          />
          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}
        </Stack>
      );
    }

    return (
      <TextField
        fullWidth
        size="small"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        type={fieldType === 'number' ? 'number' : fieldType === 'timestamp' ? 'datetime-local' : 'text'}
        multiline={fieldType === 'json'}
        minRows={fieldType === 'json' ? 2 : undefined}
        error={Boolean(error)}
        helperText={error ?? ' '}
      />
    );
  };

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      alignItems={{ xs: 'flex-start', md: 'center' }}
      sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Box sx={{ minWidth: { xs: '100%', md: 220 } }}>
        <Typography variant="subtitle2" color="text.secondary">
          {fieldPath}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, width: '100%' }}>
        {editing ? (
          renderEditor()
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {formatValue(value)}
          </Typography>
        )}
      </Box>
      {isAdmin && (
        <Stack direction="row" spacing={1} alignItems="center">
          {editing ? (
            <>
              <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
                Salvar
              </Button>
              <Button size="small" variant="text" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Tooltip title="Editar">
                <span>
                  <IconButton size="small" onClick={() => setEditing(true)} disabled={saving}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Excluir campo">
                <span>
                  <IconButton size="small" color="error" onClick={handleDelete} disabled={saving}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}