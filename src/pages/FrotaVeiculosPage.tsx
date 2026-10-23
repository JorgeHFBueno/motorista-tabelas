import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Container,
    Snackbar,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Timestamp, addDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import type { ChartPoint } from '../components/FrotaCharts';
import ManutencaoDialog from '../components/ManutencaoDialog';
import {
    buildManutencaoPayload,
    type CategoriaManutencao,
    DEFAULT_MANUTENCAO_FORM,
    type Fornecedor,
    getManutencaoValidationError,
    indexarPorIdentificador,
    manutencaoItemFrotaId,
    type ManutencaoForm,
    type TipoVeiculo,
} from '../components/manutencaoFormShared';
import { db } from '../firebase';
import { normalizeFornecedorNumero } from '../services/fornecedores.service';
import { listFuncionariosAtivos } from '../services/funcionarios-selecao.service';
import { listItensFrota } from '../services/veiculos.service';
import type { ItemFrotaV2, PessoaV2 } from '../utils/cadastrosV2';

// Frota de veiculos-v2, só leitura: o cadastro é do Friday (The Manuscript, 03_APLICACAO_WEB/05_CADASTROS.md).

type ManutencaoRow = {
    id: string;
    item_frota_id?: string;
    identificador?: string;
    categoria?: string;
    categoriaId?: string;
    categoriaNomeSnapshot?: string;
    valor?: unknown;
    data?: unknown;
};

type CategoriaFiltroOption = {
    key: string;
    label: string;
};

const MANUTENCAO_CUTOFF = new Date('2026-01-01T00:00:00.000Z');
const SEM_CATEGORIA_KEY = '__sem_categoria__';
const SEM_CATEGORIA_LABEL = 'Sem categoria';

const FrotaCharts = lazy(() => import('../components/FrotaCharts'));

