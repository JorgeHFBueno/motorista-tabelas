import { createFilterOptions } from '@mui/material';
import { itemFrotaSnapshot, type ItemFrotaV2 } from '../utils/cadastrosV2';

// Manutenção liga o veículo por item_frota_id (veiculos-v2) e a pessoa por UID (funcionarios), com snapshots ao lado
// (The Manuscript, 01_FIRESTORE/COLECOES/manutencoes.md). `identificador` (placa em texto) ficou nos registros
// migrados só como registro do formato antigo; `motorista` em texto ainda aparece em manutencoes-legado.
export type TipoVeiculo = 'PLACA' | 'EXTRA';

export type ManutencaoForm = {
    itemFrotaId: string;
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
    motoristaUid: string | null;
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
    itemFrotaId: '',
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
    motoristaUid: null,
    motorista: '',
    nota: '',
    status: 'NORMAL',
};

export const ABASTECIMENTO_EXTERNO = 'ABASTECIMENTO EXTERNO';

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
    if (!form.itemFrotaId || !form.tipoVeiculo) {
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

/** Documento novo de `manutencoes`. */
export function buildManutencaoPayload(form: ManutencaoForm, item: ItemFrotaV2, data: unknown): Record<string, unknown> {
    const kmValue = form.km.trim();
    const motorista = form.motorista.trim();
    return {
        item_frota_id: item.id,
        item_frota_snapshot: itemFrotaSnapshot(item),
        tipoVeiculo: item.categoria,
        categoriaId: form.categoriaId,
        categoriaNomeSnapshot: form.categoriaNomeSnapshot.trim(),
        valor: Number(form.valor),
        quantidade: Number(form.quantidade),
        ...(kmValue ? { km: Number(kmValue) } : {}),
        fornecedorId: form.fornecedorId,
        fornecedorNomeSnapshot: form.fornecedorNomeSnapshot.trim(),
        motorista: motorista ? { uid: form.motoristaUid, nome: motorista } : null,
        descricao: form.descricao.trim(),
        nota: form.nota.trim(),
        status: form.status,
        data,
    };
}

/** Nome da pessoa: `{uid, nome}` no formato novo, texto no antigo. */
export function motoristaNome(value: unknown): string | null {
    if (typeof value === 'string') return value.trim() || null;
    if (value && typeof value === 'object' && typeof (value as { nome?: unknown }).nome === 'string') {
        return (value as { nome: string }).nome.trim() || null;
    }
    return null;
}
