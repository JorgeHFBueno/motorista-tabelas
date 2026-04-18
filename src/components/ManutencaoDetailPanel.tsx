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
    selectedTipo: 'abastecimento' | 'manutencao2026' | 'manutencaoLegado' | null;
    loading: boolean;
    isAdmin: boolean;
    error: string | null;
    onReload: () => void;
    onAdd?: () => void;
    onDeleteDoc: () => Promise<void>;
    onUpdateField: (fieldPath: string, value: unknown) => Promise<void>;
    onDeleteField: (fieldPath: string) => Promise<void>;
}

interface FlattenedField {
    path: string;
    value: unknown;
}

interface DisplayField extends FlattenedField {
    label: string;
    order: number;
}

const isPlainObject = (value: unknown) => {
    if (value === null || typeof value !== 'object') return false;
    if (value instanceof Timestamp) return false;
    if (value instanceof Date) return false;
    if (Array.isArray(value)) return false;
    return true;
};

const hasUsefulValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isPlainObject(value)) return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
};

const flattenFields = (data: Record<string, unknown>, prefix = ''): FlattenedField[] => {
    const fields: FlattenedField[] = [];
    Object.entries(data).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject(value)) {
            fields.push(...flattenFields(value as Record<string, unknown>, path));
            return;
        }
        fields.push({ path, value });
    });
    return fields;
};

const maintenanceFieldOrder = [
    'data',
    'categoriaNomeSnapshot',
    'categoria',
    'km',
    'valor',
    'quantidade',
    'fornecedorNomeSnapshot',
    'fornecedor',
    'motorista',
    'descricao',
    'nota',
    'status',
    'identificador',
];

const maintenanceFieldLabels: Record<string, string> = {
    data: 'Data',
    categoriaNomeSnapshot: 'Categoria',
    categoria: 'Categoria',
    km: 'KM',
    valor: 'Valor',
    quantidade: 'Quantidade',
    fornecedorNomeSnapshot: 'Fornecedor',
    fornecedor: 'Fornecedor',
    motorista: 'Motorista',
    descricao: 'Descrição',
    nota: 'Nota',
    status: 'Status',
    identificador: 'Veículo',
};

const maintenanceHiddenFields = new Set([
    'categoriaBackfillEm',
    'categoriaId',
    'categoriaLegado',
    'fornecedorId',
    'tipoVeiculo',
]);

const humanizeFieldLabel = (path: string) => {
    const root = path.split('.').pop() ?? path;
    return root
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getMaintenanceDisplayFields = (data: Record<string, unknown>): DisplayField[] => {
    const flattened = flattenFields(data);
    const directValues = new Map(flattened.map((field) => [field.path, field.value]));

    return flattened
        .filter((field) => {
            const root = field.path.split('.')[0];
            if (maintenanceHiddenFields.has(root)) return false;
            if (!hasUsefulValue(field.value)) return false;
            if (root === 'categoria' && hasUsefulValue(directValues.get('categoriaNomeSnapshot'))) return false;
            if (root === 'fornecedor' && hasUsefulValue(directValues.get('fornecedorNomeSnapshot'))) return false;
            return true;
        })
        .map((field) => {
            const root = field.path.split('.')[0];
            const label = maintenanceFieldLabels[root] ?? humanizeFieldLabel(field.path);
            const order = maintenanceFieldOrder.indexOf(root);
            return {
                ...field,
                label,
                order: order === -1 ? maintenanceFieldOrder.length + 100 : order,
            };
        })
        .sort((a, b) => (a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order));
};

const getDefaultDisplayFields = (data: Record<string, unknown>): DisplayField[] =>
    flattenFields(data)
        .filter((field) => hasUsefulValue(field.value))
        .map((field) => ({
            ...field,
            label: humanizeFieldLabel(field.path),
            order: 0,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

export default function ManutencaoDetailPanel({
    selectedDocId,
    selectedDocData,
    selectedTipo,
    loading,
    isAdmin,
    error,
    onReload,
    onAdd,
    onDeleteDoc,
    onUpdateField,
    onDeleteField,
}: ManutencaoDetailPanelProps) {
    if (!selectedDocId) {
        return (
            <Paper sx={{ p: 3, minHeight: 240 }}>
                <Typography variant="body1" color="text.secondary">
                    Selecione um item.
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

    const isMaintenance = selectedTipo === 'manutencao2026' || selectedTipo === 'manutencaoLegado';
    const fields = isMaintenance
        ? getMaintenanceDisplayFields(selectedDocData)
        : getDefaultDisplayFields(selectedDocData);

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
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {onAdd && (
                            <Button variant="contained" onClick={onAdd}>
                                Adicionar
                            </Button>
                        )}
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
                                label={field.label}
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
