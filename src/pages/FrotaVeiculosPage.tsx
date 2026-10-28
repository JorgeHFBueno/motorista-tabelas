import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    ButtonBase,
    Chip,
    CircularProgress,
    Container,
    InputAdornment,
    Paper,
    Snackbar,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { Timestamp, addDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import ManutencaoDialog from '../components/ManutencaoDialog';
import {
    buildManutencaoPayload,
    type CategoriaManutencao,
    DEFAULT_MANUTENCAO_FORM,
    type Fornecedor,
    getManutencaoValidationError,
    type ManutencaoForm,
} from '../components/manutencaoFormShared';
import { db } from '../firebase';
import { normalizeFornecedorNumero } from '../services/fornecedores.service';
import { listFuncionariosAtivos } from '../services/funcionarios-selecao.service';
import { listItensFrota } from '../services/veiculos.service';
import type { ItemFrotaV2, PessoaV2 } from '../utils/cadastrosV2';
import { atualizacaoInfo, filtrarVeiculos, type FiltroCategoria, type Frescor, medidorTexto } from '../utils/frotaVeiculosLista';

// Frota de veiculos-v2, só leitura: o cadastro é do Friday (The Manuscript, 03_APLICACAO_WEB/05_CADASTROS.md).
// A foto entra com o grupo `fotos` do cadastro (Storage do Friday); até lá, a coluna mostra o espaço reservado.

const COR_FRESCOR: Record<Frescor, string> = {
    recente: 'text.secondary',
    atencao: 'warning.dark',
    antiga: 'error.main',
    'sem-dado': 'text.disabled',
};

function VeiculoLinha({ item, onOpen }: { item: ItemFrotaV2; onOpen: () => void }) {
    const atualizacao = atualizacaoInfo(item.dataUltimaAtualizacao);
    return (
        <ButtonBase
            onClick={onOpen}
            sx={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: { xs: '56px minmax(0, 1fr)', sm: '72px minmax(0, 1fr) 220px' },
                columnGap: 2,
                rowGap: 0.5,
                alignItems: 'center',
                textAlign: 'left',
                px: 2,
                py: 1.5,
                '&:hover': { bgcolor: 'action.hover' },
            }}
        >
            <Box
                aria-hidden
                sx={{
                    gridRow: { xs: 'span 2', sm: 'auto' },
                    width: { xs: 56, sm: 72 },
                    height: { xs: 42, sm: 54 },
                    borderRadius: 1,
                    border: '1px dashed',
                    borderColor: 'divider',
                    bgcolor: 'action.hover',
                    color: 'text.disabled',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <PhotoCameraOutlinedIcon fontSize="small" />
            </Box>
            <Box minWidth={0}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }} noWrap>
                        {item.identificador}
                    </Typography>
                    {!item.ativo && <Chip label="Inativo" size="small" />}
                </Stack>
                <Typography sx={{ fontSize: 15 }} color="text.secondary" noWrap>
                    {item.nome}
                </Typography>
            </Box>
            <Box sx={{ gridColumn: { xs: 2, sm: 3 }, textAlign: { xs: 'left', sm: 'right' } }}>
                <Typography sx={{ fontSize: { xs: 17, sm: 20 }, fontWeight: 600 }}>{medidorTexto(item)}</Typography>
                <Typography sx={{ fontSize: 13 }} color={COR_FRESCOR[atualizacao.frescor]}>
                    {atualizacao.texto}
                </Typography>
            </Box>
        </ButtonBase>
    );
}

export default function FrotaVeiculosPage() {
    const navigate = useNavigate();
    const [categoria, setCategoria] = useState<FiltroCategoria>('TODOS');
    const [busca, setBusca] = useState('');
    const [veiculos, setVeiculos] = useState<ItemFrotaV2[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manutencaoOpen, setManutencaoOpen] = useState(false);
    const [manutencaoSaving, setManutencaoSaving] = useState(false);
    const [manutencaoForm, setManutencaoForm] = useState<ManutencaoForm>(DEFAULT_MANUTENCAO_FORM);
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

        if (!manutencaoOpen || categoriasLoaded) return () => {
            active = false;
        };

        loadCategorias();
        return () => {
            active = false;
        };
    }, [manutencaoOpen, categoriasLoaded]);

    const contagem = useMemo(() => ({
        TODOS: veiculos.length,
        PLACA: veiculos.filter((item) => item.categoria === 'PLACA').length,
        EXTRA: veiculos.filter((item) => item.categoria === 'EXTRA').length,
    }), [veiculos]);

    const rows = useMemo(() => filtrarVeiculos(veiculos, busca, categoria), [busca, categoria, veiculos]);

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
            await addDoc(collection(db, 'manutencoes'), buildManutencaoPayload(manutencaoForm, item, data));
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
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Typography variant="h4">Veículos</Typography>
                <Button variant="outlined" size="small" onClick={openManutencaoDialog}>
                    Adicionar manutenção
                </Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={3} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                    size="small"
                    placeholder="Buscar placa ou nome"
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    sx={{ flex: 1 }}
                    slotProps={{
                        input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
                        htmlInput: { 'aria-label': 'Buscar placa ou nome' },
                    }}
                />
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={categoria}
                    onChange={(_event, value: FiltroCategoria | null) => { if (value) setCategoria(value); }}
                    aria-label="Filtro por categoria"
                >
                    <ToggleButton value="TODOS">Todos {contagem.TODOS}</ToggleButton>
                    <ToggleButton value="PLACA">PLACA {contagem.PLACA}</ToggleButton>
                    <ToggleButton value="EXTRA">EXTRA {contagem.EXTRA}</ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            <Box mt={3}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {loading ? (
                    <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
                ) : rows.length > 0 ? (
                    <Paper variant="outlined" sx={{ overflow: 'hidden', '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                        {rows.map((item) => (
                            <VeiculoLinha
                                key={item.id}
                                item={item}
                                onOpen={() => navigate(`/frota/veiculos/${encodeURIComponent(item.id)}`)}
                            />
                        ))}
                    </Paper>
                ) : !error && (
                    <Alert severity="info">Nenhum veículo encontrado.</Alert>
                )}
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
