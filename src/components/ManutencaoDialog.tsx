import AddIcon from '@mui/icons-material/Add';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormLabel,
    Radio,
    RadioGroup,
    Stack,
    TextField,
} from '@mui/material';
import { useMemo, useState } from 'react';
import {
    ABASTECIMENTO_EXTERNO,
    type CategoriaManutencao,
    formatValorManutencao,
    fornecedorFilterOptions,
    type Fornecedor,
    getFornecedorOptionLabel,
    type ManutencaoForm,
} from './manutencaoFormShared';
import { createFornecedorComNumero, getFornecedorNumeroErrorMessage } from '../services/fornecedores.service';
import { itemFrotaLabel, type ItemFrotaV2, type PessoaV2 } from '../utils/cadastrosV2';

interface ManutencaoDialogProps {
    open: boolean;
    title?: string;
    saving: boolean;
    form: ManutencaoForm;
    veiculos: ItemFrotaV2[];
    /** Pessoas ativas de funcionarios, para o motorista do abastecimento externo. */
    pessoas: PessoaV2[];
    fornecedores: Fornecedor[];
    categoriasManutencao: CategoriaManutencao[];
    fornecedoresLoading?: boolean;
    categoriasLoading?: boolean;
    disableVehicleSelection?: boolean;
    onClose: () => void;
    onSave: () => void;
    onChange: (updater: (prev: ManutencaoForm) => ManutencaoForm) => void;
    /** Fornecedor criado pelo "Novo fornecedor", para a página incluir na lista. */
    onFornecedorCriado: (fornecedor: Fornecedor) => void;
}

/**
 * "Novo fornecedor" sem sair da manutenção: cria em notas-fornecedores com o número automático de Cadastros.
 * Fica dentro do Dialog, então o estado zera quando ele fecha.
 */
function NovoFornecedor({ fornecedores, onCriado }: { fornecedores: Fornecedor[]; onCriado: (fornecedor: Fornecedor) => void }) {
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [criando, setCriando] = useState(false);

    function fechar() {
        setAberto(false);
        setNome('');
        setErro(null);
    }

    async function criar() {
        const nomeTrim = nome.trim();
        if (!nomeTrim) {
            setErro('Informe o nome do fornecedor.');
            return;
        }
        const repetido = fornecedores.find((item) => item.nome.trim().toLowerCase() === nomeTrim.toLowerCase());
        if (repetido) {
            setErro(`Já existe: ${getFornecedorOptionLabel(repetido)}. Selecione-o na lista.`);
            return;
        }
        setCriando(true);
        setErro(null);
        try {
            const { id, numero } = await createFornecedorComNumero({ nome: nomeTrim, descricao: '' });
            onCriado({ id, nome: nomeTrim, numero });
            fechar();
        } catch (error) {
            console.error('Erro ao criar fornecedor', error);
            setErro(getFornecedorNumeroErrorMessage(error) ?? 'Não foi possível criar o fornecedor.');
        } finally {
            setCriando(false);
        }
    }

    if (!aberto) {
        return (
            <Box mt={-1}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setAberto(true)}>
                    Novo fornecedor
                </Button>
            </Box>
        );
    }

    return (
        <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                    label="Nome do novo fornecedor"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void criar();
                        }
                    }}
                    disabled={criando}
                    size="small"
                    autoFocus
                    fullWidth
                />
                <Button variant="contained" onClick={() => void criar()} disabled={criando}>
                    {criando ? 'Criando...' : 'Criar'}
                </Button>
                <Button onClick={fechar} disabled={criando}>
                    Cancelar
                </Button>
            </Stack>
            {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
    );
}

