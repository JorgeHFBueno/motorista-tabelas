import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import type { ChartPoint } from './FrotaCharts';
import { db } from '../firebase';
import type { ItemFrotaV2 } from '../utils/cadastrosV2';

// Gráfico "Gastos gerais por veículo" (manutenções desde 2026), no KPI da frota.

type ManutencaoRow = {
    id: string;
    item_frota_id?: string;
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

const FrotaCharts = lazy(() => import('./FrotaCharts'));

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

export default function FrotaGastosPorVeiculo({ veiculos }: { veiculos: ItemFrotaV2[] }) {
    const [selectedCategoriasGrafico, setSelectedCategoriasGrafico] = useState<CategoriaFiltroOption[]>([]);
    const [dataInicialGrafico, setDataInicialGrafico] = useState('');
    const [dataFinalGrafico, setDataFinalGrafico] = useState('');
    const [manutencoes2026Rows, setManutencoes2026Rows] = useState<ManutencaoRow[]>([]);
    const [manutencoes2026Loading, setManutencoes2026Loading] = useState(false);
    const [manutencoes2026Error, setManutencoes2026Error] = useState<string | null>(null);
    const [manutencoes2026Loaded, setManutencoes2026Loaded] = useState(false);
    const [showGastosChart, setShowGastosChart] = useState(false);
    const [categoriasManutencao, setCategoriasManutencao] = useState<Array<{ id: string; nome: string }>>([]);
    const [categoriasLoaded, setCategoriasLoaded] = useState(false);

    const dateOnlyFormatter = useMemo(() => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }), []);
    const currencyFormatter = useMemo(() => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }), []);

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

        async function loadCategorias() {
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
            }
        }

        if (!showGastosChart || !manutencoes2026Loaded || categoriasLoaded) return () => {
            active = false;
        };

        loadCategorias();
        return () => {
            active = false;
        };
    }, [categoriasLoaded, manutencoes2026Loaded, showGastosChart]);

    const rowsManutencoes2026 = useMemo(() => {
        return manutencoes2026Rows.filter((row) => {
            const data = normalizeManutencaoDate(row.data);
            return Boolean(data && data >= MANUTENCAO_CUTOFF);
        });
    }, [manutencoes2026Rows]);

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
        const vehicleIds = new Set(veiculos.map((veiculo) => veiculo.id));
        const optionsByKey = new Map<string, CategoriaFiltroOption>();

        manutencoesNoPeriodoParaGrafico.forEach((row) => {
            const vehicleId = row.item_frota_id;
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
    }, [categoriasById, manutencoesNoPeriodoParaGrafico, veiculos]);

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
            const vehicleId = row.item_frota_id;
            if (!vehicleId) return;
            if (selectedCategoriaKeys.size > 0 && !selectedCategoriaKeys.has(getCategoriaKey(row))) return;

            const value = parsePtBrNumber(row.valor) ?? 0;
            totals.set(vehicleId, (totals.get(vehicleId) ?? 0) + value);
        });

        return veiculos
            .map((veiculo) => {
                const label = veiculo.identificador || 'Sem identificação';
                const total = totals.get(veiculo.id) ?? 0;
                return { label, value: total };
            })
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [manutencoesNoPeriodoParaGrafico, veiculos, selectedCategoriaKeys]);

    const hasValorField = useMemo(() => {
        if (rowsManutencoes2026.length === 0) return true;
        return rowsManutencoes2026.some((row) => row.valor !== undefined);
    }, [rowsManutencoes2026]);

    const manutencoesChartTitle = periodoGrafico.label
        ? `Gastos gerais por veículo (${periodoGrafico.label})`
        : 'Gastos gerais por veículo';

    return (
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

                {manutencoes2026Loading ? (
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
    );
}
