import { createFilterOptions } from '@mui/material';

export type TipoVeiculo = 'PLACA' | 'EXTRA';

export type VeiculoOption = {
    id: string;
    categoria?: string;
    placa?: string;
    extra?: string;
};

export type ManutencaoForm = {
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

export type Fornecedor = {
    id: string;
    nome: string;
    numero: number | null;
};

export type CategoriaManutencao = {
    id: string;
    nome: string;
};

export const DEFAULT_MANUTENCAO_FORM: ManutencaoForm = {
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

export const ABASTECIMENTO_EXTERNO = 'ABASTECIMENTO EXTERNO';

export function getVeiculoLabel(veiculo: VeiculoOption | null): string {
    if (!veiculo) return '';
    if (veiculo.categoria === 'PLACA') return veiculo.placa ?? '';
    if (veiculo.categoria === 'EXTRA') return veiculo.extra ?? '';
    return veiculo.placa ?? veiculo.extra ?? '';
}

export function getFornecedorOptionLabel(fornecedor: Fornecedor | null): string {
    if (!fornecedor) return '';
    const nome = fornecedor.nome.trim();
    if (fornecedor.numero) {
        return nome ? `${fornecedor.numero}-${nome}` : String(fornecedor.numero);
    }
    return nome;
}

export const fornecedorFilterOptions = createFilterOptions<Fornecedor>({
    stringify: (option) =>
        [getFornecedorOptionLabel(option), option.numero?.toString() ?? '', option.nome].join(' '),
});

export function getManutencaoValidationError(form: ManutencaoForm): string | null {
    if (!form.identificador || !form.tipoVeiculo) {
        return 'Selecione o veículo da manutenção.';
    }

    if (!form.categoriaId) {
        return 'Selecione a categoria da manutenção.';
    }

    const valor = Number(form.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
        return 'Valor da manutenção deve ser um número válido maior que zero.';
    }

    const quantidade = Number(form.quantidade);
    if (!Number.isFinite(quantidade) || quantidade < 1) {
        return 'Quantidade deve ser um número válido maior ou igual a 1.';
    }

    const kmValue = form.km.trim();
    if (kmValue) {
        const km = Number(kmValue);
        if (!Number.isInteger(km) || km < 0) {
            return 'KM deve ser um número inteiro maior ou igual a 0.';
        }
    }

    if (!form.fornecedorId) {
        return 'Fornecedor é obrigatório.';
    }

    if (form.categoriaNomeSnapshot === ABASTECIMENTO_EXTERNO && !form.motorista.trim()) {
        return 'Motorista é obrigatório para abastecimento externo.';
    }

    if (form.dataModo === 'MANUAL') {
        if (!form.dataManual.trim()) {
            return 'Informe a data e hora da manutenção.';
        }
        const parsed = new Date(form.dataManual);
        if (Number.isNaN(parsed.getTime())) {
            return 'Data/hora informada é inválida.';
        }
    }

    return null;
}
