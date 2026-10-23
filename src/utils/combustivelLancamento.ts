// /combustivel/novo: saídas V2 lançadas pelo responsável (The Manuscript, 02_PROCESSOS/combustivel-saida-v2.md,
// "Lançamento pela WEB"). Funções puras; a gravação está em src/services/combustivelFirestore.ts.
//
// - Lançamento atual: a data é posterior ao último registro do ledger. Parte do estado da bomba e o atualiza.
// - Correção de furo: a data cai entre dois registros. Uma ou mais saídas preenchem o salto do montante entre o
//   registro anterior e o seguinte; o montante atual e o último abastecimento da bomba não mudam. Se o salto já está
//   coberto pelo "Ajuste de montante" automático, as saídas tomam o lugar dele (o estoque não muda); senão, o total
//   é descontado do estoque atual.
import { itemFrotaSnapshot, obraSnapshot, type ItemFrotaV2, type ObraV2 } from './cadastrosV2';

export const AJUSTE_MOTIVO = 'Ajuste de montante';
export const SEM_ODOMETRO = 'Sem Odometro';

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
const intOrNull = (value: unknown) => (isInt(value) ? value : null);

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate();
  return null;
}

/** Posição de um registro de 03-combustivel no encadeamento do montante e do estoque (inteiros ×10). */
export interface RegistroLedger {
  id: string;
  data: Date;
  tipo: 'saida' | 'entrada' | null;
  motivo: string;
  quantidade: number | null;
  montanteAntes: number | null;
  montanteFinal: number | null;
  estoqueAntes: number | null;
  estoqueFinal: number | null;
  valor: number | null;
}

export function registroLedgerFrom(id: string, raw: Record<string, unknown>): RegistroLedger | null {
  const data = toDate(raw.data);
  if (!data) return null;
  const tipo: RegistroLedger['tipo'] = raw.tipo === 'saida' || raw.tipo === 'entrada' ? raw.tipo : null;
  const base = { id, data, tipo, motivo: typeof raw.motivo === 'string' ? raw.motivo : '', valor: intOrNull(raw.valorAbastecimento) };
  if (tipo === 'entrada') {
    const montante = intOrNull(raw.montanteSnapshot);
    return { ...base, quantidade: intOrNull(raw.litrosComprados), montanteAntes: montante, montanteFinal: montante, estoqueAntes: intOrNull(raw.estoqueAntes), estoqueFinal: intOrNull(raw.estoqueAposMovimento) };
  }
  return {
    ...base,
    quantidade: intOrNull(raw.quantidadeAbastecida),
    montanteAntes: intOrNull(raw.montanteAntes),
    montanteFinal: intOrNull(raw.montanteAposMovimento),
    estoqueAntes: intOrNull(raw.estoqueAntes),
    estoqueFinal: intOrNull(raw.estoqueAposMovimento),
  };
}

export function isAjuste(registro: RegistroLedger) {
  return registro.tipo === 'saida' && registro.motivo === AJUSTE_MOTIVO;
}

/** Preço de uma entrada V2 (ou de `bombas.ultimaEntrada`). */
export interface PrecoReferencia { movimentoId: string | null; lote: string | null; preco: number; litrosComprados: number; precoLitro: number; data: Date | null }

export function precoFromEntrada(raw: Record<string, unknown>, movimentoId?: string): PrecoReferencia | null {
  const { preco, litrosComprados, precoLitro } = raw;
  if (raw.schemaVersion !== 2 || !isInt(preco) || !isInt(litrosComprados) || !isInt(precoLitro) || preco <= 0 || litrosComprados <= 0 || precoLitro <= 0) return null;
  const id = typeof raw.movimentoId === 'string' && raw.movimentoId ? raw.movimentoId : movimentoId ?? null;
  return { movimentoId: id, lote: typeof raw.lote === 'string' ? raw.lote : null, preco, litrosComprados, precoLitro, data: toDate(raw.data) };
}