function normalizeManutencaoDate(raw: unknown): Date | null {
    if (!raw) return null;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
        const date = (raw as { toDate: () => Date }).toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
        const seconds = (raw as { seconds?: number }).seconds ?? 0;
        const nanoseconds = (raw as { nanoseconds?: number }).nanoseconds ?? 0;
        const date = new Date(seconds * 1000 + nanoseconds / 1e6);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof raw === 'number') {
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(String(raw).trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDate(raw: unknown): Date | null {
    return normalizeManutencaoDate(raw);
}

function parseDateInputAsLocalDate(value: string, endOfDay = false): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parts = trimmed.split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;

    const [year, month, day] = parts;
    const date = endOfDay
        ? new Date(year, month - 1, day, 23, 59, 59, 999)
        : new Date(year, month - 1, day, 0, 0, 0, 0);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function asNumber(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function parsePtBrNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function getCategoriaKey(row: ManutencaoRow): string {
    const categoriaId = normalizeText(row.categoriaId);
    if (categoriaId) return `id:${categoriaId}`;

    const categoriaNome = normalizeText(row.categoriaNomeSnapshot) || normalizeText(row.categoria);
    if (categoriaNome) return `nome:${categoriaNome.toLocaleLowerCase('pt-BR')}`;

    return SEM_CATEGORIA_KEY;
}

export default function FrotaVeiculosPage() {
    const navigate = useNavigate();
    const [tipo, setTipo] = useState<TipoVeiculo>('PLACA');
    const [veiculos, setVeiculos] = useState<ItemFrotaV2[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manutencaoOpen, setManutencaoOpen] = useState(false);
    const [manutencaoSaving, setManutencaoSaving] = useState(false);
    const [manutencaoForm, setManutencaoForm] = useState<ManutencaoForm>(DEFAULT_MANUTENCAO_FORM);
    const [selectedCategoriasGrafico, setSelectedCategoriasGrafico] = useState<CategoriaFiltroOption[]>([]);
    const [dataInicialGrafico, setDataInicialGrafico] = useState('');
    const [dataFinalGrafico, setDataFinalGrafico] = useState('');
    const [manutencoes2026Rows, setManutencoes2026Rows] = useState<ManutencaoRow[]>([]);
    const [manutencoes2026Loading, setManutencoes2026Loading] = useState(false);
    const [manutencoes2026Error, setManutencoes2026Error] = useState<string | null>(null);
    const [manutencoes2026Loaded, setManutencoes2026Loaded] = useState(false);
    const [showGastosChart, setShowGastosChart] = useState(false);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [categoriasManutencao, setCategoriasManutencao] = useState<CategoriaManutencao[]>([]);
    const [pessoas, setPessoas] = useState<PessoaV2[]>([]);
    const [fornecedoresLoading, setFornecedoresLoading] = useState(false);
    const [categoriasLoading, setCategoriasLoading] = useState(false);
    const [fornecedoresLoaded, setFornecedoresLoaded] = useState(false);
    const [categoriasLoaded, setCategoriasLoaded] = useState(false);
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
    const dateOnlyFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
            }),
        [],
    );
    const numberFormatter = useMemo(() => new Intl.NumberFormat('pt-BR'), []);
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
        setLoading(true);
        setError(null);
        listItensFrota()
            .then((items) => { if (active) setVeiculos(items); })
            .catch((err) => {
                console.error('Erro ao carregar veículos', err);
                if (active) setError('Não foi possível carregar os veículos. Tente novamente.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!manutencaoOpen || pessoas.length) return;
        listFuncionariosAtivos().then(setPessoas).catch((err) => console.error('Erro ao carregar funcionários', err));
    }, [manutencaoOpen, pessoas.length]);


    useEffect(() => {
        let active = true;

        async function loadManutencoes2026() {
            setManutencoes2026Loading(true);
            setManutencoes2026Error(null);
            try {
                const snapshot = await getDocs(collection(db, 'manutencoes'));
                if (!active) return;
                const data = snapshot.docs.map((docSnap) => {
                    const raw = docSnap.data() as Omit<ManutencaoRow, 'id'>;
                    return {
                        id: docSnap.id,
                        item_frota_id: raw.item_frota_id,
                        identificador: raw.identificador,
                        categoria: raw.categoria,
                        categoriaId: raw.categoriaId,
                        categoriaNomeSnapshot: raw.categoriaNomeSnapshot,
                        valor: raw.valor,
                        data: raw.data,
                    };
                });
                setManutencoes2026Rows(data);
                setManutencoes2026Loaded(true);
            } catch (err) {
                console.error('Erro ao carregar manutenções 2026', err);
                if (active) {
                    setManutencoes2026Error('Erro ao carregar manutenções 2026.');
                }
            } finally {
                if (active) setManutencoes2026Loading(false);
            }
        }

        if (!showGastosChart || manutencoes2026Loaded) return () => {
            active = false;
        };

        loadManutencoes2026();
        return () => {
            active = false;
        };
    }, [manutencoes2026Loaded, showGastosChart]);

    useEffect(() => {
        let active = true;

        async function loadFornecedores() {
            setFornecedoresLoading(true);
            try {
                const fornecedoresQuery = query(collection(db, 'notas-fornecedores'), orderBy('nome'));
                const snapshot = await getDocs(fornecedoresQuery);
                if (!active) return;
                const data = snapshot.docs.map((docSnap) => {
                    const raw = docSnap.data();
                    return {
                        id: docSnap.id,
                        nome: (raw.nome as string) ?? '',
                        numero: normalizeFornecedorNumero(raw.numero),
                    };
                });
                setFornecedores(data);
                setFornecedoresLoaded(true);
            } catch (err) {
                console.error('Erro ao carregar fornecedores', err);
                if (active) setFornecedores([]);
                if (active) setFornecedoresLoaded(true);
            } finally {
                if (active) setFornecedoresLoading(false);
            }
        }

        if (!manutencaoOpen || fornecedoresLoaded) return () => {
            active = false;
        };

        loadFornecedores();
        return () => {
            active = false;
        };
    }, [manutencaoOpen, fornecedoresLoaded]);

    useEffect(() => {
        let active = true;

        async function loadCategorias() {
            setCategoriasLoading(true);
            try {
                const categoriasQuery = query(collection(db, 'notas-categorias'), orderBy('nome'));
                const snapshot = await getDocs(categoriasQuery);
                if (!active) return;
                const data = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    nome: (docSnap.data().nome as string) ?? '',
                }));
                setCategoriasManutencao(data);
                setCategoriasLoaded(true);
            } catch (err) {
                console.error('Erro ao carregar categorias', err);
                if (active) setCategoriasManutencao([]);
                if (active) setCategoriasLoaded(true);
            } finally {
                if (active) setCategoriasLoading(false);
            }
        }

        const shouldLoadCategorias = manutencaoOpen || (showGastosChart && manutencoes2026Loaded);

        if (!shouldLoadCategorias || categoriasLoaded) return () => {
            active = false;
        };

        loadCategorias();
        return () => {
            active = false;
        };
    }, [
        manutencaoOpen,
        categoriasLoaded,
        manutencoes2026Loaded,
        showGastosChart,
    ]);

    const rows = useMemo(() => veiculos.filter((item) => item.categoria === tipo), [tipo, veiculos]);

    const rowsManutencoes2026 = useMemo(() => {
        return manutencoes2026Rows.filter((row) => {
            const data = toDate(row.data);
            return Boolean(data && data >= MANUTENCAO_CUTOFF);
        });
    }, [manutencoes2026Rows]);

    const columns: GridColDef<ItemFrotaV2>[] = useMemo(() => [
        {
            field: 'ativo',
            headerName: 'Ativo',
            minWidth: 90,
            renderCell: ({ value }) => <Checkbox checked={Boolean(value)} disabled />,
        },
        {
            field: 'identificador',
            headerName: tipo === 'PLACA' ? 'Placa' : 'Extra',
            minWidth: 140,
            flex: 1,
            renderCell: (params) => (
                <Button
                    variant="text"
                    size="small"
                    onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/frota/${encodeURIComponent(params.row.id)}`);
                    }}
                    sx={{ textTransform: 'none', px: 0.5, minWidth: 'auto' }}
                >
                    {params.row.identificador}
                </Button>
            ),
        },
        { field: 'nome', headerName: 'Nome', minWidth: 180, flex: 1.2 },
        {
            field: 'quilometragemInicial',
            headerName: tipo === 'PLACA' ? 'KM inicial' : 'Medidor inicial',
            minWidth: 140,
            flex: 1,
            renderCell: ({ value }) => {
                const n = asNumber(value);
                return n !== null ? numberFormatter.format(n) : '—';
            },
        },
        {
            field: 'quilometragemUltima',
            headerName: tipo === 'PLACA' ? 'KM última' : 'Medidor último',
            minWidth: 140,
            flex: 1,
            renderCell: ({ value }) => {
                const n = asNumber(value);
                return n !== null ? numberFormatter.format(n) : '—';
            },
        },
        {
            field: 'dataUltimaAtualizacao',
            headerName: 'Última atualização',
            minWidth: 180,
            flex: 1.2,
            renderCell: ({ value }) => {
                const d = toDate(value);
                return d ? dateFormatter.format(d) : '—';
            },
        },
    ], [dateFormatter, navigate, numberFormatter, tipo]);


    const emptyLabel =
        tipo === 'PLACA' ? 'Nenhum veículo do tipo PLACA encontrado.' : 'Nenhum veículo do tipo EXTRA encontrado.';

    const idPorIdentificador = useMemo(() => indexarPorIdentificador(veiculos), [veiculos]);

    const loadingManutencoes = manutencoes2026Loading;

    const categoriasById = useMemo(() => {
        return new Map(categoriasManutencao.map((item) => [item.id, item.nome]));
    }, [categoriasManutencao]);

    const periodoGrafico = useMemo(() => {
        const hasStart = Boolean(dataInicialGrafico.trim());
        const hasEnd = Boolean(dataFinalGrafico.trim());
        const start = parseDateInputAsLocalDate(dataInicialGrafico);
        const end = parseDateInputAsLocalDate(dataFinalGrafico, true);

        if ((hasStart && !start) || (hasEnd && !end)) {
            return {
                start,
                end,
                isCustom: hasStart || hasEnd,
                error: 'Informe um período válido.',
                label: '',
            };
        }

        if (start && end && start.getTime() > end.getTime()) {
            return {
                start,
                end,
                isCustom: true,
                error: 'Data inicial não pode ser maior que a data final.',
                label: '',
            };
        }

        const labelParts: string[] = [];
        if (start) labelParts.push(`a partir de ${dateOnlyFormatter.format(start)}`);
        if (end) labelParts.push(`até ${dateOnlyFormatter.format(end)}`);

        return {
            start,
            end,
            isCustom: hasStart || hasEnd,
            error: null,
            label: labelParts.join(' '),
        };
    }, [dataFinalGrafico, dataInicialGrafico, dateOnlyFormatter]);

    const manutencoesNoPeriodoParaGrafico = useMemo<ManutencaoRow[]>(() => {
        if (!periodoGrafico.isCustom || periodoGrafico.error) return rowsManutencoes2026;

        return rowsManutencoes2026.filter((row) => {
            const data = normalizeManutencaoDate(row.data);
            if (!data) return false;
            if (periodoGrafico.start && data.getTime() < periodoGrafico.start.getTime()) return false;
            if (periodoGrafico.end && data.getTime() > periodoGrafico.end.getTime()) return false;
            return true;
        });
    }, [periodoGrafico, rowsManutencoes2026]);

    const categoriasGraficoOptions = useMemo<CategoriaFiltroOption[]>(() => {
        const vehicleIds = new Set(rows.map((veiculo) => veiculo.id));
        const optionsByKey = new Map<string, CategoriaFiltroOption>();

        manutencoesNoPeriodoParaGrafico.forEach((row) => {
            const vehicleId = manutencaoItemFrotaId(row, idPorIdentificador);
            if (!vehicleId || !vehicleIds.has(vehicleId)) return;

            const key = getCategoriaKey(row);
            if (optionsByKey.has(key)) return;

            const categoriaId = normalizeText(row.categoriaId);
            const label =
                normalizeText(row.categoriaNomeSnapshot) ||
                (categoriaId ? normalizeText(categoriasById.get(categoriaId)) : '') ||
                normalizeText(row.categoria) ||
                SEM_CATEGORIA_LABEL;

            optionsByKey.set(key, { key, label });
        });

        return Array.from(optionsByKey.values()).sort((a, b) => {
            if (a.key === SEM_CATEGORIA_KEY) return 1;
            if (b.key === SEM_CATEGORIA_KEY) return -1;
            return a.label.localeCompare(b.label, 'pt-BR');
        });
    }, [categoriasById, idPorIdentificador, manutencoesNoPeriodoParaGrafico, rows]);

    useEffect(() => {
        if (selectedCategoriasGrafico.length === 0) return;

        const optionsByKey = new Map(categoriasGraficoOptions.map((option) => [option.key, option]));
        const nextSelected = selectedCategoriasGrafico
            .map((option) => optionsByKey.get(option.key))
            .filter((option): option is CategoriaFiltroOption => Boolean(option));
        const changed =
            nextSelected.length !== selectedCategoriasGrafico.length ||
            nextSelected.some((option, index) => option.label !== selectedCategoriasGrafico[index]?.label);

        if (changed) {
            setSelectedCategoriasGrafico(nextSelected);
        }
    }, [categoriasGraficoOptions, selectedCategoriasGrafico]);

    const selectedCategoriaKeys = useMemo(() => {
        return new Set(selectedCategoriasGrafico.map((option) => option.key));
    }, [selectedCategoriasGrafico]);

    const categoriaFiltroLabel = useMemo(() => {
        if (selectedCategoriasGrafico.length === 0) return 'Todas as categorias';
        if (selectedCategoriasGrafico.length <= 2) {
            return selectedCategoriasGrafico.map((option) => option.label).join(', ');
        }
        return `${selectedCategoriasGrafico.length} categorias selecionadas`;
    }, [selectedCategoriasGrafico]);

    const manutencoesChartData = useMemo<ChartPoint[]>(() => {
        const totals = new Map<string, number>();

        manutencoesNoPeriodoParaGrafico.forEach((row) => {
            const vehicleId = manutencaoItemFrotaId(row, idPorIdentificador);
            if (!vehicleId) return;
            if (selectedCategoriaKeys.size > 0 && !selectedCategoriaKeys.has(getCategoriaKey(row))) return;

            const value = parsePtBrNumber(row.valor) ?? 0;
            totals.set(vehicleId, (totals.get(vehicleId) ?? 0) + value);
        });

        return rows
            .map((veiculo) => {
                const label = veiculo.identificador || 'Sem identificação';
                const total = totals.get(veiculo.id) ?? 0;
                return { label, value: total };
            })
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [idPorIdentificador, manutencoesNoPeriodoParaGrafico, rows, selectedCategoriaKeys]);

    const hasValorField = useMemo(() => {
        if (rowsManutencoes2026.length === 0) return true;
        return rowsManutencoes2026.some((row) => row.valor !== undefined);
    }, [rowsManutencoes2026]);

    const manutencoesChartTitle = periodoGrafico.label
        ? `Gastos gerais por veículo (${periodoGrafico.label})`
        : 'Gastos gerais por veículo';

    function openManutencaoDialog() {
        setManutencaoForm(DEFAULT_MANUTENCAO_FORM);
        setManutencaoOpen(true);
    }

    function closeManutencaoDialog() {
        if (manutencaoSaving) return;
        setManutencaoOpen(false);
        setManutencaoForm(DEFAULT_MANUTENCAO_FORM);
    }

    async function handleSaveManutencao() {
        const validationError = getManutencaoValidationError(manutencaoForm);
        const item = veiculos.find((veiculo) => veiculo.id === manutencaoForm.itemFrotaId);
        if (validationError || !item) {
            setSnackbar({ open: true, severity: 'error', message: validationError ?? 'Selecione o veículo da manutenção.' });
            return;
        }

        setManutencaoSaving(true);
        try {
            const data =
                manutencaoForm.dataModo === 'MANUAL'
                    ? Timestamp.fromDate(new Date(manutencaoForm.dataManual))
                    : Timestamp.fromDate(new Date());
            const payload = buildManutencaoPayload(manutencaoForm, item, data);
            const docRef = await addDoc(collection(db, 'manutencoes'), payload);

            setManutencoes2026Rows((prev) => {
                const next: ManutencaoRow[] = [
                    ...prev,
                    {
                        id: docRef.id,
                        item_frota_id: item.id,
                        categoriaId: manutencaoForm.categoriaId,
                        categoriaNomeSnapshot: payload.categoriaNomeSnapshot as string,
                        valor: payload.valor,
                        data,
                    },
                ];
                return next.sort(
                    (a, b) => (toDate(b.data)?.getTime() ?? 0) - (toDate(a.data)?.getTime() ?? 0),
                );
            });

            setSnackbar({ open: true, severity: 'success', message: 'Manutenção adicionada com sucesso.' });
            closeManutencaoDialog();
        } catch (err) {
            console.error('Erro ao salvar manutenção', err);
            setSnackbar({
                open: true,
                severity: 'error',
                message: 'Não foi possível salvar a manutenção. Tente novamente.',
            });
        } finally {
            setManutencaoSaving(false);
        }
    }


    return (
        <Container sx={{ py: 3 }}>
            <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                justifyContent="space-between"
            >
                <Typography variant="h4">Frota</Typography>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" onClick={() => navigate('/frota/analytics')}>
                        Analytics
                    </Button>
                    <Button variant="outlined" onClick={() => navigate('/registros')}>
                        Ir para Registros
                    </Button>
                    <Button variant="contained" onClick={openManutencaoDialog}>
                        Adicionar Manutenção
                    </Button>
                </Stack>
            </Stack>

            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                mt={3}
                alignItems={{ xs: 'stretch', sm: 'center' }}
            >
                <Typography variant="subtitle1" fontWeight={600}>
                    Tipo de veículo
                </Typography>

                <ToggleButtonGroup value={tipo} exclusive onChange={(_event, newValue) => {
                    const v = newValue as TipoVeiculo | null;
                    if (v !== null) setTipo(v);
                }}
                    aria-label="Filtro de tipo de veículo">
                    <ToggleButton value={'PLACA' as TipoVeiculo} aria-label="Exibir placas">
                        Exibir PLACA
                    </ToggleButton>
                    <ToggleButton value={'EXTRA' as TipoVeiculo} aria-label="Exibir extras">
                        Exibir EXTRA
                    </ToggleButton>
                </ToggleButtonGroup>


            </Stack>

            <Box mt={3}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ width: '100%', height: 560 }}>
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        loading={loading}
                        disableRowSelectionOnClick
                        onRowClick={(params) => navigate(`/frota/${encodeURIComponent(String(params.id))}`)}
                        getRowId={(row) => row.id}
                        density="compact"
                    />
                </Box>

                {!loading && rows.length === 0 && !error && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {emptyLabel}
                    </Alert>
                )}
            </Box>

            <Box mt={4}>

                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Typography variant="h6">Gastos gerais por veículo</Typography>
                    <Button variant="text" onClick={() => setShowGastosChart(value => !value)}>
                        {showGastosChart ? 'Ocultar gráfico' : 'Exibir gráfico'}
                    </Button>
                </Stack>

                {showGastosChart && <><Box mt={1.5} display="flex" flexWrap="wrap" gap={1.5} alignItems="flex-start">
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                        sx={{ minWidth: { xs: '100%', sm: 320 }, flex: 1 }}
                    >
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            limitTags={1}
                            size="small"
                            options={categoriasGraficoOptions}
                            value={selectedCategoriasGrafico}
                            disabled={categoriasGraficoOptions.length === 0}
                            isOptionEqualToValue={(option, value) => option.key === value.key}
                            getOptionLabel={(option) => option.label}
                            onChange={(_event, value) => setSelectedCategoriasGrafico(value)}
                            renderOption={(props, option, { selected }) => {
                                const { key, ...optionProps } = props;
                                return (
                                    <li key={key} {...optionProps}>
                                        <Checkbox checked={selected} size="small" sx={{ mr: 1 }} />
                                        {option.label}
                                    </li>
                                );
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Categorias"
                                    placeholder="Todas as categorias"
                                    helperText={categoriaFiltroLabel}
                                />
                            )}
                            sx={{ minWidth: { xs: '100%', sm: 280 }, maxWidth: { sm: 420 } }}
                        />
                        <Button
                            variant="text"
                            size="small"
                            onClick={() => setSelectedCategoriasGrafico([])}
                            disabled={selectedCategoriasGrafico.length === 0}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            Todas as categorias
                        </Button>
                    </Stack>
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                        sx={{ minWidth: { xs: '100%', sm: 360 } }}
                    >
                        <TextField
                            label="Data inicial"
                            type="date"
                            size="small"
                            value={dataInicialGrafico}
                            onChange={(event) => setDataInicialGrafico(event.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{ minWidth: { xs: '100%', sm: 160 } }}
                        />
                        <TextField
                            label="Data final"
                            type="date"
                            size="small"
                            value={dataFinalGrafico}
                            onChange={(event) => setDataFinalGrafico(event.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{ minWidth: { xs: '100%', sm: 160 } }}
                        />
                        <Button
                            variant="text"
                            size="small"
                            onClick={() => {
                                setDataInicialGrafico('');
                                setDataFinalGrafico('');
                            }}
                            disabled={!periodoGrafico.isCustom}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            Limpar período
                        </Button>
                    </Stack>
                </Box>

                <Box mt={2}>
                    {manutencoes2026Error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {manutencoes2026Error}
                        </Alert>
                    )}
                    {periodoGrafico.error && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            {periodoGrafico.error}
                        </Alert>
                    )}

                    {loadingManutencoes ? (
                        <Box display="flex" alignItems="center" justifyContent="center" py={4}>
                            <CircularProgress size={28} />
                        </Box>
                    ) : !hasValorField ? (
                        <Alert severity="warning">
                            Campo de valor da manutenção não encontrado nos dados. Verifique o schema.
                        </Alert>
                    ) : periodoGrafico.error ? null
                    : manutencoesChartData.length === 0 ? (
                        <Alert severity="info">Sem dados para os filtros selecionados.</Alert>
                    ) : (
                        <Suspense fallback={<CircularProgress size={28} />}>
                            <FrotaCharts
                                data={manutencoesChartData}
                                title={manutencoesChartTitle}
                                xAxisTitle="Veículo"
                                yAxisTitle="Total (R$)"
                                valueFormatter={(value) => currencyFormatter.format(value)}
                                xAxisTickAngle={-45}
                            />
                        </Suspense>
                    )}
                </Box>
                </>}
            </Box>

            <ManutencaoDialog
                open={manutencaoOpen}
                saving={manutencaoSaving}
                form={manutencaoForm}
                veiculos={veiculos.filter((item) => item.ativo)}
                pessoas={pessoas}
                fornecedores={fornecedores}
                categoriasManutencao={categoriasManutencao}
                fornecedoresLoading={fornecedoresLoading}
                categoriasLoading={categoriasLoading}
                onClose={closeManutencaoDialog}
                onSave={handleSaveManutencao}
                onChange={setManutencaoForm}
            />


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
