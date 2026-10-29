import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Menu,
    MenuItem,
    Paper,
    Snackbar,
    Stack,
    Typography,
} from '@mui/material';
import {
    Timestamp,
    addDoc,
    collection,
    deleteDoc,
    deleteField,
    doc,
    FieldPath,
    getDoc,
    getDocs,
    orderBy,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import type { ChartPoint } from '../components/FrotaCharts';
import ManutencaoDialog from '../components/ManutencaoDialog';
import ManutencaoDetailPanel from '../components/ManutencaoDetailPanel';
import ManutencoesList, {
    RegistrosFiltros,
    type FonteEvento,
    type MasterDetailCounts,
    type MasterDetailFilters,
    type MasterDetailListItem,
    type TipoEvento,
} from '../components/ManutencoesList';
import {
    buildManutencaoPayload,
    type CategoriaManutencao,
    DEFAULT_MANUTENCAO_FORM,
    type Fornecedor,
    getManutencaoValidationError,
    type ManutencaoForm,
    motoristaNome,
} from '../components/manutencaoFormShared';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { normalizeFornecedorNumero } from '../services/fornecedores.service';
import { normalizarMovimentoCombustivel } from '../services/combustivel-normalizer';
import { normalizarAtividade } from '../services/atividade-normalizer';
import { buildVehicleReport, fetchVehicleErpRows } from '../services/vehicle-report.service';
import { createVehicleReportPdf } from '../services/vehicle-report-pdf';
import { describeErpCallError, normalizeCalendarDate, resolveVehicleReportPeriod, type VehicleReportPeriod } from '../services/vehicle-report-core';
import { listFuncionariosAtivos } from '../services/funcionarios-selecao.service';
import { getItemFrota } from '../services/veiculos.service';
import type { ItemFrotaV2, PessoaV2 } from '../utils/cadastrosV2';
import { atualizacaoInfo, medidorTexto } from '../utils/frotaVeiculosLista';

const FrotaCharts = lazy(() => import('../components/FrotaCharts'));
type Manutencao = {
    id: string;
    item_frota_id?: string;
    identificador?: string;
    motorista?: unknown;
    tipoVeiculo?: 'PLACA' | 'EXTRA';
    categoria?: string;
    categoriaId?: string;
    categoriaNomeSnapshot?: string;
    valor?: number;
    km?: number;
    quantidade?: number;
    fornecedor?: string;
    fornecedorId?: string;
    fornecedorNomeSnapshot?: string;
    descricao?: string;
    nota?: string;
    status?: 'NORMAL' | 'SUSPEITO' | 'SUPER_FATURADO';
    data?: unknown;
};

type Combustivel = {
    data?: unknown;
    qa?: number;
    arla?: number;
    motivo?: string;
    valor?: number;
    itemFrotaUid?: string;
    itemFrotaTipo?: string | null;
    identificadorSnapshot?: string;
    isFuelOutput?: boolean;
    quantidadeAbastecida?: number;
    obra?: string;
};

type LinhaEvento = {
    id: string;
    docId: string;
    collection: FonteEvento;
    origem: TipoEvento;
    tipo: 'ATIVIDADE' | 'ABASTECIMENTO' | 'MANUTENCAO';
    data?: Date | null;
    qntAbastecida?: number | null;
    arla?: number | null;
    obra?: string | null;
    categoria?: string | null;
    categoriaId?: string | null;
    categoriaNomeSnapshot?: string | null;
    valor?: number | null;
    km?: number | null;
    quantidade?: number | null;
    fornecedor?: string | null;
    fornecedorId?: string | null;
    fornecedorNomeSnapshot?: string | null;
    motorista?: string | null;
    descricao?: string | null;
    nota?: string | null;
    status?: string | null;
    valorTexto?: string | null;
    /** Linha do ERP como veio da Query 47 (não há documento no Firestore). */
    raw?: Record<string, unknown>;
};

const numberFormatter = new Intl.NumberFormat('pt-BR');
const erpNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(String(value ?? '').replace(',', '.')) || 0;
const erpText = (value: unknown) => String(value ?? '').trim();

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

const buildCacheKey = (collectionName: FonteEvento, docId: string) =>
    `${collectionName}/${docId}`;

const setDeepValue = (target: Record<string, unknown>, path: string, value: unknown) => {
    const keys = path.split('.');
    let current = target;
    keys.forEach((key, index) => {
        if (index === keys.length - 1) {
            current[key] = value;
            return;
        }
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    });
};

const deleteDeepValue = (target: Record<string, unknown>, path: string) => {
    const keys = path.split('.');
    let current = target;
    keys.forEach((key, index) => {
        if (index === keys.length - 1) {
            delete current[key];
            return;
        }
        if (!current[key] || typeof current[key] !== 'object') {
            return;
        }
        current = current[key] as Record<string, unknown>;
    });
};

// manutencoes liga o veículo por item_frota_id (todos os registros desde a migração de 2026-10-23).
async function queryManutencoes(itemId: string) {
    const baseQuery = query(collection(db, 'manutencoes'), where('item_frota_id', '==', itemId));
    try {
        return (await getDocs(query(baseQuery, orderBy('data', 'desc')))).docs;
    } catch (err) {
        console.warn('Falha ao ordenar manutenções por data, carregando sem orderBy. Índice sugerido: item_frota_id ASC, data DESC.', err);
        return (await getDocs(baseQuery)).docs;
    }
}

// Atividades (saída e chegada do app) ligam o veículo por item_frota_id; a WEB só lê.
async function fetchAtividades(item: ItemFrotaV2): Promise<LinhaEvento[]> {
    const snapshot = await getDocs(query(collection(db, 'atividades'), where('item_frota_id', '==', item.id)));
    return snapshot.docs
        .map((docSnap): LinhaEvento => {
            const atividade = normalizarAtividade(docSnap.data(), docSnap.id);
            const tipo = atividade.tipo === 'saida' ? 'Saída' : atividade.tipo === 'chegada' ? 'Chegada' : 'Fora do contrato';
            return {
                id: `atividades_${docSnap.id}`,
                docId: docSnap.id,
                collection: 'atividades',
                origem: 'atividade',
                tipo: 'ATIVIDADE',
                data: toDate(atividade.data),
                categoria: atividade.motorista ? `${tipo} — ${atividade.motorista}` : tipo,
                valor: null,
                valorTexto: atividade.km != null ? `${numberFormatter.format(atividade.km)} ${item.categoria === 'PLACA' ? 'km' : 'h'}` : null,
            };
        })
        .sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
}

// Mesmo pedido do "Gerar Relatório" (Query 47 do ERP pela placa), de 01/01/2025 até hoje.
async function fetchManutencoesErp(item: ItemFrotaV2, { dataInicial, dataFinal }: { dataInicial: string; dataFinal: string }): Promise<LinhaEvento[]> {
    const rows = await fetchVehicleErpRows(item.identificador, dataInicial, dataFinal);
    return rows
        .map((row, index): LinhaEvento => {
            const emissao = normalizeCalendarDate(row.data_emissao);
            return {
                id: `erp_${index}`,
                docId: `erp_${index}`,
                collection: 'erp',
                origem: 'manutencaoErp',
                tipo: 'MANUTENCAO',
                data: emissao ? toDate(`${emissao}T12:00:00`) : null,
                categoria: erpText(row.natureza) || erpText(row.conta) || null,
                valor: erpNumber(row.valor_rateio),
                raw: row,
            };
        })
        .sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
}

async function fetchManutencoes(item: ItemFrotaV2): Promise<LinhaEvento[]> {
    const collectionName: FonteEvento = 'manutencoes';
    const origem: TipoEvento = 'manutencao2026';
    const docs = await queryManutencoes(item.id);

    return docs.map(
        (docSnap): LinhaEvento => {
            const manutencao = docSnap.data() as Omit<Manutencao, 'id'>;
            return {
                id: `${collectionName}_${docSnap.id}`,
                docId: docSnap.id,
                collection: collectionName,
                origem,
                tipo: 'MANUTENCAO',
                data: toDate(manutencao.data),
                categoria: manutencao.categoria ?? null,
                categoriaId: manutencao.categoriaId ?? null,
                categoriaNomeSnapshot: manutencao.categoriaNomeSnapshot ?? null,
                valor: manutencao.valor ?? null,
                km: manutencao.km ?? null,
                quantidade: manutencao.quantidade ?? null,
                fornecedor: manutencao.fornecedor ?? null,
                fornecedorId: manutencao.fornecedorId ?? null,
                fornecedorNomeSnapshot: manutencao.fornecedorNomeSnapshot ?? null,
                motorista: motoristaNome(manutencao.motorista),
                descricao: manutencao.descricao ?? null,
                nota: manutencao.nota ?? null,
                status: manutencao.status ?? null,
            };
        },
    );
}

export default function FrotaVeiculoDetalhesPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isAdmin } = useAuth();

    const [veiculo, setVeiculo] = useState<ItemFrotaV2 | null>(null);
    const [pessoas, setPessoas] = useState<PessoaV2[]>([]);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [reportMenuAnchor, setReportMenuAnchor] = useState<HTMLElement | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);


    const [showAbastecimento, setShowAbastecimento] = useState(false);
    const [showManutencoes2026, setShowManutencoes2026] = useState(true);
    const [showAtividades, setShowAtividades] = useState(false);
    const [showErp, setShowErp] = useState(false);

    const [atividadesRows, setAtividadesRows] = useState<LinhaEvento[]>([]);
    const [atividadesLoading, setAtividadesLoading] = useState(false);
    const [atividadesError, setAtividadesError] = useState<string | null>(null);
    const [erpRows, setErpRows] = useState<LinhaEvento[]>([]);
    const [erpLoading, setErpLoading] = useState(false);
    const [erpError, setErpError] = useState<string | null>(null);
    const [erpDiagnostico, setErpDiagnostico] = useState<string | null>(null);

    const [combustivelRows, setCombustivelRows] = useState<LinhaEvento[]>([]);
    const [combustivelLoading, setCombustivelLoading] = useState(false);
    const [combustivelError, setCombustivelError] = useState<string | null>(null);

    const [manutencoes2026Rows, setManutencoes2026Rows] = useState<LinhaEvento[]>([]);
    const [manutencoes2026Loading, setManutencoes2026Loading] = useState(false);
    const [manutencoes2026Error, setManutencoes2026Error] = useState<string | null>(null);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [selectedCollection, setSelectedCollection] = useState<FonteEvento | null>(null);
    const [selectedTipo, setSelectedTipo] = useState<TipoEvento | null>(null);
    const [selectedDocData, setSelectedDocData] = useState<Record<string, unknown> | null>(null);
    const [selectedLoading, setSelectedLoading] = useState(false);
    const [selectedError, setSelectedError] = useState<string | null>(null);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [categoriasManutencao, setCategoriasManutencao] = useState<CategoriaManutencao[]>([]);
    const [manutencaoOpen, setManutencaoOpen] = useState(false);
    const [manutencaoSaving, setManutencaoSaving] = useState(false);
    const [showExpensesChart, setShowExpensesChart] = useState(false);
    const [manutencaoForm, setManutencaoForm] = useState<ManutencaoForm>(DEFAULT_MANUTENCAO_FORM);
    const cacheRef = useRef(new Map<string, Record<string, unknown>>());

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
    const currencyFormatter = useMemo(
        () =>
            new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
            }),
        [],
    );

    const handleSelectDoc = useCallback(async (item: MasterDetailListItem) => {
        setSelectedDocId(item.id);
        setSelectedCollection(item.collection);
        setSelectedTipo(item.tipo);
        setSelectedError(null);
        if (item.collection === 'erp') {
            setSelectedDocData(erpRows.find((row) => row.docId === item.id)?.raw ?? null);
            setSelectedLoading(false);
            return;
        }
        const cacheKey = buildCacheKey(item.collection, item.id);
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
            setSelectedDocData(cached);
            setSelectedLoading(false);
            return;
        }

        setSelectedLoading(true);
        try {
            const docRef = doc(db, item.collection, item.id);
            const snapshot = await getDoc(docRef);
            if (!snapshot.exists()) {
                setSelectedDocData(null);
                setSelectedError('Documento não encontrado.');
                return;
            }
            const data = snapshot.data() as Record<string, unknown>;
            cacheRef.current.set(cacheKey, data);
            setSelectedDocData(data);
        } catch (err) {
            console.error('Erro ao carregar documento', err);
            setSelectedError('Não foi possível carregar o documento.');
        } finally {
            setSelectedLoading(false);
        }
    }, [erpRows]);

    const handleReloadSelected = useCallback(async () => {
        if (!selectedDocId || !selectedCollection) return;
        setSelectedLoading(true);
        setSelectedError(null);
        try {
            const docRef = doc(db, selectedCollection, selectedDocId);
            const snapshot = await getDoc(docRef);
            if (!snapshot.exists()) {
                setSelectedDocData(null);
                setSelectedError('Documento não encontrado.');
                return;
            }
            const data = snapshot.data() as Record<string, unknown>;
            cacheRef.current.set(buildCacheKey(selectedCollection, selectedDocId), data);
            setSelectedDocData(data);
            setSnackbar({ open: true, severity: 'success', message: 'Documento recarregado.' });
        } catch (err) {
            console.error('Erro ao recarregar documento', err);
            setSelectedError('Não foi possível recarregar o documento.');
        } finally {
            setSelectedLoading(false);
        }
    }, [selectedCollection, selectedDocId]);

    const handleUpdateField = useCallback(
        async (fieldPath: string, value: unknown) => {
            if (!selectedDocId || !selectedCollection) return;
            const docRef = doc(db, selectedCollection, selectedDocId);
            try {
                if (fieldPath.includes('.')) {
                    const field = new FieldPath(...fieldPath.split('.'));
                    await updateDoc(docRef, field, value);
                } else {
                    await updateDoc(docRef, { [fieldPath]: value });
                }
                setSelectedDocData((prev) => {
                    if (!prev) return prev;
                    const updated = { ...prev } as Record<string, unknown>;
                    if (fieldPath.includes('.')) {
                        setDeepValue(updated, fieldPath, value);
                    } else {
                        updated[fieldPath] = value;
                    }
                    cacheRef.current.set(buildCacheKey(selectedCollection, selectedDocId), updated);
                    return updated;
                });
                setSnackbar({ open: true, severity: 'success', message: 'Campo atualizado com sucesso.' });
            } catch (err) {
                console.error('Erro ao atualizar campo', err);
                setSnackbar({ open: true, severity: 'error', message: 'Erro ao atualizar campo.' });
                throw err;
            }
        },
        [selectedCollection, selectedDocId],
    );

    const handleDeleteField = useCallback(
        async (fieldPath: string) => {
            if (!selectedDocId || !selectedCollection) return;
            const confirmed = window.confirm(`Deseja remover o campo "${fieldPath}"?`);
            if (!confirmed) return;
            const docRef = doc(db, selectedCollection, selectedDocId);
            try {
                if (fieldPath.includes('.')) {
                    const field = new FieldPath(...fieldPath.split('.'));
                    await updateDoc(docRef, field, deleteField());
                } else {
                    await updateDoc(docRef, { [fieldPath]: deleteField() });
                }
                setSelectedDocData((prev) => {
                    if (!prev) return prev;
                    const updated = { ...prev } as Record<string, unknown>;
                    if (fieldPath.includes('.')) {
                        deleteDeepValue(updated, fieldPath);
                    } else {
                        delete updated[fieldPath];
                    }
                    cacheRef.current.set(buildCacheKey(selectedCollection, selectedDocId), updated);
                    return updated;
                });
                setSnackbar({ open: true, severity: 'success', message: 'Campo removido com sucesso.' });
            } catch (err) {
                console.error('Erro ao remover campo', err);
                setSnackbar({ open: true, severity: 'error', message: 'Erro ao remover campo.' });
                throw err;
            }
        },
        [selectedCollection, selectedDocId],
    );

    const handleDeleteDoc = useCallback(async () => {
        if (!selectedDocId || !selectedCollection) return;
        const confirmed = window.confirm('Deseja excluir este documento?');
        if (!confirmed) return;
        try {
            await deleteDoc(doc(db, selectedCollection, selectedDocId));
            if (selectedCollection === '03-combustivel') {
                setCombustivelRows((prev) => prev.filter((row) => row.docId !== selectedDocId));
            } else if (selectedCollection === 'manutencoes') {
                setManutencoes2026Rows((prev) => prev.filter((row) => row.docId !== selectedDocId));
            }
            cacheRef.current.delete(buildCacheKey(selectedCollection, selectedDocId));
            setSelectedDocId(null);
            setSelectedCollection(null);
            setSelectedTipo(null);
            setSelectedDocData(null);
            setSnackbar({ open: true, severity: 'success', message: 'Documento excluído com sucesso.' });
        } catch (err) {
            console.error('Erro ao excluir documento', err);
            setSnackbar({ open: true, severity: 'error', message: 'Erro ao excluir documento.' });
        }
    }, [selectedCollection, selectedDocId]);

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
                const item = await getItemFrota(id);
                if (!active) return;
                setVeiculo(item);
                if (!item) setError('Veículo não encontrado.');
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

    useEffect(() => {
        if (!manutencaoOpen || pessoas.length) return;
        listFuncionariosAtivos().then(setPessoas).catch((err) => console.error('Erro ao carregar funcionários', err));
    }, [manutencaoOpen, pessoas.length]);

    useEffect(() => {
        let active = true;

        async function loadFornecedores() {
            try {
                const fornecedoresQuery = query(collection(db, 'notas-fornecedores'), orderBy('nome'));
                const snapshot = await getDocs(fornecedoresQuery);
                if (!active) return;
                const data = snapshot.docs.map((docSnap) => {
                    const raw = docSnap.data() as { nome?: string; numero?: unknown };
                    return {
                        id: docSnap.id,
                        nome: raw.nome ?? '',
                        numero: normalizeFornecedorNumero(raw.numero),
                    };
                });
                setFornecedores(data);
            } catch (err) {
                console.error('Erro ao carregar fornecedores', err);
                if (active) setFornecedores([]);
            }
        }

        loadFornecedores();
        return () => {
            active = false;
        };
    }, []);

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
            } catch (err) {
                console.error('Erro ao carregar categorias', err);
                if (active) setCategoriasManutencao([]);
            }
        }

        loadCategorias();
        return () => {
            active = false;
        };
    }, []);

    const tipoVeiculo = veiculo?.categoria ?? 'PLACA';
    const tituloVeiculo = veiculo ? (veiculo.nome && veiculo.nome !== veiculo.identificador ? `${veiculo.identificador} — ${veiculo.nome}` : veiculo.identificador) : '';

    function openManutencaoDialog() {
        if (!veiculo) return;
        setManutencaoForm({
            ...DEFAULT_MANUTENCAO_FORM,
            itemFrotaId: veiculo.id,
            tipoVeiculo,
        });
        setManutencaoOpen(true);
    }

    function closeManutencaoDialog() {
        if (manutencaoSaving) return;
        setManutencaoOpen(false);
        setManutencaoForm(DEFAULT_MANUTENCAO_FORM);
    }

    async function handleSaveManutencao() {
        const validationError = getManutencaoValidationError(manutencaoForm);
        if (validationError || !veiculo) {
            setSnackbar({ open: true, severity: 'error', message: validationError ?? 'Veículo não encontrado.' });
            return;
        }

        setManutencaoSaving(true);
        try {
            const data =
                manutencaoForm.dataModo === 'MANUAL'
                    ? Timestamp.fromDate(new Date(manutencaoForm.dataManual))
                    : Timestamp.fromDate(new Date());
            const payload = buildManutencaoPayload(manutencaoForm, veiculo, data);
            const valor = payload.valor as number;
            const quantidade = payload.quantidade as number;
            const km = payload.km as number | undefined;
            const nota = payload.nota as string;
            const fornecedorNomeSnapshot = payload.fornecedorNomeSnapshot as string;
            const categoriaNomeSnapshot = payload.categoriaNomeSnapshot as string;

            const docRef = await addDoc(collection(db, 'manutencoes'), payload);

            const newRow: LinhaEvento = {
                id: `manutencoes_${docRef.id}`,
                docId: docRef.id,
                collection: 'manutencoes',
                origem: 'manutencao2026',
                tipo: 'MANUTENCAO',
                data: toDate(data),
                categoria: categoriaNomeSnapshot || null,
                categoriaId: manutencaoForm.categoriaId || null,
                categoriaNomeSnapshot: categoriaNomeSnapshot || null,
                valor,
                km: km ?? null,
                quantidade,
                fornecedor: fornecedorNomeSnapshot || null,
                fornecedorId: manutencaoForm.fornecedorId || null,
                fornecedorNomeSnapshot: fornecedorNomeSnapshot || null,
                motorista: motoristaNome(payload.motorista),
                descricao: manutencaoForm.descricao.trim() || null,
                nota: nota || null,
                status: manutencaoForm.status,
            };

            setManutencoes2026Rows((prev) =>
                [...prev, newRow].sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0)),
            );
            setShowManutencoes2026(true);
            cacheRef.current.set(buildCacheKey('manutencoes', docRef.id), payload as Record<string, unknown>);
            setSelectedDocId(docRef.id);
            setSelectedCollection('manutencoes');
            setSelectedTipo('manutencao2026');
            setSelectedDocData(payload as Record<string, unknown>);
            setSelectedError(null);
            setSnackbar({ open: true, severity: 'success', message: 'Manutenção adicionada com sucesso.' });
            setManutencaoOpen(false);
            setManutencaoForm(DEFAULT_MANUTENCAO_FORM);
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

    useEffect(() => {
        let active = true;

        async function loadCombustivel(itemId: string, identificador: string) {
            setCombustivelLoading(true);
            setCombustivelError(null);

            try {
                const snapshot = await getDocs(collection(db, '03-combustivel'));

                if (!active) return;

                const data: LinhaEvento[] = snapshot.docs.map(
                    (docSnap): LinhaEvento => {
                        const registro = normalizarMovimentoCombustivel(docSnap.data(), docSnap.id) as Combustivel;
                        const matches = registro.itemFrotaUid === itemId || (!registro.itemFrotaUid && registro.identificadorSnapshot === identificador);
                        if (!matches || registro.isFuelOutput === false) return null as unknown as LinhaEvento;
                        const categoria = registro.motivo ? registro.motivo : 'ABASTECIMENTO';
                        return {
                            id: `ab_${docSnap.id}`,
                            docId: docSnap.id,
                            collection: '03-combustivel',
                            origem: 'abastecimento',
                            tipo: 'ABASTECIMENTO',
                            data: toDate(registro.data),
                            qntAbastecida: registro.quantidadeAbastecida ?? null,
                            arla: registro.arla ?? null,
                            categoria,
                            valor: registro.valor ?? null,
                            obra: registro.obra ?? null,
                        };
                    },
                ).filter(Boolean);
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
        if (!veiculo) {
            setCombustivelRows([]);
            return;
        }

        loadCombustivel(veiculo.id, veiculo.identificador);
        return () => {
            active = false;
        };
    }, [showAbastecimento, veiculo]);

    useEffect(() => {
        let active = true;

        async function loadManutencoes2026(item: ItemFrotaV2) {
            setManutencoes2026Loading(true);
            setManutencoes2026Error(null);

            try {
                const data = await fetchManutencoes(item);
                if (!active) return;
                console.debug('[FrotaVeiculosDetalhes] manutencoes 2026 carregadas:', data.length);
                setManutencoes2026Rows(data);
            } catch (err) {
                console.error('Erro ao carregar manutenções 2026', err);
                if (active) {
                    setManutencoes2026Error('Erro ao carregar manutenções 2026.');
                }
            } finally {
                if (active) setManutencoes2026Loading(false);
            }
        }
        if (!showManutencoes2026) return;
        if (!veiculo) {
            setManutencoes2026Rows([]);
            return;
        }

        loadManutencoes2026(veiculo);
        return () => {
            active = false;
        };
    }, [showManutencoes2026, veiculo]);

    useEffect(() => {
        let active = true;
        if (!showAtividades) return;
        if (!veiculo) {
            setAtividadesRows([]);
            return;
        }
        setAtividadesLoading(true);
        setAtividadesError(null);
        fetchAtividades(veiculo)
            .then((data) => { if (active) setAtividadesRows(data); })
            .catch((err) => {
                console.error('Erro ao carregar atividades', err);
                if (active) setAtividadesError('Erro ao carregar atividades.');
            })
            .finally(() => { if (active) setAtividadesLoading(false); });
        return () => {
            active = false;
        };
    }, [showAtividades, veiculo]);

    useEffect(() => {
        let active = true;
        if (!showErp) return;
        if (!veiculo) {
            setErpRows([]);
            return;
        }
        setErpLoading(true);
        setErpError(null);
        setErpDiagnostico(null);
        const pedido = { placa: veiculo.identificador, ...resolveVehicleReportPeriod('all') };
        fetchManutencoesErp(veiculo, pedido)
            .then((data) => { if (active) setErpRows(data); })
            .catch((err) => {
                console.error('Erro ao consultar o ERP', err);
                if (!active) return;
                setErpError('Não foi possível consultar o ERP agora. Tente de novo.');
                setErpDiagnostico(describeErpCallError(err, pedido));
            })
            .finally(() => { if (active) setErpLoading(false); });
        return () => {
            active = false;
        };
    }, [showErp, veiculo]);

    const fornecedoresById = useMemo(() => {
        return new Map(fornecedores.map((item) => [item.id, item.nome]));
    }, [fornecedores]);

    const categoriasById = useMemo(() => {
        return new Map(categoriasManutencao.map((item) => [item.id, item.nome]));
    }, [categoriasManutencao]);

    const resolveManutencoes = useMemo(() => {
        return (rows: LinhaEvento[]) =>
            rows.map((row) => {
                const categoriaNome =
                    row.categoriaNomeSnapshot ||
                    (row.categoriaId && categoriasById.get(row.categoriaId)) ||
                    row.categoria ||
                    null;
                const fornecedorNome =
                    row.fornecedorNomeSnapshot ||
                    (row.fornecedorId && fornecedoresById.get(row.fornecedorId)) ||
                    row.fornecedor ||
                    null;
                return {
                    ...row,
                    categoria: categoriaNome,
                    fornecedor: fornecedorNome,
                };
            });
    }, [categoriasById, fornecedoresById]);

    const rowsManutencoes2026 = useMemo(() => {
        return resolveManutencoes(manutencoes2026Rows);
    }, [manutencoes2026Rows, resolveManutencoes]);

    const rowsByType = useMemo(() => {
        const merged: LinhaEvento[] = [];
        if (showAbastecimento) merged.push(...combustivelRows);
        if (showManutencoes2026) merged.push(...rowsManutencoes2026);
        if (showErp) merged.push(...erpRows);
        return merged.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
    }, [
        combustivelRows,
        erpRows,
        rowsManutencoes2026,
        showAbastecimento,
        showErp,
        showManutencoes2026,
    ]);

    const masterDetailItems = useMemo<MasterDetailListItem[]>(() => {
        const merged: MasterDetailListItem[] = [];
        if (showAtividades) {
            merged.push(
                ...atividadesRows.map((row) => ({
                    id: row.docId,
                    collection: row.collection,
                    tipo: row.origem,
                    data: row.data ?? null,
                    categoria: row.categoria ?? null,
                    valor: null,
                    valorTexto: row.valorTexto ?? null,
                })),
            );
        }
        if (showAbastecimento) {
            merged.push(
                ...combustivelRows.map((row) => ({
                    id: row.docId,
                    collection: row.collection,
                    tipo: row.origem,
                    data: row.data ?? null,
                    categoria: row.categoria ?? 'ABASTECIMENTO',
                    valor: row.valor ?? null,
                })),
            );
        }
        if (showManutencoes2026) {
            merged.push(
                ...rowsManutencoes2026.map((row) => ({
                    id: row.docId,
                    collection: row.collection,
                    tipo: row.origem,
                    data: row.data ?? null,
                    categoria: row.categoria ?? null,
                    valor: row.valor ?? null,
                })),
            );
        }
        if (showErp) {
            merged.push(
                ...erpRows.map((row) => ({
                    id: row.docId,
                    collection: row.collection,
                    tipo: row.origem,
                    data: row.data ?? null,
                    categoria: row.categoria ?? null,
                    valor: row.valor ?? null,
                })),
            );
        }
        return merged.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
    }, [
        atividadesRows,
        combustivelRows,
        erpRows,
        rowsManutencoes2026,
        showAbastecimento,
        showAtividades,
        showErp,
        showManutencoes2026,
    ]);

    const masterDetailCounts = useMemo<MasterDetailCounts>(
        () => ({
            atividades: atividadesRows.length,
            abastecimento: combustivelRows.length,
            manutencoes2026: manutencoes2026Rows.length,
            manutencoesErp: erpRows.length,
        }),
        [atividadesRows.length, combustivelRows.length, erpRows.length, manutencoes2026Rows.length],
    );

    const masterDetailFilters = useMemo<MasterDetailFilters>(
        () => ({
            atividades: showAtividades,
            abastecimento: showAbastecimento,
            manutencoes2026: showManutencoes2026,
            manutencoesErp: showErp,
        }),
        [showAbastecimento, showAtividades, showErp, showManutencoes2026],
    );

    const masterDetailLoading =
        (showAtividades && atividadesLoading) ||
        (showAbastecimento && combustivelLoading) ||
        (showManutencoes2026 && manutencoes2026Loading) ||
        (showErp && erpLoading);

    const masterDetailError = useMemo(() => {
        const errors: string[] = [];
        if (showAtividades && atividadesError) errors.push(atividadesError);
        if (showAbastecimento && combustivelError) errors.push(combustivelError);
        if (showManutencoes2026 && manutencoes2026Error) errors.push(manutencoes2026Error);
        if (showErp && erpError) errors.push(erpError);
        if (errors.length === 0) return null;
        return errors.join(' ');
    }, [
        atividadesError,
        combustivelError,
        erpError,
        manutencoes2026Error,
        showAbastecimento,
        showAtividades,
        showErp,
        showManutencoes2026,
    ]);

    const hasActiveFilters = showAtividades || showAbastecimento || showManutencoes2026 || showErp;

    useEffect(() => {
        if (!hasActiveFilters) {
            setSelectedDocId(null);
            setSelectedCollection(null);
            setSelectedTipo(null);
            setSelectedDocData(null);
            setSelectedError(null);
            return;
        }
        if (!selectedDocId || !selectedCollection) return;
        const stillExists = masterDetailItems.some(
            (item) => item.id === selectedDocId && item.collection === selectedCollection,
        );
        if (!stillExists) {
            setSelectedDocId(null);
            setSelectedCollection(null);
            setSelectedTipo(null);
            setSelectedDocData(null);
            setSelectedError(null);
        }
    }, [hasActiveFilters, masterDetailItems, selectedCollection, selectedDocId]);

    const handleToggleFilter = useCallback((key: keyof MasterDetailFilters, value: boolean) => {
        if (key === 'atividades') {
            setShowAtividades(value);
        } else if (key === 'abastecimento') {
            setShowAbastecimento(value);
        } else if (key === 'manutencoes2026') {
            setShowManutencoes2026(value);
        } else if (key === 'manutencoesErp') {
            setShowErp(value);
        }
    }, []);

    const despesasPorNatureza = useMemo<ChartPoint[]>(() => {
        const acc = new Map<string, number>();

        rowsByType.forEach((row) => {
            const rawNatureza = row.categoria ?? row.tipo;
            const natureza = typeof rawNatureza === 'string' ? rawNatureza.trim() : '';
            const label = natureza || 'Sem natureza';

            const valor = asNumber(row.valor) ?? 0;
            acc.set(label, (acc.get(label) ?? 0) + valor);
        });

        return Array.from(acc.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [rowsByType]);

    const handleGenerateReport = async (option: VehicleReportPeriod) => {
        if (!veiculo || generatingReport) return;
        setReportMenuAnchor(null);
        const vehiclePlate = veiculo.identificador;
        if (!vehiclePlate) {
            setSnackbar({ open: true, severity: 'error', message: 'A placa do veículo não está disponível.' });
            return;
        }
        const { dataInicial, dataFinal } = resolveVehicleReportPeriod(option);
        try {
            setGeneratingReport(true);
            const report = await buildVehicleReport({ placa: vehiclePlate, vehicleId: veiculo.id, vehicleName: tituloVeiculo, dataInicial, dataFinal });
            const file = createVehicleReportPdf(report);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.download = `Relatorio-Custos-${vehiclePlate.replace(/[^A-Za-z0-9-]/g, '')}-${dataInicial}-${dataFinal}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error('Erro ao gerar relatório veicular', err);
            setSnackbar({ open: true, severity: 'error', message: 'Relatório não gerado: uma fonte Firestore, ERP ou PDF falhou.' });
        } finally { setGeneratingReport(false); }
    };

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
                <Button variant="outlined" onClick={() => navigate('/frota/veiculos')}>
                    Voltar para Veículos
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
                    <Button variant="outlined" onClick={() => navigate('/frota/veiculos')}>
                        Voltar para Veículos
                    </Button>
                    {veiculo && (
                        <>
                            <Button variant="outlined" onClick={() => navigate(`/frota/analytics?veiculo=${encodeURIComponent(veiculo.id)}`)}>Ver no Analytics</Button>
                            <Button variant="contained" onClick={(event) => setReportMenuAnchor(event.currentTarget)} disabled={generatingReport}>{generatingReport ? 'Gerando Relatório...' : 'Gerar Relatório'}</Button>
                            <Menu anchorEl={reportMenuAnchor} open={Boolean(reportMenuAnchor)} onClose={() => setReportMenuAnchor(null)}>
                                <MenuItem disabled>Gerar relatório</MenuItem>
                                <Stack direction="row" spacing={0.5} sx={{ px: 1, pb: 1 }}>
                                    <Button size="small" onClick={() => handleGenerateReport('25')}>25</Button>
                                    <Button size="small" onClick={() => handleGenerateReport('26')}>26</Button>
                                    <Button size="small" onClick={() => handleGenerateReport('all')}>Todo</Button>
                                </Stack>
                            </Menu>
                        </>
                    )}
                </Stack>
            </Stack>

            {veiculo && (() => {
                const atualizacao = atualizacaoInfo(veiculo.dataUltimaAtualizacao);
                const ultima = toDate(veiculo.dataUltimaAtualizacao);
                const medidor = tipoVeiculo === 'PLACA' ? 'KM' : 'Horímetro';
                const corFrescor = { recente: 'text.secondary', atencao: 'warning.dark', antiga: 'error.main', 'sem-dado': 'text.disabled' }[atualizacao.frescor];
                return (
                    <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700, letterSpacing: 0.5 }}>{veiculo.identificador}</Typography>
                            <Chip label={tipoVeiculo} size="small" variant="outlined" />
                            <Chip label={veiculo.situacao ?? (veiculo.ativo ? 'ativo' : 'inativo')} size="small" color={veiculo.ativo ? 'success' : 'default'} />
                        </Stack>
                        <Typography sx={{ fontSize: { xs: 17, sm: 20 } }} color="text.secondary">{veiculo.nome}</Typography>
                        <Box sx={{ mt: 2.5, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
                            <Box>
                                <Typography variant="body2" color="text.secondary">{medidor} último</Typography>
                                <Typography sx={{ fontSize: { xs: 22, sm: 28 }, fontWeight: 700 }}>{medidorTexto(veiculo)}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary">Última atualização</Typography>
                                <Typography sx={{ fontSize: { xs: 18, sm: 22 }, fontWeight: 600 }}>{ultima ? dateFormatter.format(ultima) : '—'}</Typography>
                                <Typography variant="body2" color={corFrescor}>{atualizacao.texto}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary">{medidor} inicial</Typography>
                                <Typography sx={{ fontSize: { xs: 18, sm: 22 }, fontWeight: 600 }}>
                                    {medidorTexto({ categoria: veiculo.categoria, quilometragemUltima: veiculo.quilometragemInicial })}
                                </Typography>
                            </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                            O cadastro do veículo é feito no Friday (veiculos-v2).
                        </Typography>
                    </Paper>
                );
            })()}

            <Box mt={3}>
                <RegistrosFiltros filters={masterDetailFilters} counts={masterDetailCounts} onToggleFilter={handleToggleFilter} />
            </Box>

            <Box mt={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="stretch">
                    <Stack flex={1} sx={{ minWidth: 280, maxWidth: { md: 460 } }}>
                        <ManutencoesList
                            items={masterDetailItems}
                            loading={masterDetailLoading}
                            error={masterDetailError}
                            selectedId={selectedDocId}
                            selectedCollection={selectedCollection}
                            filters={masterDetailFilters}
                            onSelect={handleSelectDoc}
                        />
                    </Stack>
                    <Stack flex={2} sx={{ minWidth: 280 }}>
                        <ManutencaoDetailPanel
                            selectedDocId={selectedDocId}
                            selectedDocData={selectedDocData}
                            selectedTipo={selectedTipo}
                            loading={selectedLoading}
                            isAdmin={isAdmin}
                            diagnostico={isAdmin && showErp ? erpDiagnostico : null}
                            error={selectedError}
                            onReload={handleReloadSelected}
                            onAdd={openManutencaoDialog}
                            onDeleteDoc={handleDeleteDoc}
                            onUpdateField={handleUpdateField}
                            onDeleteField={handleDeleteField}
                        />
                        {!isAdmin && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                Você está em modo leitura. Apenas administradores podem editar ou excluir campos.
                            </Alert>
                        )}
                    </Stack>
                </Stack>
            </Box>           

            <Box mt={3}>
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Typography variant="h6">Despesas por natureza</Typography>
                    <Button variant="text" onClick={() => setShowExpensesChart(value => !value)}>
                        {showExpensesChart ? 'Ocultar gráfico' : 'Exibir gráfico'}
                    </Button>
                </Stack>

                {showExpensesChart && (despesasPorNatureza.length === 0 ? (
                    <Typography variant="body2">Sem dados para exibir.</Typography>
                ) : (
                    <Suspense fallback={<CircularProgress size={28} />}>
                        <FrotaCharts
                            data={despesasPorNatureza}
                            title="Despesas por natureza"
                            xAxisTitle="Natureza"
                            yAxisTitle="Total"
                            xAxisTickAngle={-30}
                            valueFormatter={(value) => currencyFormatter.format(value)}
                        />
                    </Suspense>
                ))}
            </Box>

            <ManutencaoDialog
                open={manutencaoOpen}
                saving={manutencaoSaving}
                form={manutencaoForm}
                veiculos={veiculo ? [veiculo] : []}
                pessoas={pessoas}
                fornecedores={fornecedores}
                categoriasManutencao={categoriasManutencao}
                disableVehicleSelection
                onClose={closeManutencaoDialog}
                onSave={handleSaveManutencao}
                onChange={(updater) => setManutencaoForm((prev) => updater(prev))}
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