/** Entrada com preço mais recente até a data (as entradas vêm em qualquer ordem). */
export function precoNaData(entradas: PrecoReferencia[], data: Date): PrecoReferencia | null {
  return entradas
    .filter((entrada) => entrada.data && entrada.data.getTime() <= data.getTime())
    .sort((a, b) => (b.data as Date).getTime() - (a.data as Date).getTime())[0] ?? null;
}

export function valorSaida(quantidade: number, preco: PrecoReferencia | null) {
  return preco ? Math.round(quantidade * preco.preco / preco.litrosComprados) : 0;
}

export function origemPreco(preco: PrecoReferencia | null) {
  return preco ? { movimentoId: preco.movimentoId, lote: preco.lote, precoLitro: preco.precoLitro } : { movimentoId: null, lote: null, precoLitro: 0 };
}

export type PlanoLancamento =
  | { modo: 'atual'; montantePartida: number; estoquePartida: number; desde: Date | null }
  | {
    modo: 'correcao';
    montantePartida: number;
    estoquePartida: number;
    desde: Date;
    ate: Date;
    anterior: RegistroLedger;
    seguinte: RegistroLedger;
    ajuste: RegistroLedger | null;
    furo: number;
  };

export interface PlanejarInput {
  data: Date;
  /** Registro mais recente do ledger. */
  ultimo: RegistroLedger | null;
  /** Registros com data anterior à escolhida, do mais recente para o mais antigo. */
  antes: RegistroLedger[];
  /** Registros com data posterior à escolhida, do mais antigo para o mais recente. */
  depois: RegistroLedger[];
  bomba: { montanteAtual: unknown; estoqueAtual: unknown };
}

export function planejarLancamento(input: PlanejarInput): PlanoLancamento | { erro: string } {
  const { data, ultimo, antes, depois, bomba } = input;
  if (!ultimo || data.getTime() > ultimo.data.getTime()) {
    if (!isInt(bomba.montanteAtual) || !isInt(bomba.estoqueAtual)) return { erro: 'A bomba diesel_patio não tem montante e estoque inteiros.' };
    return { modo: 'atual', montantePartida: bomba.montanteAtual, estoquePartida: bomba.estoqueAtual, desde: ultimo?.data ?? null };
  }
  const anterior = antes[0];
  const seguinte = depois[0];
  if (!anterior) return { erro: 'Não há registro antes dessa data.' };
  if (!seguinte) return { erro: 'Já existe um registro nesse horário. Escolha outro horário.' };
  const ajuste = isAjuste(seguinte) ? seguinte : null;
  if (ajuste) {
    if (!isInt(ajuste.quantidade) || ajuste.quantidade <= 0 || ajuste.montanteAntes === null || ajuste.estoqueAntes === null) {
      return { erro: 'O ajuste automático seguinte não tem quantidade, montante e estoque inteiros.' };
    }
    return { modo: 'correcao', montantePartida: ajuste.montanteAntes, estoquePartida: ajuste.estoqueAntes, desde: anterior.data, ate: ajuste.data, anterior, seguinte, ajuste, furo: ajuste.quantidade };
  }
  const montanteRef = antes.find((registro) => registro.montanteFinal !== null);
  const estoqueRef = antes.find((registro) => registro.estoqueFinal !== null);
  if (!montanteRef || montanteRef.montanteFinal === null) return { erro: 'Nenhum registro anterior tem montante final.' };
  if (!estoqueRef || estoqueRef.estoqueFinal === null) return { erro: 'Nenhum registro anterior tem estoque final.' };
  if (seguinte.montanteAntes === null) return { erro: 'O registro seguinte não tem montante inicial; não dá para medir o furo.' };
  const furo = seguinte.montanteAntes - montanteRef.montanteFinal;
  if (furo <= 0) return { erro: 'Não há furo nesse ponto: o montante do registro seguinte continua o do anterior.' };
  return { modo: 'correcao', montantePartida: montanteRef.montanteFinal, estoquePartida: estoqueRef.estoqueFinal, desde: anterior.data, ate: seguinte.data, anterior, seguinte, ajuste: null, furo };
}

