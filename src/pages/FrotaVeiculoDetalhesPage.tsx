import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Container,
    Divider,
    FormControlLabel,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import type { Registro } from '../types';
import { db } from '../firebase';

type Veiculo = {
    id: string;
    ativo?: boolean;
    categoria?: string;
    placa?: string;
    extra?: string;
    quilometragemInicial?: number;
    quilometragemUltima?: number;
    dataUltimaAtualizacao?: unknown;
};

type VeiculoForm = {
    ativo: boolean;
    placa: string;
    extra: string;
    quilometragemInicial: string;
    quilometragemUltima: string;
};

type Manutencao = {
    id: string;
    identificador?: string;
    tipoVeiculo?: 'PLACA' | 'EXTRA';
    categoria?: string;
    valor?: number;
    quantidade?: number;
    fornecedor?: string;
    descricao?: string;
    data?: unknown;
};

const DEFAULT_FORM: VeiculoForm = {
    ativo: false,
    placa: '',
    extra: '',
    quilometragemInicial: '',
    quilometragemUltima: '',
};

function toDate(raw: unknown): Date | null {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
        return (raw as { toDate: () => Date }).toDate();
    }
    if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
        const seconds = (raw as { seconds?: number }).seconds ?? 0;
        const nanoseconds = (raw as { nanoseconds?: number }).nanoseconds ?? 0;
        return new Date(seconds * 1000 + nanoseconds / 1e6);
    }
    const parsed = new Date(raw as string);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateAny(raw: any): Date | null {
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw.seconds != null) return new Date(raw.seconds * 1e3 + (raw.nanoseconds ?? 0) / 1e6);
    if (raw._seconds != null) return new Date(raw._seconds * 1e3 + (raw._nanoseconds ?? 0) / 1e6);
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

export default function FrotaVeiculoDetalhesPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState<VeiculoForm>(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);

    const [showAbastecimento, setShowAbastecimento] = useState(true);
    const [showManutencoes, setShowManutencoes] = useState(false);

    const [combustivelRows, setCombustivelRows] = useState<Registro[]>([]);
    const [combustivelLoading, setCombustivelLoading] = useState(false);
    const [combustivelError, setCombustivelError] = useState<string | null>(null);

    const [manutencoesRows, setManutencoesRows] = useState<Manutencao[]>([]);
    const [manutencoesLoading, setManutencoesLoading] = useState(false);
    const [manutencoesError, setManutencoesError] = useState<string | null>(null);

    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        severity: 'success' | 'error';
        message: string;
    }>({
        open: false,
        severity: 'success',
        message: '',
    });

    const dateFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
            }),
        [],
    );
    const numberFormatter = useMemo(
        () =>
            new Intl.NumberFormat('pt-BR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            }),
        [],
    );
    const currencyFormatter = useMemo(
        () =>
            new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
            }),
        [],
    );

    useEffect(() => {
        let active = true;

        async function loadVeiculo() {
            if (!id) {
                setError('Veículo não encontrado.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const snap = await getDoc(doc(db, 'veiculos', id));
                if (!active) return;

                if (!snap.exists()) {
                    setError('Veículo não encontrado.');
                    setVeiculo(null);
                    return;
                }

                const data = { id: snap.id, ...(snap.data() as Omit<Veiculo, 'id'>) };
                setVeiculo(data);
                setForm({
                    ativo: Boolean(data.ativo),
                    placa: data.placa ?? '',
                    extra: data.extra ?? '',
                    quilometragemInicial:
                        data.quilometragemInicial !== undefined ? String(data.quilometragemInicial) : '',
                    quilometragemUltima:
                        data.quilometragemUltima !== undefined ? String(data.quilometragemUltima) : '',
                });
            } catch (err) {
                console.error('Erro ao carregar veículo', err);
                if (active) setError('Erro ao carregar veículo.');
            } finally {
                if (active) setLoading(false);
            }
        }

        loadVeiculo();
        return () => {
            active = false;
        };
    }, [id]);

    const tipoVeiculo = useMemo<'PLACA' | 'EXTRA'>(() => {
        if (veiculo?.categoria === 'EXTRA') return 'EXTRA';
        if (veiculo?.categoria === 'PLACA') return 'PLACA';
        if (veiculo?.extra && !veiculo?.placa) return 'EXTRA';
        return 'PLACA';
    }, [veiculo?.categoria, veiculo?.extra, veiculo?.placa]);

    const tituloVeiculo = tipoVeiculo === 'EXTRA' ? veiculo?.extra ?? 'Extra' : veiculo?.placa ?? 'Placa';

    async function handleSave() {
        if (!veiculo) return;

        const placa = form.placa.trim();
        const extra = form.extra.trim();

        if (tipoVeiculo === 'PLACA' && !placa) {
            setSnackbar({ open: true, severity: 'error', message: 'Informe a placa.' });
            return;
        }
        if (tipoVeiculo === 'EXTRA' && !extra) {
            setSnackbar({ open: true, severity: 'error', message: 'Informe o código extra.' });
            return;
        }

        if (!form.quilometragemInicial.trim() || !form.quilometragemUltima.trim()) {
            setSnackbar({
                open: true,
                severity: 'error',
                message: 'Informe as quilometragens inicial e última.',
            });
            return;
        }

        const kmInicial = Number(form.quilometragemInicial);
        const kmUltima = Number(form.quilometragemUltima);

        if (!Number.isInteger(kmInicial) || !Number.isInteger(kmUltima)) {
            setSnackbar({
                open: true,
                severity: 'error',
                message: 'Quilometragens devem ser números inteiros.',
            });
            return;
        }

        setSaving(true);
        try {
            const updateData: Partial<Veiculo> = {
                ativo: form.ativo,
                quilometragemInicial: kmInicial,
                quilometragemUltima: kmUltima,
            };

            if (tipoVeiculo === 'PLACA') {
                updateData.placa = placa;
            } else {
                updateData.extra = extra;
            }

            await updateDoc(doc(db, 'veiculos', veiculo.id), {
                ...updateData,
                dataUltimaAtualizacao: serverTimestamp(),
            });

            setVeiculo((prev) =>
                prev
                    ? {
                        ...prev,
                        ...updateData,
                        dataUltimaAtualizacao: new Date(),
                    }
                    : prev,
            );
            setSnackbar({ open: true, severity: 'success', message: 'Veículo atualizado com sucesso.' });
        } catch (err) {
            console.error('Erro ao atualizar veículo', err);
            setSnackbar({ open: true, severity: 'error', message: 'Erro ao atualizar veículo.' });
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        let active = true;

        async function loadCombustivel(placa: string) {
            setCombustivelLoading(true);
            setCombustivelError(null);

            try {
                const baseQuery = query(collection(db, '03-combustivel'), where('placa', '==', placa));
                let snapshot;

                try {
                    snapshot = await getDocs(query(baseQuery, orderBy('data', 'desc')));
                } catch (err) {
                    console.warn('Falha ao ordenar por data, carregando sem orderBy.', err);
                    snapshot = await getDocs(baseQuery);
                }

                if (!active) return;

                const data = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<Registro, 'id'>),
                }));
                setCombustivelRows(data);
            } catch (err) {
                console.error('Erro ao carregar abastecimentos', err);
                if (active) {
                    setCombustivelError('Erro ao carregar abastecimentos.');
                }
            } finally {
                if (active) setCombustivelLoading(false);
            }
        }

        if (!showAbastecimento) return;
        if (!veiculo?.placa) {
            setCombustivelRows([]);
            return;
        }

        loadCombustivel(veiculo.placa);
        return () => {
            active = false;
        };
    }, [showAbastecimento, veiculo?.placa]);

    const combustivelColumns: GridColDef[] = useMemo(
        () => [
            {
                field: 'qa',
                headerName: 'Qnt. Abastecida',
                minWidth: 120,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.qa;
                    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
                    return numberFormatter.format(Number(value) / 10);
                },
            },
            {
                field: 'arla',
                headerName: 'Arla',
                minWidth: 80,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.arla;
                    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
                    return numberFormatter.format(Number(value) / 10);
                },
            },
            {
                field: 'obra',
                headerName: 'Obra',
                minWidth: 120,
                flex: 1,
                renderCell: () => '—',
            },
        ],
        [numberFormatter],
    );

    useEffect(() => {
        let active = true;

        async function loadManutencoes(vehicleId: string) {
            setManutencoesLoading(true);
            setManutencoesError(null);

            try {
                const baseQuery = query(collection(db, 'manutencoes'), where('identificador', '==', vehicleId));
                let snapshot;

                try {
                    snapshot = await getDocs(query(baseQuery, orderBy('data', 'desc')));
                } catch (err) {
                    console.warn(
                        'Falha ao ordenar manutenções por data, carregando sem orderBy. Índice sugerido: identificador ASC, data DESC.',
                        err,
                    );
                    snapshot = await getDocs(baseQuery);
                }

                if (!active) return;

                const data = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<Manutencao, 'id'>),
                }));
                setManutencoesRows(data);
            } catch (err) {
                console.error('Erro ao carregar manutenções', err);
                if (active) {
                    setManutencoesError('Erro ao carregar manutenções.');
                }
            } finally {
                if (active) setManutencoesLoading(false);
            }
        }

        if (!showManutencoes) return;
        if (!id) {
            setManutencoesRows([]);
            return;
        }

        loadManutencoes(id);
        return () => {
            active = false;
        };
    }, [id, showManutencoes]);

    const manutencoesRowsFormatted = useMemo(
        () =>
            manutencoesRows.map((row) => ({
                ...row,
                dataJS: toDateAny(row.data),
            })),
        [manutencoesRows],
    );

    const manutencoesColumns: GridColDef[] = useMemo(
        () => [
            {
                field: 'dataJS',
                headerName: 'Data',
                minWidth: 140,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.dataJS as Date | null;
                    return value ? dateFormatter.format(value) : '—';
                },
            },
            {
                field: 'categoria',
                headerName: 'Categoria',
                minWidth: 160,
                flex: 1.2,
                renderCell: (params) => params.row.categoria ?? '—',
            },
            {
                field: 'valor',
                headerName: 'Valor',
                minWidth: 120,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.valor;
                    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
                    return currencyFormatter.format(Number(value));
                },
            },
            {
                field: 'quantidade',
                headerName: 'Quantidade',
                minWidth: 120,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.quantidade;
                    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
                    return String(value);
                },
            },
            {
                field: 'fornecedor',
                headerName: 'Fornecedor',
                minWidth: 160,
                flex: 1.2,
                renderCell: (params) => params.row.fornecedor ?? '—',
            },
            {
                field: 'descricao',
                headerName: 'Descrição',
                minWidth: 200,
                flex: 1.6,
                renderCell: (params) => {
                    const value = params.row.descricao ?? '—';
                    return (
                        <Box
                            sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                width: '100%',
                            }}
                        >
                            {value}
                        </Box>
                    );
                },
            },
        ],
        [currencyFormatter, dateFormatter],
    );

    if (loading) {
        return (
            <Container sx={{ py: 4 }}>
                <Box display="flex" alignItems="center" justifyContent="center" py={6}>
                    <CircularProgress />
                </Box>
            </Container>
        );
    }

    if (error) {
        return (
            <Container sx={{ py: 4 }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
                <Button variant="outlined" onClick={() => navigate('/frota')}>
                    Voltar para frota
                </Button>
            </Container>
        );
    }

    return (
        <Container sx={{ py: 4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography variant="h4">Detalhes do Veículo</Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                        {tituloVeiculo}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" onClick={() => navigate('/frota')}>
                        Voltar para Frota
                    </Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </Stack>
            </Stack>

            <Box mt={3}>
                <Stack spacing={2}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={form.ativo}
                                onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))}
                            />
                        }
                        label="Ativo"
                    />

                    {tipoVeiculo === 'PLACA' ? (
                        <TextField
                            label="Placa"
                            value={form.placa}
                            onChange={(event) => setForm((prev) => ({ ...prev, placa: event.target.value }))}
                            fullWidth
                            required
                        />
                    ) : (
                        <TextField
                            label="Extra"
                            value={form.extra}
                            onChange={(event) => setForm((prev) => ({ ...prev, extra: event.target.value }))}
                            fullWidth
                            required
                        />
                    )}

                    <TextField
                        label="Quilometragem inicial"
                        type="number"
                        value={form.quilometragemInicial}
                        onChange={(event) => setForm((prev) => ({ ...prev, quilometragemInicial: event.target.value }))}
                        fullWidth
                        required
                    />
                    <TextField
                        label="Quilometragem última"
                        type="number"
                        value={form.quilometragemUltima}
                        onChange={(event) => setForm((prev) => ({ ...prev, quilometragemUltima: event.target.value }))}
                        fullWidth
                        required
                    />
                    <TextField
                        label="Última atualização"
                        value={(() => {
                            const d = toDate(veiculo?.dataUltimaAtualizacao);
                            return d ? dateFormatter.format(d) : '—';
                        })()}
                        fullWidth
                        disabled
                    />
                </Stack>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Box>
                <Typography variant="h6" gutterBottom>
                    Filtros
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={showAbastecimento}
                                onChange={(event) => setShowAbastecimento(event.target.checked)}
                            />
                        }
                        label="Abastecimento"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={showManutencoes}
                                onChange={(event) => setShowManutencoes(event.target.checked)}
                            />
                        }
                        label="Manutenções"
                    />
                </Stack>
            </Box>

            {showAbastecimento && (
                <Box mt={3}>
                    <Typography variant="h6" gutterBottom>
                        Abastecimento
                    </Typography>

                    {combustivelError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {combustivelError}
                        </Alert>
                    )}

                    <Box sx={{ width: '100%', height: 520 }}>
                        <DataGrid
                            rows={combustivelRows}
                            columns={combustivelColumns}
                            loading={combustivelLoading}
                            getRowId={(row) => row.id}
                            disableRowSelectionOnClick
                            density="compact"
                            getRowHeight={() => 'auto'}
                        />
                    </Box>

                    {!combustivelLoading && combustivelRows.length === 0 && !combustivelError && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            Sem abastecimentos para esta placa.
                        </Alert>
                    )}
                </Box>
            )}

            {showManutencoes && (
                <Box mt={3}>
                    <Typography variant="h6" gutterBottom>
                        Manutenções
                    </Typography>

                    {manutencoesError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {manutencoesError}
                        </Alert>
                    )}

                    <Box sx={{ width: '100%', height: 520 }}>
                        <DataGrid
                            rows={manutencoesRowsFormatted}
                            columns={manutencoesColumns}
                            loading={manutencoesLoading}
                            getRowId={(row) => row.id}
                            disableRowSelectionOnClick
                            density="compact"
                            getRowHeight={() => 'auto'}
                        />
                    </Box>

                    {!manutencoesLoading && manutencoesRows.length === 0 && !manutencoesError && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            Sem manutenções para este veículo.
                        </Alert>
                    )}
                </Box>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}