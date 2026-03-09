import { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Timestamp, addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import FrotaCharts, { type ChartPoint } from '../components/FrotaCharts';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';

type TipoVeiculo = 'PLACA' | 'EXTRA';

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

type ManutencaoForm = {
    identificador: string;
    tipoVeiculo: TipoVeiculo | '';
    categoriaId: string;
    categoriaNomeSnapshot: string;
    valor: string;
    quantidade: string;
    fornecedorId: string;
    fornecedorNomeSnapshot: string;
    dataModo: 'ATUAL' | 'MANUAL';
    dataManual: string;
    descricao: string;
    km: string;
    motorista: string;
    nota: string;
    status: 'NORMAL' | 'SUSPEITO' | 'SUPER_FATURADO';
};

type ManutencaoRow = {
    id: string;
    identificador?: string;
    valor?: unknown;
    data?: unknown;
};

const DEFAULT_FORM: VeiculoForm = {
    ativo: false,
    placa: '',
    extra: '',
    quilometragemInicial: '',
    quilometragemUltima: '',
};

const DEFAULT_MANUTENCAO_FORM: ManutencaoForm = {
    identificador: '',
    tipoVeiculo: '',
    categoriaId: '',
    categoriaNomeSnapshot: '',
    valor: '',
    quantidade: '1',
    fornecedorId: '',
    fornecedorNomeSnapshot: '',
    dataModo: 'ATUAL',
    dataManual: '',
    descricao: '',
    km: '',
    motorista: '',
    nota: '',
    status: 'NORMAL',
};

const ABASTECIMENTO_EXTERNO = 'ABASTECIMENTO EXTERNO';
const MANUTENCAO_CUTOFF = new Date('2026-01-01T00:00:00.000Z');

const DEBUG = true;

type Fornecedor = {
    id: string;
    nome: string;
};

type CategoriaManutencao = {
    id: string;
    nome: string;
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
    const [showManutencoes2026, setShowManutencoes2026] = useState(true);
    const [showManutencoesLegado, setShowManutencoesLegado] = useState(false);
    const [manutencoes2026Rows, setManutencoes2026Rows] = useState<ManutencaoRow[]>([]);
    const [manutencoes2026Loading, setManutencoes2026Loading] = useState(false);
    const [manutencoes2026Error, setManutencoes2026Error] = useState<string | null>(null);
    const [manutencoes2026Loaded, setManutencoes2026Loaded] = useState(false);
    const [manutencoesLegadoRows, setManutencoesLegadoRows] = useState<ManutencaoRow[]>([]);
    const [manutencoesLegadoLoading, setManutencoesLegadoLoading] = useState(false);
    const [manutencoesLegadoError, setManutencoesLegadoError] = useState<string | null>(null);
    const [manutencoesLegadoLoaded, setManutencoesLegadoLoaded] = useState(false);
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

        if (!showManutencoes2026 || manutencoes2026Loaded) return () => {
            active = false;
        };

        loadManutencoes2026();
        return () => {
            active = false;
        };
    }, [showManutencoes2026, manutencoes2026Loaded]);

    useEffect(() => {
        let active = true;

        async function loadManutencoesLegado() {
            setManutencoesLegadoLoading(true);
            setManutencoesLegadoError(null);
            try {
                const snapshot = await getDocs(collection(db, 'manutencoes-legado'));
                if (!active) return;
                const data = snapshot.docs.map((docSnap) => {
                    const raw = docSnap.data() as Omit<ManutencaoRow, 'id'>;
                    return {
                        id: docSnap.id,
                        identificador: raw.identificador,
                        valor: raw.valor,
                        data: raw.data,
                    };
                });
                setManutencoesLegadoRows(data);
                setManutencoesLegadoLoaded(true);
            } catch (err) {
                console.error('Erro ao carregar manutenções legado', err);
                if (active) {
                    setManutencoesLegadoError('Erro ao carregar manutenções legado.');
                }
            } finally {
                if (active) setManutencoesLegadoLoading(false);
            }
        }

        if (!showManutencoesLegado || manutencoesLegadoLoaded) return () => {
            active = false;
        };

        loadManutencoesLegado();
        return () => {
            active = false;
        };
    }, [showManutencoesLegado, manutencoesLegadoLoaded]);

    useEffect(() => {
        let active = true;

        async function loadFornecedores() {
            setFornecedoresLoading(true);
            try {
                const fornecedoresQuery = query(collection(db, 'notas-fornecedores'), orderBy('nome'));
                const snapshot = await getDocs(fornecedoresQuery);
                if (!active) return;
                const data = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    nome: (docSnap.data().nome as string) ?? '',
                }));
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

        if (!manutencaoOpen || categoriasLoaded) return () => {
            active = false;
        };

        loadCategorias();
        return () => {
            active = false;
        };
    }, [manutencaoOpen, categoriasLoaded]);

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

    const rowsManutencoesLegado = useMemo(() => {
        return manutencoesLegadoRows.filter((row) => {
            const data = toDate(row.data);
            if (data && data >= MANUTENCAO_CUTOFF) return false;
            return true;
        });
    }, [manutencoesLegadoRows]);

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

    const loadingManutencoes =
        (showManutencoes2026 && manutencoes2026Loading) || (showManutencoesLegado && manutencoesLegadoLoading);

    const manutencoesChartData = useMemo<ChartPoint[]>(() => {
        const totals = new Map<string, number>();

        const selectedRows: ManutencaoRow[] = [];
        if (showManutencoes2026) selectedRows.push(...rowsManutencoes2026);
        if (showManutencoesLegado) selectedRows.push(...rowsManutencoesLegado);

        selectedRows.forEach((row) => {
            if (!row.identificador) return;
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
    }, [rows, rowsManutencoes2026, rowsManutencoesLegado, showManutencoes2026, showManutencoesLegado]);

    const hasValorField = useMemo(() => {
        if (!showManutencoes2026 && !showManutencoesLegado) return true;
        const selectedRows = [
            ...(showManutencoes2026 ? rowsManutencoes2026 : []),
            ...(showManutencoesLegado ? rowsManutencoesLegado : []),
        ];
        if (selectedRows.length === 0) return true;
        return selectedRows.some((row) => row.valor !== undefined);
    }, [rowsManutencoes2026, rowsManutencoesLegado, showManutencoes2026, showManutencoesLegado]);

    const manutencoesLegenda = useMemo(() => {
        if (showManutencoes2026 && showManutencoesLegado) return 'Manutenções - 2026 + Legado';
        if (showManutencoes2026) return 'Manutenções - 2026';
        if (showManutencoesLegado) return 'Manutenções - Legado';
        return '';
    }, [showManutencoes2026, showManutencoesLegado]);

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
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Typography variant="h6">Gastos gerais por veículo</Typography>
                    {manutencoesLegenda && (
                        <Typography variant="caption" color="text.secondary">
                            {manutencoesLegenda}
                        </Typography>
                    )}
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={1} alignItems="flex-start">
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

                <Box mt={2}>
                    {showManutencoes2026 && manutencoes2026Error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {manutencoes2026Error}
                        </Alert>
                    )}
                    {showManutencoesLegado && manutencoesLegadoError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {manutencoesLegadoError}
                        </Alert>
                    )}

                    {loadingManutencoes ? (
                        <Box display="flex" alignItems="center" justifyContent="center" py={4}>
                            <CircularProgress size={28} />
                        </Box>
                    ) : !showManutencoes2026 && !showManutencoesLegado ? (
                        <Alert severity="info">Selecione um filtro de manutenção.</Alert>
                    ) : !hasValorField ? (
                        <Alert severity="warning">
                            Campo de valor da manutenção não encontrado nos dados. Verifique o schema.
                        </Alert>
                    ) : manutencoesChartData.length === 0 ? (
                        <Alert severity="info">Sem dados para os filtros selecionados.</Alert>
                    ) : (
                        <FrotaCharts
                            data={manutencoesChartData}
                            title="Gastos gerais por veículo"
                            xAxisTitle="Veículo"
                            yAxisTitle="Total (R$)"
                            valueFormatter={(value) => currencyFormatter.format(value)}
                            xAxisTickAngle={-45}
                        />
                    )}
                </Box>
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
                            fullWidth
                        />
                        <Autocomplete
                            options={fornecedores}
                            value={fornecedorSelecionado}
                            getOptionLabel={(option) => option.nome}
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
