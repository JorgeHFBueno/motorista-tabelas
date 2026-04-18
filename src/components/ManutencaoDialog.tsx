import {
    Autocomplete,
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
import { useMemo } from 'react';
import {
    ABASTECIMENTO_EXTERNO,
    type CategoriaManutencao,
    fornecedorFilterOptions,
    type Fornecedor,
    getFornecedorOptionLabel,
    getVeiculoLabel,
    type ManutencaoForm,
    type VeiculoOption,
} from './manutencaoFormShared';

interface ManutencaoDialogProps {
    open: boolean;
    title?: string;
    saving: boolean;
    form: ManutencaoForm;
    veiculos: VeiculoOption[];
    fornecedores: Fornecedor[];
    categoriasManutencao: CategoriaManutencao[];
    fornecedoresLoading?: boolean;
    categoriasLoading?: boolean;
    disableVehicleSelection?: boolean;
    onClose: () => void;
    onSave: () => void;
    onChange: (updater: (prev: ManutencaoForm) => ManutencaoForm) => void;
}

export default function ManutencaoDialog({
    open,
    title = 'Adicionar Manutenção',
    saving,
    form,
    veiculos,
    fornecedores,
    categoriasManutencao,
    fornecedoresLoading = false,
    categoriasLoading = false,
    disableVehicleSelection = false,
    onClose,
    onSave,
    onChange,
}: ManutencaoDialogProps) {
    const veiculoSelecionado = useMemo(
        () => veiculos.find((item) => item.id === form.identificador) ?? null,
        [form.identificador, veiculos],
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
                        getOptionLabel={getVeiculoLabel}
                        onChange={(_event, value) =>
                            onChange((prev) => ({
                                ...prev,
                                identificador: value?.id ?? '',
                                tipoVeiculo: (value?.categoria as ManutencaoForm['tipoVeiculo']) ?? '',
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
                        type="number"
                        value={form.valor}
                        onChange={(event) => onChange((prev) => ({ ...prev, valor: event.target.value }))}
                        inputProps={{ className: 'no-number-spinner' }}
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
                    {isAbastecimentoExterno && (
                        <TextField
                            label="Motorista"
                            value={form.motorista}
                            onChange={(event) => onChange((prev) => ({ ...prev, motorista: event.target.value }))}
                            fullWidth
                            required
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