export type Medidor = { tipo: 'quilometragem' | 'horimetro'; valor: number } | 'sem-odometro' | null;

export interface LinhaLancamento {
  data: Date;
  quantidade: number | null;
  arla: number;
  modalidade: 'direto' | 'galao';
  item: ItemFrotaV2 | null;
  obra: ObraV2 | null;
  frentista: { uid: string; nome: string } | null;
  motoristaOperador: { uid: string | null; nome: string } | null;
  motivo: string;
  observacao: string;
  medidor: Medidor;
}

export interface Encadeado { montanteAntes: number; montanteAposMovimento: number; estoqueAntes: number; estoqueAposMovimento: number }

/** Ordena as linhas pela data e encadeia montante e estoque a partir do ponto de partida. */
export function encadearLinhas<T extends { data: Date; quantidade: number | null }>(linhas: T[], montantePartida: number, estoquePartida: number) {
  let montante = montantePartida; let estoque = estoquePartida;
  return [...linhas].sort((a, b) => a.data.getTime() - b.data.getTime()).map((linha) => {
    const quantidade = linha.quantidade ?? 0;
    const passo: Encadeado = { montanteAntes: montante, montanteAposMovimento: montante + quantidade, estoqueAntes: estoque, estoqueAposMovimento: estoque - quantidade };
    montante = passo.montanteAposMovimento; estoque = passo.estoqueAposMovimento;
    return { linha, ...passo };
  });
}

export function totalLinhas(linhas: { quantidade: number | null }[]) {
  return linhas.reduce((total, linha) => total + (linha.quantidade ?? 0), 0);
}

function validarMedidor(linha: LinhaLancamento, prefixo: string): string[] {
  if (linha.modalidade === 'galao') return linha.medidor === null ? [] : [`${prefixo}: galão não usa medidor nem "Sem odômetro".`];
  if (linha.medidor === 'sem-odometro') return [];
  if (!linha.medidor) return [`${prefixo}: informe o ${linha.item?.categoria === 'EXTRA' ? 'horímetro' : 'KM'} ou marque "Sem odômetro".`];
  const esperado = linha.item?.categoria === 'EXTRA' ? 'horimetro' : 'quilometragem';
  if (linha.medidor.tipo !== esperado) return [`${prefixo}: ${esperado === 'horimetro' ? 'máquina usa horímetro' : 'veículo usa KM'}.`];
  return isInt(linha.medidor.valor) && linha.medidor.valor >= 0 ? [] : [`${prefixo}: o medidor deve ser um inteiro.`];
}

export function validarLote(plano: PlanoLancamento, linhas: LinhaLancamento[], agora: Date, folgaLitros: unknown): string[] {
  if (!linhas.length) return ['Adicione ao menos um abastecimento.'];
  const erros: string[] = [];
  linhas.forEach((linha, index) => {
    const p = `Abastecimento ${index + 1}`;
    if (!isInt(linha.quantidade) || linha.quantidade <= 0) erros.push(`${p}: informe a quantidade.`);
    else if (isInt(folgaLitros) && linha.quantidade > folgaLitros) erros.push(`${p}: quantidade acima da folga da bomba.`);
    if (!isInt(linha.arla) || linha.arla < 0) erros.push(`${p}: ARLA inválido.`);
    if (!linha.item) erros.push(`${p}: selecione o item da frota.`);
    if (!linha.obra) erros.push(`${p}: selecione a obra.`);
    if (!linha.frentista) erros.push(`${p}: selecione o frentista.`);
    if (!linha.motoristaOperador || !linha.motoristaOperador.nome.trim()) erros.push(`${p}: informe o motorista/operador.`);
    if (!linha.motivo.trim()) erros.push(`${p}: informe o motivo.`);
    if (linha.item) erros.push(...validarMedidor(linha, p));
    // Só o lançamento atual mexe no medidor da frota; numa correção a leitura é histórica.
    if (plano.modo === 'atual' && linha.item && linha.medidor && linha.medidor !== 'sem-odometro'
      && linha.item.quilometragemUltima !== null && linha.medidor.valor < linha.item.quilometragemUltima) {
      erros.push(`${p}: a leitura não pode ser menor que a última do item (${linha.item.quilometragemUltima}).`);
    }
    const t = linha.data.getTime();
    if (Number.isNaN(t)) erros.push(`${p}: data inválida.`);
    else if (plano.modo === 'atual') {
      if (plano.desde && t <= plano.desde.getTime()) erros.push(`${p}: a data deve ser posterior ao último registro.`);
      if (t > agora.getTime()) erros.push(`${p}: a data não pode estar no futuro.`);
    } else if (t <= plano.desde.getTime() || t >= plano.ate.getTime()) {
      erros.push(`${p}: a data deve ficar entre o registro anterior e o seguinte.`);
    }
  });
  if (plano.modo === 'correcao' && totalLinhas(linhas) > plano.furo) erros.push('A soma dos abastecimentos passa do furo.');
  return erros;
}

