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
import FrotaCharts, { type ChartPoint } from '../components/FrotaCharts';
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
    km?: number;
    quantidade?: number;
    fornecedor?: string;
    descricao?: string;
    data?: unknown;
};

type Combustivel = {
    data?: unknown;
    qa?: number;
    arla?: number;
};

type LinhaEvento = {
    id: string;
    tipo: 'ABASTECIMENTO' | 'MANUTENCAO';
    data?: Date | null;
    qntAbastecida?: number | null;
    arla?: number | null;
    obra?: string | null;
    categoria?: string | null;
    valor?: number | null;
    quantidade?: number | null;
    fornecedor?: string | null;
    descricao?: string | null;
};

const DEFAULT_FORM: VeiculoForm = {
    ativo: false,
    placa: '',
    extra: '',
    quilometragemInicial: '',
    quilometragemUltima: '',
};

const ABASTECIMENTO_EXTERNO = 'ABASTECIMENTO EXTERNO';
const DEBUG = false;
const MANUTENCAO_CUTOFF = new Date('2026-01-01T00:00:00.000Z');

function normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
}

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
    if (typeof raw === 'number') {
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(String(raw).trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asNumber(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function getDisplayTipo(row: LinhaEvento): string {
    if (row.categoria === ABASTECIMENTO_EXTERNO) return ABASTECIMENTO_EXTERNO;
    return row.tipo ?? '—';
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
    const [showManutencoes2026, setShowManutencoes2026] = useState(false);
    const [showManutencoesLegado, setShowManutencoesLegado] = useState(false);
    const showManutencoes = showManutencoes2026 || showManutencoesLegado;

    const [filterText, setFilterText] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');

    const [combustivelRows, setCombustivelRows] = useState<LinhaEvento[]>([]);
    const [combustivelLoading, setCombustivelLoading] = useState(false);
    const [combustivelError, setCombustivelError] = useState<string | null>(null);

    const [manutencoesRows, setManutencoesRows] = useState<LinhaEvento[]>([]);
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

        console.debug('[FrotaVeiculosDetalhes] route id:', id);
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
                console.debug('[FrotaVeiculosDetalhes] loadCombustivel query:', { placa });
                const baseQuery = query(collection(db, '03-combustivel'), where('placa', '==', placa));
                let snapshot;

                try {
                    snapshot = await getDocs(query(baseQuery, orderBy('data', 'desc')));
                } catch (err) {
                    console.warn('Falha ao ordenar por data, carregando sem orderBy.', err);
                    snapshot = await getDocs(baseQuery);
                }

                if (!active) return;

                const data: LinhaEvento[] = snapshot.docs.map(
                    (docSnap): LinhaEvento => {
                        const registro = docSnap.data() as Combustivel;
                        return {
                            id: `ab_${docSnap.id}`,
                            tipo: 'ABASTECIMENTO',
                            data: toDate(registro.data),
                            qntAbastecida: registro.qa ?? null,
                            arla: registro.arla ?? null,
                            obra: null,
                        };
                    },
                );
                console.debug('[FrotaVeiculosDetalhes] abastecimentos carregados:', data.length);
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

    useEffect(() => {
        let active = true;

        async function loadManutencoes(vehicleId: string) {
            setManutencoesLoading(true);
            setManutencoesError(null);

            try {
                console.debug('[FrotaVeiculosDetalhes] loadManutencoes query:', { identificador: vehicleId });
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

                const data: LinhaEvento[] = snapshot.docs.map(
                    (docSnap): LinhaEvento => {
                        const manutencao = docSnap.data() as Omit<Manutencao, 'id'>;
                        return {
                            id: `man_${docSnap.id}`,
                            tipo: 'MANUTENCAO',
                            data: toDate(manutencao.data),
                            categoria: manutencao.categoria ?? null,
                            valor: manutencao.valor ?? null,
                            quantidade: manutencao.quantidade ?? null,
                            fornecedor: manutencao.fornecedor ?? null,
                            descricao: manutencao.descricao ?? null,
                        };
                    },
                );
                console.debug('[FrotaVeiculosDetalhes] manutencoes carregadas:', data.length);
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

    const { rowsManutencoes2026, rowsManutencoesLegado } = useMemo(() => {
        const atual: LinhaEvento[] = [];
        const legado: LinhaEvento[] = [];

        manutencoesRows.forEach((row) => {
            const data = row.data;
            if (data && data >= MANUTENCAO_CUTOFF) {
                atual.push(row);
                return;
            }
            // Datas inválidas ficam no legado para não ocultar registros silenciosamente.
            legado.push(row);
        });

        return { rowsManutencoes2026: atual, rowsManutencoesLegado: legado };
    }, [manutencoesRows]);

    const rowsByType = useMemo(() => {
        const merged: LinhaEvento[] = [];
        if (showAbastecimento) merged.push(...combustivelRows);
        if (showManutencoes2026) merged.push(...rowsManutencoes2026);
        if (showManutencoesLegado) merged.push(...rowsManutencoesLegado);
        return merged.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
     }, [
        combustivelRows,
        rowsManutencoes2026,
        rowsManutencoesLegado,
        showAbastecimento,
        showManutencoes2026,
        showManutencoesLegado,
    ]);

    const filteredRows = useMemo(() => {
        let nextRows = rowsByType;

        if (DEBUG) {
            console.debug('[FrotaVeiculosDetalhes] rows:', rowsByType.length);
        }

        const normalizedSearch = normalizeText(filterText);
        if (normalizedSearch) {
            nextRows = nextRows.filter((row) => {
                const fields = [
                    row.tipo,
                    row.obra,
                    row.categoria,
                    row.fornecedor,
                    row.descricao,
                ];
                return fields.some((field) => normalizeText(field).includes(normalizedSearch));
            });

            if (DEBUG) {
                console.debug('[FrotaVeiculosDetalhes] afterText:', nextRows.length);
            }
        }

        const startDate = toDate(filterStartDate);
        const endDate = toDate(filterEndDate);
        if (endDate) {
            endDate.setHours(23, 59, 59, 999);
        }

        if (startDate || endDate) {
            nextRows = nextRows.filter((row) => {
                const rowDate = row.data;
                if (!rowDate) return false;
                if (startDate && rowDate < startDate) return false;
                if (endDate && rowDate > endDate) return false;
                return true;
            });

            if (DEBUG) {
                console.debug('[FrotaVeiculosDetalhes] afterDate:', nextRows.length);
            }
        }

        return nextRows;
    }, [filterEndDate, filterStartDate, filterText, rowsByType]);

    const gridLoading =
        (showAbastecimento && combustivelLoading) || (showManutencoes && manutencoesLoading);

const filtersActive =
        normalizeText(filterText) !== '' || filterStartDate.trim() !== '' || filterEndDate.trim() !== '';

    const emptyMessage = useMemo(() => {
        if (!showAbastecimento && !showManutencoes2026 && !showManutencoesLegado) {
            return 'Nenhum tipo selecionado.';
        }
        if (filtersActive) {
            return 'Nenhum resultado para os filtros aplicados.';
        }
        if (showAbastecimento && showManutencoes) {
            return 'Sem abastecimentos e manutenções para este veículo.';
        }
        if (showAbastecimento) {
            return 'Sem abastecimentos para este veículo.';
        }
        return 'Sem manutenções para este veículo.';
    }, [filtersActive, showAbastecimento, showManutencoes, showManutencoes2026, showManutencoesLegado]);

    const eventoColumns: GridColDef<LinhaEvento>[] = useMemo(
        () => [
            {
                field: 'tipo',
                headerName: 'Tipo',
                minWidth: 140,
                flex: 0.9,
                renderCell: (params) => getDisplayTipo(params.row),
            },
            {
                field: 'data',
                headerName: 'Data',
                minWidth: 140,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.data;
                    return value ? dateFormatter.format(value) : '—';
                },
            },
            {
                field: 'qntAbastecida',
                headerName: 'Qnt. Abastecida',
                minWidth: 140,
                flex: 1,
                renderCell: (params) => {
                    const value = params.row.qntAbastecida;
                    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
                    return numberFormatter.format(Number(value) / 10);
                },
            },
            {
                field: 'arla',
                headerName: 'Arla',
                minWidth: 100,
                flex: 0.8,
                renderCell: (params) => {
                    const value = params.row.arla;
                    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
                    return numberFormatter.format(Number(value) / 10);
                },
            },
            {
                field: 'obra',
                headerName: 'Obra',
                minWidth: 140,
                flex: 1,
                renderCell: (params) => params.row.obra ?? '—',
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
        [currencyFormatter, dateFormatter, numberFormatter],
    );

    const despesasPorNatureza = useMemo<ChartPoint[]>(() => {
        const acc = new Map<string, number>();

        filteredRows.forEach((row) => {
            const rawNatureza = row.categoria ?? row.tipo;
            const natureza = typeof rawNatureza === 'string' ? rawNatureza.trim() : '';
            const label = natureza || 'Sem natureza';

            const valor = asNumber(row.valor) ?? 0;
            acc.set(label, (acc.get(label) ?? 0) + valor);
        });

        return Array.from(acc.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [filteredRows]);

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
                        label={`Abastecimento (${combustivelRows.length})`}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={showManutencoes2026}
                                onChange={(event) => setShowManutencoes2026(event.target.checked)}
                            />
                        }
                        label={`Manutenções - 2026 (${rowsManutencoes2026.length})`}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={showManutencoesLegado}
                                onChange={(event) => setShowManutencoesLegado(event.target.checked)}
                            />
                        }
                        label={`Manutenções - Legado (${rowsManutencoesLegado.length})`}
                    />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
                    <TextField
                        label="Buscar"
                        value={filterText}
                        onChange={(event) => setFilterText(event.target.value)}
                        fullWidth
                    />
                    <TextField
                        label="Data inicial"
                        type="date"
                        value={filterStartDate}
                        onChange={(event) => setFilterStartDate(event.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="Data final"
                        type="date"
                        value={filterEndDate}
                        onChange={(event) => setFilterEndDate(event.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                </Stack>
            </Box>

             <Box mt={3}>
                <Typography variant="h6" gutterBottom>
                    Eventos do veículo
                </Typography>

                    {showAbastecimento && combustivelError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {combustivelError}
                    </Alert>
                )}

                {showManutencoes && manutencoesError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {manutencoesError}
                    </Alert>
                )}

                <Box sx={{ width: '100%', height: 520 }}>
                    <DataGrid
                        rows={filteredRows}
                        columns={eventoColumns}
                        loading={gridLoading}
                        getRowId={(row) => row.id}
                        disableRowSelectionOnClick
                        density="compact"
                        getRowHeight={() => 'auto'}
                    />
                </Box>
             {!gridLoading && filteredRows.length === 0 && !combustivelError && !manutencoesError && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {emptyMessage}
                    </Alert>
                )}
            </Box>

            <Box mt={3}>
                <Typography variant="h6" gutterBottom>
                    Despesas por natureza
                </Typography>

                {despesasPorNatureza.length === 0 ? (
                    <Typography variant="body2">Sem dados para exibir.</Typography>
                ) : (
                    <FrotaCharts
                        data={despesasPorNatureza}
                        title="Despesas por natureza"
                        xAxisTitle="Natureza"
                        yAxisTitle="Total"
                        xAxisTickAngle={-30}
                        valueFormatter={(value) => currencyFormatter.format(value)}
                    />
                )}
            </Box>

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