export default function ManutencaoDialog({
    open,
    title = 'Adicionar Manutenção',
    saving,
    form,
    veiculos,
    pessoas,
    fornecedores,
    categoriasManutencao,
    fornecedoresLoading = false,
    categoriasLoading = false,
    disableVehicleSelection = false,
    onClose,
    onSave,
    onChange,
    onFornecedorCriado,
}: ManutencaoDialogProps) {
    const veiculoSelecionado = useMemo(
        () => veiculos.find((item) => item.id === form.itemFrotaId) ?? null,
        [form.itemFrotaId, veiculos],
    );
    const fornecedorSelecionado = useMemo(
        () => fornecedores.find((item) => item.id === form.fornecedorId) ?? null,
        [fornecedores, form.fornecedorId],
    );
    const categoriaSelecionada = useMemo(
        () => categoriasManutencao.find((item) => item.id === form.categoriaId) ?? null,
        [categoriasManutencao, form.categoriaId],
    );
    const isAbastecimentoExterno = form.categoriaNomeSnapshot === ABASTECIMENTO_EXTERNO;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} mt={1}>
                    <Autocomplete
                        options={veiculos}
                        value={veiculoSelecionado}
                        getOptionLabel={itemFrotaLabel}
                        onChange={(_event, value) =>
                            onChange((prev) => ({
                                ...prev,
                                itemFrotaId: value?.id ?? '',
                                tipoVeiculo: value?.categoria ?? '',
                            }))
                        }
                        renderInput={(params) => <TextField {...params} label="Veículo" required />}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        disabled={disableVehicleSelection}
                    />
                    <Autocomplete
                        options={categoriasManutencao}
                        value={categoriaSelecionada}
                        getOptionLabel={(option) => option.nome}
                        onChange={(_event, value) =>
                            onChange((prev) => ({
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
                            value={form.dataModo}
                            onChange={(event) =>
                                onChange((prev) => ({
                                    ...prev,
                                    dataModo: event.target.value as ManutencaoForm['dataModo'],
                                }))
                            }
                        >
                            <FormControlLabel value="ATUAL" control={<Radio />} label="Atual" />
                            <FormControlLabel value="MANUAL" control={<Radio />} label="Manual" />
                        </RadioGroup>
                        {form.dataModo === 'MANUAL' && (
                            <TextField
                                label="Data e hora (local)"
                                type="datetime-local"
                                value={form.dataManual}
                                onChange={(event) =>
                                    onChange((prev) => ({
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
                        value={form.valor}
                        onChange={(event) => onChange((prev) => ({ ...prev, valor: event.target.value }))}
                        onBlur={() => onChange((prev) => ({ ...prev, valor: formatValorManutencao(prev.valor) }))}
                        placeholder="R$ 1.234,56"
                        helperText="Digite só os números: 123456 vira R$ 1.234,56"
                        inputProps={{ inputMode: 'decimal' }}
                        fullWidth
                        required
                    />
                    <TextField
                        label="Quantidade"
                        type="number"
                        value={form.quantidade}
                        onChange={(event) => onChange((prev) => ({ ...prev, quantidade: event.target.value }))}
                        inputProps={{ className: 'no-number-spinner' }}
                        fullWidth
                        required
                    />
                    <TextField
                        label="KM"
                        type="number"
                        value={form.km}
                        onChange={(event) => onChange((prev) => ({ ...prev, km: event.target.value }))}
                        inputProps={{ className: 'no-number-spinner' }}
                        fullWidth
                    />
                    <Autocomplete
                        options={fornecedores}
                        value={fornecedorSelecionado}
                        getOptionLabel={getFornecedorOptionLabel}
                        filterOptions={fornecedorFilterOptions}
                        onChange={(_event, value) =>
                            onChange((prev) => ({
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
                    <NovoFornecedor
                        fornecedores={fornecedores}
                        onCriado={(fornecedor) => {
                            onFornecedorCriado(fornecedor);
                            onChange((prev) => ({
                                ...prev,
                                fornecedorId: fornecedor.id,
                                fornecedorNomeSnapshot: fornecedor.nome,
                            }));
                        }}
                    />
                    {isAbastecimentoExterno && (
                        <Autocomplete
                            freeSolo
                            options={pessoas}
                            value={pessoas.find((item) => item.uid === form.motoristaUid) ?? (form.motorista || null)}
                            getOptionLabel={(option) => (typeof option === 'string' ? option : option.nome)}
                            isOptionEqualToValue={(option, value) =>
                                typeof option !== 'string' && typeof value !== 'string' && option.uid === value.uid}
                            onChange={(_event, value) =>
                                onChange((prev) => (typeof value === 'string' || !value
                                    ? { ...prev, motoristaUid: null, motorista: value ?? '' }
                                    : { ...prev, motoristaUid: value.uid, motorista: value.nome }))
                            }
                            onInputChange={(_event, value, reason) => {
                                if (reason === 'input') onChange((prev) => ({ ...prev, motoristaUid: null, motorista: value }));
                            }}
                            renderInput={(params) => (
                                <TextField {...params} label="Motorista" helperText="Nome digitado fica sem UID" required />
                            )}
                        />
                    )}
                    <TextField
                        label="Descrição"
                        value={form.descricao}
                        onChange={(event) => onChange((prev) => ({ ...prev, descricao: event.target.value }))}
                        fullWidth
                        multiline
                        minRows={2}
                    />
                    <TextField
                        label="Nota"
                        value={form.nota}
                        onChange={(event) => onChange((prev) => ({ ...prev, nota: event.target.value }))}
                        fullWidth
                        multiline
                        minRows={2}
                    />
                    <FormControl>
                        <FormLabel>Status</FormLabel>
                        <RadioGroup
                            row
                            value={form.status}
                            onChange={(event) =>
                                onChange((prev) => ({
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
                <Button onClick={onClose} disabled={saving}>
                    Cancelar
                </Button>
                <Button onClick={onSave} variant="contained" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
