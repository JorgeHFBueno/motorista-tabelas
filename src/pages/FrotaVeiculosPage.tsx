import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormLabel,
    Radio,
    RadioGroup,
    Snackbar,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    createFilterOptions,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Timestamp, addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import type { ChartPoint } from '../components/FrotaCharts';
import {
    ABASTECIMENTO_EXTERNO,
    type CategoriaManutencao,
    DEFAULT_MANUTENCAO_FORM,
    type Fornecedor,
    type ManutencaoForm,
    type TipoVeiculo,
} from '../components/manutencaoFormShared';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { normalizeFornecedorNumero } from '../services/fornecedores.service';

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

type ManutencaoRow = {
    id: string;
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

const DEFAULT_FORM: VeiculoForm = {
    ativo: false,
    placa: '',
    extra: '',
    quilometragemInicial: '',
    quilometragemUltima: '',
};

const MANUTENCAO_CUTOFF = new Date('2026-01-01T00:00:00.000Z');
const SEM_CATEGORIA_KEY = '__sem_categoria__';
const SEM_CATEGORIA_LABEL = 'Sem categoria';

const DEBUG = true;
const FrotaCharts = lazy(() => import('../components/FrotaCharts'));

function getFornecedorOptionLabel(fornecedor: Fornecedor | null): string {
    if (!fornecedor) return '';
    const nome = fornecedor.nome.trim();
    if (fornecedor.numero) {
        return nome ? `${fornecedor.numero}-${nome}` : String(fornecedor.numero);
    }
    return nome;
}

const fornecedorFilterOptions = createFilterOptions<Fornecedor>({
    stringify: (option) => [getFornecedorOptionLabel(option), option.numero?.toString() ?? '', option.nome].join(' '),
});

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
    const { currentUser } = useAuth();
    const [tipo, setTipo] = useState<TipoVeiculo>('PLACA');
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Veiculo | null>(null);
    const [form, setForm] = useState<VeiculoForm>(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);
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

    // Evita spam no console (logar 1x por row/campo)
    const loggedOnceRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        let active = true;
        async function loadVeiculos() {
            setLoading(true);
            setError(null);
            try {
                const orderField = tipo === 'PLACA' ? 'placa' : 'extra';
                const veiculosQuery = query(collection(db, 'veiculos'), orderBy(orderField));
                const snapshot = await getDocs(veiculosQuery);
                if (!active) return;

                const data = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<Veiculo, 'id'>),
                }));

                if (DEBUG) {
                    console.group('[FROTA DEBUG] loadVeiculos');
                    console.log('tipo:', tipo, 'orderField:', orderField, 'count:', data.length);
                    console.table(
                        data.slice(0, 10).map((v) => ({
                            id: v.id,
                            placa: v.placa,
                            extra: v.extra,
                            kmInicial_raw: (v as any).quilometragemInicial,
                            kmInicial_type: typeof (v as any).quilometragemInicial,
                            kmUltima_raw: (v as any).quilometragemUltima,
                            kmUltima_type: typeof (v as any).quilometragemUltima,
                            data_raw: (v as any).dataUltimaAtualizacao,
                            data_type: typeof (v as any).dataUltimaAtualizacao,
                            keys: Object.keys(v as any).join(', '),
                        })),
                    );
                    console.groupEnd();
                }

                setVeiculos(data);
            } catch (err) {
                console.error('Erro ao carregar veículos', err);
                if (active) {
                    setError('Não foi possível carregar os veículos. Tente novamente.');
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        loadVeiculos();
        return () => {
            active = false;
        };
    }, [tipo]);

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

    const rows = useMemo(() => {
        const filtered = veiculos.filter((item) => {
            if (item.categoria) {
                return item.categoria === tipo;
            }
            if (tipo === 'PLACA') {
                return Boolean(item.placa);
            }
            return Boolean(item.extra);
        });

        if (DEBUG) {
            console.group('[FROTA DEBUG] rows/filter');
            console.log('tipo:', tipo, 'rows:', filtered.length, 'veiculos:', veiculos.length);
            console.table(
                filtered.slice(0, 5).map((v) => ({
                    id: v.id,
                    placa: v.placa,
                    extra: v.extra,
                    kmInicial_raw: (v as any).quilometragemInicial,
                    kmUltima_raw: (v as any).quilometragemUltima,
                    data_raw: (v as any).dataUltimaAtualizacao,
                })),
            );
            console.groupEnd();
        }

        return filtered;
    }, [tipo, veiculos]);

    const rowsManutencoes2026 = useMemo(() => {
        return manutencoes2026Rows.filter((row) => {
            const data = toDate(row.data);
            return Boolean(data && data >= MANUTENCAO_CUTOFF);
        });
    }, [manutencoes2026Rows]);

    const columns: GridColDef[] = useMemo(() => {
        const fieldLabel = tipo === 'PLACA' ? 'Placa' : 'Extra';
        const fieldName = tipo === 'PLACA' ? 'placa' : 'extra';

        const logOnce = (key: string, payload: unknown) => {
            if (!DEBUG) return;
            if (loggedOnceRef.current.has(key)) return;
            loggedOnceRef.current.add(key);
            console.log(key, payload);
        };

        return [
            {
                field: 'ativo',
                headerName: 'Ativo',
                minWidth: 90,
                renderCell: ({ value }) => <Checkbox checked={Boolean(value)} disabled />,
            },
            {
                field: fieldName,
                headerName: fieldLabel,
                minWidth: 140,
                flex: 1,
                renderCell: (params) => {
                    const value = (params.value ?? '') as string;
                    const isDisabled = !value;
                    return (
                        <Button
                            variant="text"
                            size="small"
                            onClick={(event) => {
                                event.stopPropagation();
                                const value = (params.row?.[fieldName] as string | undefined) ?? '';
                                navigate(`/frota/${encodeURIComponent(value)}`);
                            }}
                            disabled={isDisabled}
                            sx={{ textTransform: 'none', px: 0.5, minWidth: 'auto' }}
                        >
                            {value || '—'}
                        </Button>
                    );
                },
            },
            {
                field: 'quilometragemInicial',
                headerName: 'KM inicial',
                minWidth: 140,
                flex: 1,
                renderCell: (params: any) => {
                    const row = params?.row ?? params;
                    const raw = row?.quilometragemInicial;
                    if (DEBUG) {
                        const key = `[FROTA DEBUG] render kmInicial ${row?.id ?? 'sem-id'}`;
                        if (!loggedOnceRef.current.has(key)) {
                            loggedOnceRef.current.add(key);
                            console.log(key, { raw, type: typeof raw, rowKeys: row ? Object.keys(row) : null });
                        }
                    }
                    const n = asNumber(raw);
                    return n !== null ? numberFormatter.format(n) : '—';
                },
            },
            {
                field: 'quilometragemUltima',
                headerName: 'KM última',
                minWidth: 140,
                flex: 1,
                renderCell: (params: any) => {
                    const row = params?.row ?? params;
                    const raw = row?.quilometragemUltima;
                    if (DEBUG) {
                        const key = `[FROTA DEBUG] render kmUltima ${row?.id ?? 'sem-id'}`;
                        if (!loggedOnceRef.current.has(key)) {
                            loggedOnceRef.current.add(key);
                            console.log(key, { raw, type: typeof raw, rowKeys: row ? Object.keys(row) : null });
                        }
                    }
                    const n = asNumber(raw);
                    return n !== null ? numberFormatter.format(n) : '—';
                },
            },
            {
                field: 'dataUltimaAtualizacao',
                headerName: 'Última atualização',
                minWidth: 180,
                flex: 1.2,
                renderCell: (params: any) => {
                    const row = params?.row ?? params;
                    const raw = row?.dataUltimaAtualizacao;
                    const d = toDate(raw);

                    if (DEBUG) {
                        const key = `[FROTA DEBUG] render data ${row?.id ?? 'sem-id'}`;
                        if (!loggedOnceRef.current.has(key)) {
                            loggedOnceRef.current.add(key);
                            console.log(key, {
                                raw,
                                raw_type: typeof raw,
                                parsed: d,
                                parsed_isDate: d instanceof Date,
                                parsed_time: d ? d.getTime() : null,
                                rowKeys: row ? Object.keys(row) : null,
                            });
                        }
                    }

                    return d ? dateFormatter.format(d) : '—';
                },
            },

        ];
    }, [dateFormatter, numberFormatter, tipo]);

    function openEditor(row: Veiculo) {
        setEditing(row);
        setForm({
            ativo: Boolean(row.ativo),
            placa: row.placa ?? '',
            extra: row.extra ?? '',
            quilometragemInicial: row.quilometragemInicial !== undefined ? String(row.quilometragemInicial) : '',
            quilometragemUltima: row.quilometragemUltima !== undefined ? String(row.quilometragemUltima) : '',
        });

        if (DEBUG) {
            console.group('[FROTA DEBUG] openEditor');
            console.log('row.id:', row.id);
            console.log('row keys:', Object.keys(row as any));
            console.log('kmInicial:', (row as any).quilometragemInicial, 'type:', typeof (row as any).quilometragemInicial);
            console.log('kmUltima:', (row as any).quilometragemUltima, 'type:', typeof (row as any).quilometragemUltima);
            console.log('dataUltimaAtualizacao raw:', (row as any).dataUltimaAtualizacao);
            const d = toDate((row as any).dataUltimaAtualizacao);
            console.log('dataUltimaAtualizacao parsed:', d, 'isDate:', d instanceof Date, 'time:', d ? d.getTime() : null);
            console.groupEnd();
        }
    }

    function closeEditor() {
        if (saving) return;
        setEditing(null);
        setForm(DEFAULT_FORM);
    }

    async function handleSave() {
        if (!editing) return;

        const placa = form.placa.trim();
        const extra = form.extra.trim();

        if (tipo === 'PLACA' && !placa) {
            setSnackbar({ open: true, severity: 'error', message: 'Informe a placa.' });
            return;
        }
        if (tipo === 'EXTRA' && !extra) {
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

            if (tipo === 'PLACA') {
                updateData.placa = placa;
            } else {
                updateData.extra = extra;
            }

            await updateDoc(doc(db, 'veiculos', editing.id), {
                ...updateData,
                dataUltimaAtualizacao: serverTimestamp(),
            });

            setVeiculos((prev) =>
                prev.map((item) =>
                    item.id === editing.id
                        ? {
                            ...item,
                            ...updateData,
                            dataUltimaAtualizacao: new Date(),
                        }
                        : item,
                ),
            );

            setSnackbar({ open: true, severity: 'success', message: 'Veículo atualizado com sucesso.' });
            closeEditor();
        } catch (err) {
            console.error('Erro ao atualizar veículo', err);
            setSnackbar({ open: true, severity: 'error', message: 'Erro ao atualizar veículo.' });
        } finally {
            setSaving(false);
        }
    }

    const emptyLabel =
        tipo === 'PLACA' ? 'Nenhum veículo do tipo PLACA encontrado.' : 'Nenhum veículo do tipo EXTRA encontrado.';

    const manutencaoVeiculoSelecionado = useMemo(
        () => veiculos.find((item) => item.id === manutencaoForm.identificador) ?? null,
        [manutencaoForm.identificador, veiculos],
    );

    const getVeiculoLabel = (veiculo: Veiculo | null) => {
        if (!veiculo) return '';
        if (veiculo.categoria === 'PLACA') return veiculo.placa ?? '';
        if (veiculo.categoria === 'EXTRA') return veiculo.extra ?? '';
        return veiculo.placa ?? veiculo.extra ?? '';
    };

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
            if (!row.identificador || !vehicleIds.has(row.identificador)) return;

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
    }, [categoriasById, manutencoesNoPeriodoParaGrafico, rows]);

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
            if (!row.identificador) return;
            if (selectedCategoriaKeys.size > 0 && !selectedCategoriaKeys.has(getCategoriaKey(row))) return;

            const value = parsePtBrNumber(row.valor) ?? 0;
            totals.set(row.identificador, (totals.get(row.identificador) ?? 0) + value);
        });

        return rows
            .map((veiculo) => {
                const label = getVeiculoLabel(veiculo) || 'Sem identificação';
                const total = totals.get(veiculo.id) ?? 0;
                return { label, value: total };
            })
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [manutencoesNoPeriodoParaGrafico, rows, selectedCategoriaKeys]);

    const hasValorField = useMemo(() => {
        if (rowsManutencoes2026.length === 0) return true;
        return rowsManutencoes2026.some((row) => row.valor !== undefined);
    }, [rowsManutencoes2026]);

    const manutencoesChartTitle = periodoGrafico.label
        ? `Gastos gerais por veículo (${periodoGrafico.label})`
        : 'Gastos gerais por veículo';

    const motoristaAtual = (currentUser?.displayName || currentUser?.email || '').trim();

    const isAbastecimentoExterno = manutencaoForm.categoriaNomeSnapshot === ABASTECIMENTO_EXTERNO;
    const veiculoLabelSelecionado = getVeiculoLabel(manutencaoVeiculoSelecionado);
    const fornecedorSelecionado = useMemo(
        () => fornecedores.find((item) => item.id === manutencaoForm.fornecedorId) ?? null,
        [fornecedores, manutencaoForm.fornecedorId],
    );
    const categoriaSelecionada = useMemo(
        () => categoriasManutencao.find((item) => item.id === manutencaoForm.categoriaId) ?? null,
        [categoriasManutencao, manutencaoForm.categoriaId],
    );

    function openManutencaoDialog() {
        setManutencaoForm(DEFAULT_MANUTENCAO_FORM);
        setManutencaoOpen(true);
    }

    function closeManutencaoDialog() {
        if (manutencaoSaving) return;
        setManutencaoOpen(false);
        setManutencaoForm(DEFAULT_MANUTENCAO_FORM);
    }

    function getManutencaoValidationError(): string | null {
        if (!manutencaoForm.identificador || !manutencaoForm.tipoVeiculo) {
            return 'Selecione o veículo da manutenção.';
        }

        if (!manutencaoForm.categoriaId) {
            return 'Selecione a categoria da manutenção.';
        }

        const valor = Number(manutencaoForm.valor);

        if (!Number.isFinite(valor) || valor <= 0) {
            return 'Valor da manutenção deve ser um número válido maior que zero.';
        }

        const quantidade = Number(manutencaoForm.quantidade);
        if (!Number.isFinite(quantidade) || quantidade < 1) {
            return 'Quantidade deve ser um número válido maior ou igual a 1.';
        }

        const kmValue = manutencaoForm.km.trim();
        if (kmValue) {
            const km = Number(kmValue);
            if (!Number.isInteger(km) || km < 0) {
                return 'KM deve ser um número inteiro maior ou igual a 0.';
            }
        }

        if (!manutencaoForm.fornecedorId) {
            return 'Fornecedor é obrigatório.';
        }

        if (isAbastecimentoExterno && !manutencaoForm.motorista.trim()) {
            return 'Motorista é obrigatório para abastecimento externo.';
        }

        if (manutencaoForm.dataModo === 'MANUAL') {
            if (!manutencaoForm.dataManual.trim()) {
                return 'Informe a data e hora da manutenção.';
            }
            const parsed = new Date(manutencaoForm.dataManual);
            if (Number.isNaN(parsed.getTime())) {
                return 'Data/hora informada é inválida.';
            }
        }

        return null;
    }

    async function handleSaveManutencao() {
        const validationError = getManutencaoValidationError();
        if (validationError) {
            setSnackbar({ open: true, severity: 'error', message: validationError });
            return;
        }

        setManutencaoSaving(true);
        try {
            const data =
                manutencaoForm.dataModo === 'MANUAL'
                    ? Timestamp.fromDate(new Date(manutencaoForm.dataManual))
                    : Timestamp.fromDate(new Date());
            const valor = Number(manutencaoForm.valor);
            const quantidade = Number(manutencaoForm.quantidade);
            const kmValue = manutencaoForm.km.trim();
            const km = kmValue ? Number(kmValue) : undefined;
            const nota = manutencaoForm.nota.trim();
            const fornecedorNomeSnapshot = manutencaoForm.fornecedorNomeSnapshot.trim();
            const categoriaNomeSnapshot = manutencaoForm.categoriaNomeSnapshot.trim();
            const docRef = await addDoc(collection(db, 'manutencoes'), {
                identificador: manutencaoForm.identificador,
                tipoVeiculo: manutencaoForm.tipoVeiculo,
                categoriaId: manutencaoForm.categoriaId,
                categoriaNomeSnapshot,
                valor,
                quantidade,
                ...(kmValue ? { km } : {}),
                fornecedorId: manutencaoForm.fornecedorId,
                fornecedorNomeSnapshot,
                motorista: manutencaoForm.motorista.trim(),
                descricao: manutencaoForm.descricao.trim(),
                nota,
                status: manutencaoForm.status,
                data,
            });

            if (isAbastecimentoExterno) {
                const qa = Number.isFinite(quantidade) ? quantidade : 0;
                await addDoc(collection(db, '03-combustivel'), {
                    data,
                    observacao: manutencaoForm.descricao.trim(),
                    fornecedor: motoristaAtual || 'Não informado',
                    motorista: fornecedorNomeSnapshot || 'Não informado',
                    para_quem: manutencaoForm.motorista.trim(),
                    placa: veiculoLabelSelecionado || manutencaoForm.identificador,
                    qa,
                });
            }

            setManutencoes2026Rows((prev) => {
                const next = [
                    ...prev,
                    {
                        id: docRef.id,
                        identificador: manutencaoForm.identificador,
                        categoriaId: manutencaoForm.categoriaId,
                        categoriaNomeSnapshot,
                        valor,
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
                        onRowClick={(params) => openEditor(params.row as Veiculo)}
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

            <Dialog open={Boolean(editing)} onClose={closeEditor} maxWidth="sm" fullWidth>
                <DialogTitle>Editar veículo</DialogTitle>
                <DialogContent>
                    {editing ? (
                        <Stack spacing={2} mt={1}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={form.ativo}
                                        onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))}
                                    />
                                }
                                label="Ativo"
                            />

                            {tipo === 'PLACA' ? (
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
                                    const d = toDate(editing.dataUltimaAtualizacao);
                                    return d ? dateFormatter.format(d) : '—';
                                })()}
                                fullWidth
                                disabled
                            />
                        </Stack>
                    ) : (
                        <Box display="flex" alignItems="center" justifyContent="center" py={3}>
                            <CircularProgress size={22} />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeEditor} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={manutencaoOpen} onClose={closeManutencaoDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Adicionar Manutenção</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} mt={1}>
                        <Autocomplete
                            options={veiculos}
                            value={manutencaoVeiculoSelecionado}
                            getOptionLabel={getVeiculoLabel}
                            onChange={(_event, value) =>
                                setManutencaoForm((prev) => ({
                                    ...prev,
                                    identificador: value?.id ?? '',
                                    tipoVeiculo: (value?.categoria as TipoVeiculo) ?? '',
                                }))
                            }
                            renderInput={(params) => <TextField {...params} label="Veículo" required />}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                        />
                        <Autocomplete
                            options={categoriasManutencao}
                            value={categoriaSelecionada}
                            getOptionLabel={(option) => option.nome}
                            onChange={(_event, value) =>
                                setManutencaoForm((prev) => ({
                                    ...prev,
                                    categoriaId: value?.id ?? '',
                                    categoriaNomeSnapshot: value?.nome ?? '',
                                }))
                            }
                            loading={categoriasLoading}
                            noOptionsText={categoriasLoading ? 'Carregando...' : 'Nenhum cadastro encontrado'}
                            loadingText="Carregando..."
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Categoria da manutenção"
                                    required
                                    InputProps={{
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {categoriasLoading ? <CircularProgress size={20} /> : null}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    }}
                                />
                            )}
                        />
                        <FormControl>
                            <FormLabel>Data</FormLabel>
                            <RadioGroup
                                row
                                value={manutencaoForm.dataModo}
                                onChange={(event) =>
                                    setManutencaoForm((prev) => ({
                                        ...prev,
                                        dataModo: event.target.value as ManutencaoForm['dataModo'],
                                    }))
                                }
                            >
                                <FormControlLabel value="ATUAL" control={<Radio />} label="Atual" />
                                <FormControlLabel value="MANUAL" control={<Radio />} label="Manual" />
                            </RadioGroup>
                            {manutencaoForm.dataModo === 'MANUAL' && (
                                <TextField
                                    label="Data e hora (local)"
                                    type="datetime-local"
                                    value={manutencaoForm.dataManual}
                                    onChange={(event) =>
                                        setManutencaoForm((prev) => ({
                                            ...prev,
                                            dataManual: event.target.value,
                                        }))
                                    }
                                    InputLabelProps={{ shrink: true }}
                                    helperText="Informe a data/hora no fuso local."
                                    required
                                />
                            )}
                        </FormControl>
                        <TextField
                            label="Valor"
                            type="number"
                            value={manutencaoForm.valor}
                            onChange={(event) =>
                                setManutencaoForm((prev) => ({ ...prev, valor: event.target.value }))
                            }
                            inputProps={{ className: 'no-number-spinner' }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Quantidade"
                            type="number"
                            value={manutencaoForm.quantidade}
                            onChange={(event) =>
                                setManutencaoForm((prev) => ({ ...prev, quantidade: event.target.value }))
                            }
                            inputProps={{ className: 'no-number-spinner' }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="KM"
                            type="number"
                            value={manutencaoForm.km}
                            onChange={(event) =>
                                setManutencaoForm((prev) => ({ ...prev, km: event.target.value }))
                            }
                            inputProps={{ className: 'no-number-spinner' }}
                            fullWidth
                        />
                        <Autocomplete
                            options={fornecedores}
                            value={fornecedorSelecionado}
                            getOptionLabel={getFornecedorOptionLabel}
                            filterOptions={fornecedorFilterOptions}
                            onChange={(_event, value) =>
                                setManutencaoForm((prev) => ({
                                    ...prev,
                                    fornecedorId: value?.id ?? '',
                                    fornecedorNomeSnapshot: value?.nome ?? '',
                                }))
                            }
                            loading={fornecedoresLoading}
                            noOptionsText={fornecedoresLoading ? 'Carregando...' : 'Nenhum cadastro encontrado'}
                            loadingText="Carregando..."
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Fornecedor"
                                    required
                                    InputProps={{
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {fornecedoresLoading ? <CircularProgress size={20} /> : null}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    }}
                                />
                            )}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                        />
                        {isAbastecimentoExterno && (
                            <TextField
                                label="Motorista"
                                value={manutencaoForm.motorista}
                                onChange={(event) =>
                                    setManutencaoForm((prev) => ({ ...prev, motorista: event.target.value }))
                                }
                                fullWidth
                                required
                            />
                        )}
                        <TextField
                            label="Descrição"
                            value={manutencaoForm.descricao}
                            onChange={(event) =>
                                setManutencaoForm((prev) => ({ ...prev, descricao: event.target.value }))
                            }
                            fullWidth
                            multiline
                            minRows={2}
                        />
                        <TextField
                            label="Nota"
                            value={manutencaoForm.nota}
                            onChange={(event) =>
                                setManutencaoForm((prev) => ({ ...prev, nota: event.target.value }))
                            }
                            fullWidth
                            multiline
                            minRows={2}
                        />
                        <FormControl>
                            <FormLabel>Status</FormLabel>
                            <RadioGroup
                                row
                                value={manutencaoForm.status}
                                onChange={(event) =>
                                    setManutencaoForm((prev) => ({
                                        ...prev,
                                        status: event.target.value as ManutencaoForm['status'],
                                    }))
                                }
                            >
                                <FormControlLabel value="NORMAL" control={<Radio />} label="Normal" />
                                <FormControlLabel value="SUSPEITO" control={<Radio />} label="Suspeito" />
                                <FormControlLabel value="SUPER_FATURADO" control={<Radio />} label="Super Faturado" />
                            </RadioGroup>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeManutencaoDialog} disabled={manutencaoSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSaveManutencao} variant="contained" disabled={manutencaoSaving}>
                        {manutencaoSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </DialogActions>
            </Dialog>

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
