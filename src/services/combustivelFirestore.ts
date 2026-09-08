import { Timestamp, doc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Registro } from '../types';

const COLLECTION_NAME = '03-combustivel';
export interface FuelSnapshot { uid: string; nomeSnapshot: string }
export interface FuelItemSnapshot { uid: string; tipo: 'veiculo' | 'maquina'; identificadorSnapshot: string; km?: number; horimetro?: number }
export interface FuelObraSnapshot { uid: string; nomeSnapshot: string; localSnapshot?: string }
export interface SaveV2FuelInput {
  data: Date | string | Timestamp; quantidadeAbastecida: number; montanteAposMovimento: number;
  frentista: FuelSnapshot; paraQuem: FuelSnapshot; autorLancamento: FuelSnapshot; itemFrota: FuelItemSnapshot;
  obra: FuelObraSnapshot; motivo: string; arla: number; modalidadeAbastecimento: 'direto' | 'galao'; observacao?: string;
}

function integer(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${label} deve ser um inteiro válido.`);
  return n;
}
function dateValue(value: Date | string | Timestamp): Date {
  const date = value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida.');
  return date;
}
export function calculateFuelCostCents(quantityX10: number, priceCents: number, litersX10: number): number {
  if (![quantityX10, priceCents, litersX10].every(Number.isInteger) || quantityX10 <= 0 || priceCents <= 0 || litersX10 <= 0) throw new Error('Última entrada de diesel V2 inválida.');
  return Math.round(quantityX10 * priceCents / litersX10);
}

export async function saveCombustivelAndUpdateDieselPatio(input: SaveV2FuelInput): Promise<Registro> {
  const data = Timestamp.fromDate(dateValue(input.data));
  const quantity = integer(input.quantidadeAbastecida, 'Quantidade');
  const finalAmount = integer(input.montanteAposMovimento, 'Montante final');
  const arla = integer(input.arla, 'ARLA');
  if (quantity <= 0) throw new Error('Quantidade deve ser maior que zero.');
  if (!input.motivo.trim()) throw new Error('Informe o motivo.');
  if (![input.frentista, input.paraQuem, input.autorLancamento].every((v) => v.uid && v.nomeSnapshot)) throw new Error('As identidades devem possuir UID e nome válidos.');
  if (!input.itemFrota.uid || !input.itemFrota.identificadorSnapshot) throw new Error('Selecione um item de frota válido.');
  if (input.itemFrota.tipo === 'veiculo' && input.itemFrota.horimetro !== undefined) throw new Error('Veículo não aceita horímetro.');
  if (input.itemFrota.tipo === 'maquina' && input.itemFrota.km !== undefined) throw new Error('Máquina não aceita KM.');
  if (input.modalidadeAbastecimento === 'direto' && input.itemFrota.tipo === 'veiculo' && !Number.isInteger(input.itemFrota.km)) throw new Error('Abastecimento direto de veículo requer KM inteiro.');
  if (input.modalidadeAbastecimento === 'direto' && input.itemFrota.tipo === 'maquina' && !Number.isInteger(input.itemFrota.horimetro)) throw new Error('Abastecimento direto de máquina requer horímetro.');
  const movementRef = doc(db, COLLECTION_NAME); const pumpRef = doc(db, 'bombas', 'diesel_patio'); const itemRef = doc(db, 'veiculos', input.itemFrota.uid);
  await runTransaction(db, async (transaction) => {
    const pumpSnapshot = await transaction.get(pumpRef); const itemSnapshot = await transaction.get(itemRef);
    if (!pumpSnapshot.exists()) throw new Error('Documento bombas/diesel_patio não encontrado.');
    if (!itemSnapshot.exists()) throw new Error('Item de frota não encontrado.');
    const pump = pumpSnapshot.data() as Record<string, any>; const estoqueAntes = integer(pump.estoqueAtual, 'Estoque atual'); const montanteAntes = integer(pump.montanteAtual, 'Montante atual'); const folga = integer(pump.folgaLitros, 'Folga de litros');
    const entrada = pump.ultimaEntrada as Record<string, any> | undefined;
    if (!entrada || entrada.schemaVersion !== 2) throw new Error('Preço V2 da última entrada não encontrado.');
    if (Math.abs(finalAmount - montanteAntes) > folga) throw new Error('Leitura final fora da folga permitida.');
    const valor = calculateFuelCostCents(quantity, integer(entrada.preco, 'Preço da entrada'), integer(entrada.litrosComprados, 'Litros da entrada'));
    const itemData = itemSnapshot.data() as Record<string, any>; const hasReading = input.itemFrota.tipo === 'veiculo' ? input.itemFrota.km !== undefined : input.itemFrota.horimetro !== undefined;
    if (hasReading) {
      const previous = input.itemFrota.tipo === 'veiculo' ? itemData.quilometragemUltima : (itemData.horimetro ?? itemData.quilometragemUltima ?? 0); const current = input.itemFrota.tipo === 'veiculo' ? input.itemFrota.km : input.itemFrota.horimetro;
      if (typeof current !== 'number' || current < (typeof previous === 'number' ? previous : 0)) throw new Error('A leitura do item de frota não pode regredir.');
      transaction.update(itemRef, input.itemFrota.tipo === 'veiculo' ? { quilometragemUltima: current, dataUltimaAtualizacao: new Date() } : { horimetro: current, dataUltimaAtualizacao: new Date() });
    }
    const payload: Record<string, any> = { schemaVersion: 2, tipo: 'saida', data, modalidadeAbastecimento: input.modalidadeAbastecimento, quantidadeAbastecida: quantity, valorAbastecimento: valor, origemPreco: { movimentoId: String(entrada.movimentoId), lote: entrada.lote ?? null, precoLitro: integer(entrada.precoLitro, 'Preço por litro') }, estoqueAntes, estoqueAposMovimento: estoqueAntes - quantity, montanteAntes, montanteAposMovimento: finalAmount, frentista: input.frentista, paraQuem: input.paraQuem, autorLancamento: input.autorLancamento, itemFrota: input.itemFrota, obra: input.obra, motivo: input.motivo.trim(), arla };
    if (input.observacao?.trim()) payload.observacao = input.observacao.trim();
    transaction.set(movementRef, payload); transaction.update(pumpRef, { estoqueAtual: estoqueAntes - quantity, montanteAtual: finalAmount, ultimoAbastecimento: data, ultimoFrentista: input.frentista.nomeSnapshot });
  });
  return { id: movementRef.id, schemaVersion: 2, tipo: 'saida', ...input, data } as unknown as Registro;
}
/** Legacy modal kept for historical/admin compatibility; /combustivel/novo never calls it. */
export async function saveCombustivel(input: Partial<Registro> & { email: string }): Promise<Registro> {
  const date = input.data instanceof Timestamp ? input.data : Timestamp.fromDate(input.data instanceof Date ? input.data : new Date());
  const ref = doc(db, COLLECTION_NAME);
  const payload = { ...input, email: undefined, data: date } as Record<string, unknown>;
  delete payload.email;
  await setDoc(ref, payload);
  return { id: ref.id, ...payload } as Registro;
}
export default { saveCombustivelAndUpdateDieselPatio, calculateFuelCostCents };
