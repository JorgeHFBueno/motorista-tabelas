import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    type AlertColor,
    Box,
    Container,
    LinearProgress,
    Paper,
    Snackbar,
    Stack,
    Typography,
} from '@mui/material';
import {
    DataGrid,
    GridActionsCellItem,
    type GridColDef,
    type GridEventListener,
    GridRowEditStopReasons,
    type GridRowId,
    GridRowModes,
    type GridRowModesModel,
} from '@mui/x-data-grid';
import type { Timestamp } from 'firebase/firestore';
import type { Bomba } from '../types/Bomba';
import { listBombas, updateBombaAndMaybeLog } from '../services/bombasService';
import { useAuth } from '../contexts/AuthContext';

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
    const [rowModesModel, setRowModesModel] = useState<GridRowModesModel>({});
    const [snackbar, setSnackbar] = useState<{ message: string; severity: AlertColor } | null>(
        null,
    );
    const { currentUser } = useAuth();

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

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);
        listBombas()
            .then((data) => {
                if (active) {
                    setBombas(
                        data.map((bomba) => ({
                            ...bomba,
                            ultimoAbastecimento: toDateAny(bomba.ultimoAbastecimento),
                        })),
                    );
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

    const handleRowEditStop: GridEventListener<'rowEditStop'> = (params, event) => {
        if (params.reason === GridRowEditStopReasons.rowFocusOut) {
            event.defaultMuiPrevented = true;
        }
    };

    const handleEditClick = (id: GridRowId) => () => {
        setRowModesModel((prev) => ({ ...prev, [id]: { mode: GridRowModes.Edit } }));
    };

    const handleSaveClick = (id: GridRowId) => () => {
        setRowModesModel((prev) => ({ ...prev, [id]: { mode: GridRowModes.View } }));
    };

    const handleCancelClick = (id: GridRowId) => () => {
        setRowModesModel((prev) => ({
            ...prev,
            [id]: { mode: GridRowModes.View, ignoreModifications: true },
        }));
    };

    const handleCloseSnackbar = () => setSnackbar(null);

    const parseNumberField = (value: unknown, label: string) => {
        if (typeof value === 'undefined' || value === '' || value === null) {
            return undefined;
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(parsed)) {
            throw new Error(`Valor inválido para ${label}.`);
        }
        return parsed;
    };

    const parseDateField = (value: unknown, label: string) => {
        if (typeof value === 'undefined' || value === '' || value === null) {
            return undefined;
        }
        if (value instanceof Date) {
            return value;
        }
        const parsed = new Date(value as string);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error(`Data inválida para ${label}.`);
        }
        return parsed;
    };

    const processRowUpdate = async (newRow: Bomba) => {
        const updatePayload: Partial<Omit<Bomba, 'id'>> = {};
        if (typeof newRow.nomeBomba !== 'undefined') {
            updatePayload.nomeBomba = newRow.nomeBomba ?? '';
        }
        if (typeof newRow.ativo !== 'undefined') {
            updatePayload.ativo = newRow.ativo;
        }

        const capacidadeLitros = parseNumberField(newRow.capacidadeLitros, 'Capacidade (L)');
        if (typeof capacidadeLitros !== 'undefined') {
            updatePayload.capacidadeLitros = capacidadeLitros;
        }

        const estoqueAtual = parseNumberField(newRow.estoqueAtual, 'Estoque atual');
        if (typeof estoqueAtual !== 'undefined') {
            updatePayload.estoqueAtual = estoqueAtual;
        }

        const montanteAtual = parseNumberField(newRow.montanteAtual, 'Montante atual');
        if (typeof montanteAtual !== 'undefined') {
            updatePayload.montanteAtual = montanteAtual;
        }

        const folgaLitros = parseNumberField(newRow.folgaLitros, 'Folga (L)');
        if (typeof folgaLitros !== 'undefined') {
            updatePayload.folgaLitros = folgaLitros;
        }

        const ultimoAbastecimento = parseDateField(
            newRow.ultimoAbastecimento,
            'Último abastecimento',
        );
        if (typeof ultimoAbastecimento !== 'undefined') {
            updatePayload.ultimoAbastecimento = ultimoAbastecimento;
        }

        if (typeof newRow.ultimoFrentista !== 'undefined') {
            updatePayload.ultimoFrentista = newRow.ultimoFrentista ?? '';
        }

        const motorista =
            currentUser?.displayName || currentUser?.email || 'SYSTEM';

        const updated = await updateBombaAndMaybeLog(newRow.id, updatePayload, motorista);
        setBombas((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setSnackbar({ message: 'Bomba atualizada com sucesso.', severity: 'success' });
        return updated;
    };

    const handleProcessRowUpdateError = (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Erro ao salvar alterações.';
        setSnackbar({ message, severity: 'error' });
    };

    const columns: GridColDef<Bomba>[] = useMemo(
        () => [
            {
                field: 'nomeBomba',
                headerName: 'Bomba',
                minWidth: 160,
                flex: 1.2,
                editable: true,
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
                editable: true,
                type: 'boolean',
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
                editable: true,
                type: 'number',
                renderCell: ({ value }) =>
                    Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
            },
            {
                field: 'estoqueAtual',
                headerName: 'Estoque atual',
                minWidth: 140,
                flex: 1,
                editable: true,
                type: 'number',
                renderCell: ({ value }) =>
                    Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
            },
            {
                field: 'montanteAtual',
                headerName: 'Montante atual',
                minWidth: 140,
                flex: 1,
                editable: true,
                type: 'number',
                renderCell: ({ value }) =>
                    Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
            },
            {
                field: 'folgaLitros',
                headerName: 'Folga (L)',
                minWidth: 120,
                flex: 1,
                editable: true,
                type: 'number',
                renderCell: ({ value }) =>
                    Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—',
            },
            {
                field: 'ultimoAbastecimento',
                headerName: 'Último abastecimento',
                minWidth: 180,
                flex: 1.2,
                editable: true,
                type: 'dateTime',
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
                editable: true,
                renderCell: ({ value }) => value || '—',
            },
            {
                field: 'actions',
                type: 'actions',
                headerName: 'Ações',
                width: 120,
                getActions: ({ id }) => {
                    const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;
                    if (isInEditMode) {
                        return [
                            <GridActionsCellItem
                                key="save"
                                icon={<span>Salvar</span>}
                                label="Salvar"
                                onClick={handleSaveClick(id)}
                                showInMenu
                            />,
                            <GridActionsCellItem
                                key="cancel"
                                icon={<span>Cancelar</span>}
                                label="Cancelar"
                                onClick={handleCancelClick(id)}
                                showInMenu
                            />,
                        ];
                    }
                    return [
                        <GridActionsCellItem
                            key="edit"
                            icon={<span>Editar</span>}
                            label="Editar"
                            onClick={handleEditClick(id)}
                            showInMenu
                        />,
                    ];
                },
            },
        ],
        [dateFormatter, handleCancelClick, handleEditClick, handleSaveClick, numberFormatter, rowModesModel],
    );

    return (
        <Container maxWidth="xl" sx={{ py: 3 }}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Bombas v2
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
                        editMode="row"
                        rowModesModel={rowModesModel}
                        onRowModesModelChange={setRowModesModel}
                        onRowEditStop={handleRowEditStop}
                        processRowUpdate={processRowUpdate}
                        onProcessRowUpdateError={handleProcessRowUpdateError}
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
            <Snackbar
                open={!!snackbar}
                autoHideDuration={4000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {snackbar ? (
                    <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                        {snackbar.message}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Container>
    );
}