export function buildSaidaV2(input: {
  linha: LinhaLancamento;
  encadeado: Encadeado;
  preco: PrecoReferencia | null;
  criadoPor: { uid: string; nome: string };
  dataFirestore: unknown;
}): Record<string, unknown> {
  const { linha, encadeado, preco, criadoPor } = input;
  const item = linha.item as ItemFrotaV2; const obra = linha.obra as ObraV2; const quantidade = linha.quantidade as number;
  const payload: Record<string, unknown> = {
    schemaVersion: 2,
    tipo: 'saida',
    data: input.dataFirestore,
    modalidadeAbastecimento: linha.modalidade,
    quantidadeAbastecida: quantidade,
    valorAbastecimento: valorSaida(quantidade, preco),
    origemPreco: origemPreco(preco),
    ...encadeado,
    frentista: { uid: linha.frentista?.uid, nome: linha.frentista?.nome },
    motoristaOperador: { uid: linha.motoristaOperador?.uid ?? null, nome: linha.motoristaOperador?.nome.trim() },
    criadoPor,
    item_frota_id: item.id,
    item_frota_snapshot: itemFrotaSnapshot(item),
    id_obra: obra.id,
    id_obra_snap: obraSnapshot(obra),
    motivo: linha.motivo.trim(),
    arla: linha.arla,
  };
  if (linha.observacao.trim()) payload.observacao = linha.observacao.trim();
  if (linha.medidor === 'sem-odometro') payload.semKm = SEM_ODOMETRO;
  else if (linha.medidor) payload[linha.medidor.tipo] = linha.medidor.valor;
  return payload;
}

/** O que sobra do ajuste automático depois das saídas que o explicam: nada (apagar) ou a diferença. */
export function ajusteRestante(ajuste: { quantidadeAbastecida?: unknown; valorAbastecimento?: unknown }, explicado: number, ultimo: Encadeado) {
  const quantidade = intOrNull(ajuste.quantidadeAbastecida) ?? 0;
  const restante = quantidade - explicado;
  if (restante <= 0) return null;
  const valor = intOrNull(ajuste.valorAbastecimento) ?? 0;
  return {
    quantidadeAbastecida: restante,
    valorAbastecimento: quantidade > 0 ? Math.round(valor * restante / quantidade) : 0,
    montanteAntes: ultimo.montanteAposMovimento,
    estoqueAntes: ultimo.estoqueAposMovimento,
  };
}

/** Maior leitura informada por item no lançamento atual (para `veiculos-v2.operacional.quilometragemUltima`). */
export function leiturasPorItem(linhas: LinhaLancamento[]) {
  const leituras = new Map<string, number>();
  for (const linha of linhas) {
    if (linha.modalidade !== 'direto' || !linha.item || !linha.medidor || linha.medidor === 'sem-odometro') continue;
    leituras.set(linha.item.id, Math.max(leituras.get(linha.item.id) ?? -Infinity, linha.medidor.valor));
  }
  return leituras;
}
