import { Timestamp, collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ajusteRestante,
  buildSaidaV2,
  encadearLinhas,
  leiturasPorItem,
  planejarLancamento,
  precoFromEntrada,
  precoNaData,
  registroLedgerFrom,
  totalLinhas,
  type LinhaLancamento,
  type PlanoLancamento,
  type PrecoReferencia,
  type RegistroLedger,
} from '../utils/combustivelLancamento';

// Gravação de /combustivel/novo (The Manuscript, 02_PROCESSOS/combustivel-saida-v2.md, "Lançamento pela WEB").
const COMBUSTIVEL = '03-combustivel';
const BOMBA_ID = 'diesel_patio';

const ledger = (docs: { id: string; data: () => Record<string, unknown> }[]) => docs
  .map((item) => registroLedgerFrom(item.id, item.data()))
  .filter((item): item is RegistroLedger => item !== null);

export interface ContextoLancamento {
  plano: PlanoLancamento | { erro: string };
  folgaLitros: unknown;
  precoAtual: PrecoReferencia | null;
  precosEntradas: PrecoReferencia[];
}

/** Lê a bomba e os registros em volta da data para decidir entre lançamento atual e correção de furo. */
export async function carregarContextoLancamento(data: Date): Promise<ContextoLancamento> {
  const col = collection(db, COMBUSTIVEL); const ts = Timestamp.fromDate(data);
  const [bomba, ultimo, antes, depois, entradas] = await Promise.all([
    getDoc(doc(db, 'bombas', BOMBA_ID)),
    getDocs(query(col, orderBy('data', 'desc'), limit(1))),
    getDocs(query(col, where('data', '<', ts), orderBy('data', 'desc'), limit(20))),
    getDocs(query(col, where('data', '>', ts), orderBy('data', 'asc'), limit(1))),
    // Só por tipo, como o app: evita índice composto; a ordenação é feita aqui.
    getDocs(query(col, where('tipo', '==', 'entrada'))),
  ]);
  const bombaData = bomba.exists() ? bomba.data() : {};
  return {
    plano: bomba.exists()
      ? planejarLancamento({ data, ultimo: ledger(ultimo.docs)[0] ?? null, antes: ledger(antes.docs), depois: ledger(depois.docs), bomba: { montanteAtual: bombaData.montanteAtual, estoqueAtual: bombaData.estoqueAtual } })
      : { erro: 'Documento bombas/diesel_patio não encontrado.' },
    folgaLitros: bombaData.folgaLitros,
    precoAtual: bombaData.ultimaEntrada ? precoFromEntrada(bombaData.ultimaEntrada as Record<string, unknown>) : null,
    precosEntradas: entradas.docs.map((item) => precoFromEntrada(item.data(), item.id)).filter((item): item is PrecoReferencia => item !== null),
  };
}

export async function salvarLancamento(input: {
  plano: PlanoLancamento;
  linhas: LinhaLancamento[];
  criadoPor: { uid: string; nome: string };
  precosEntradas: PrecoReferencia[];
}): Promise<string[]> {
  const { plano, linhas, criadoPor } = input;
  const pumpRef = doc(db, 'bombas', BOMBA_ID);
  const ajusteRef = plano.modo === 'correcao' && plano.ajuste ? doc(db, COMBUSTIVEL, plano.ajuste.id) : null;
  const leituras = plano.modo === 'atual' ? leiturasPorItem(linhas) : new Map<string, number>();
  const encadeadas = encadearLinhas(linhas, plano.montantePartida, plano.estoquePartida);
  const refs = encadeadas.map(() => doc(collection(db, COMBUSTIVEL)));
  const total = totalLinhas(linhas);

  await runTransaction(db, async (transaction) => {
    const pump = await transaction.get(pumpRef);
    if (!pump.exists()) throw new Error('Documento bombas/diesel_patio não encontrado.');
    const pumpData = pump.data();
    const ajuste = ajusteRef ? await transaction.get(ajusteRef) : null;
    const itens = await Promise.all([...leituras.keys()].map((id) => transaction.get(doc(db, 'veiculos-v2', id))));

    let preco: (linha: LinhaLancamento) => PrecoReferencia | null;
    if (plano.modo === 'atual') {
      if (pumpData.montanteAtual !== plano.montantePartida || pumpData.estoqueAtual !== plano.estoquePartida) {
        throw new Error('A bomba mudou desde que a tela foi carregada. Confira a data de novo.');
      }
      const atual = pumpData.ultimaEntrada ? precoFromEntrada(pumpData.ultimaEntrada as Record<string, unknown>) : null;
      if (!atual) throw new Error('Preço V2 da última entrada não encontrado na bomba.');
      preco = () => atual;
    } else {
      // Correção: o preço é o da entrada mais recente até a data de cada saída.
      preco = (linha) => precoNaData(input.precosEntradas, linha.data);
      if (ajuste) {
        const data = ajuste.exists() ? ajuste.data() : null;
        if (!data || data.quantidadeAbastecida !== plano.furo || data.montanteAntes !== plano.montantePartida) {
          throw new Error('O ajuste automático mudou desde que a tela foi carregada. Confira a data de novo.');
        }
      }
    }

    encadeadas.forEach(({ linha, ...encadeado }, index) => {
      transaction.set(refs[index], buildSaidaV2({ linha, encadeado, preco: preco(linha), criadoPor, dataFirestore: Timestamp.fromDate(linha.data) }));
    });
    const ultima = encadeadas[encadeadas.length - 1];
    const agora = Timestamp.now();

    if (plano.modo === 'atual') {
      const dataUltima = Timestamp.fromDate(ultima.linha.data);
      transaction.update(pumpRef, {
        estoqueAtual: ultima.estoqueAposMovimento,
        montanteAtual: ultima.montanteAposMovimento,
        ultimoAbastecimento: dataUltima,
        ultimoFrentista: ultima.linha.frentista?.nome ?? '',
        ultimaMovimentacao: { movimentoId: refs[refs.length - 1].id, tipo: 'saida', data: dataUltima },
        atualizadoEm: agora,
      });
      itens.forEach((item) => {
        const leitura = leituras.get(item.id);
        if (!item.exists() || leitura === undefined) return;
        const anterior = (item.data().operacional as { quilometragemUltima?: unknown } | undefined)?.quilometragemUltima;
        if (typeof anterior === 'number' && leitura < anterior) throw new Error('A leitura do item de frota não pode regredir.');
        transaction.update(item.ref, { 'operacional.quilometragemUltima': leitura, 'operacional.dataUltimaAtualizacao': agora });
      });
    } else if (ajusteRef && ajuste?.exists()) {
      // O ajuste já tinha descontado o estoque: as saídas tomam o lugar dele, total ou parcialmente.
      const restante = ajusteRestante(ajuste.data(), total, ultima);
      if (restante) transaction.update(ajusteRef, restante);
      else transaction.delete(ajusteRef);
    } else {
      // Furo sem ajuste: o diesel saiu do tanque e ninguém tinha descontado.
      if (typeof pumpData.estoqueAtual !== 'number' || !Number.isInteger(pumpData.estoqueAtual)) throw new Error('A bomba não tem estoque inteiro.');
      transaction.update(pumpRef, { estoqueAtual: pumpData.estoqueAtual - total, atualizadoEm: agora });
    }
  });
  return refs.map((ref) => ref.id);
}
