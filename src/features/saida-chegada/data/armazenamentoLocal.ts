// Saídas e Chegadas lançadas e ainda não enviadas, guardadas no aparelho (IndexedDB, sem dependência), por id do
// documento. Datas passam direto (structured clone).
import type { AtividadePendente } from '../domain/atividade';

const BANCO = 'ledur-saida-chegada';
const VERSAO = 1;
const PENDENTES = 'pendentes';

let aberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  aberto ??= new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(PENDENTES)) pedido.result.createObjectStore(PENDENTES);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => {
      aberto = null;
      reject(pedido.error);
    };
  });
  return aberto;
}

async function executar<T>(modo: IDBTransactionMode, acao: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const transacao = db.transaction(PENDENTES, modo);
    const pedido = acao(transacao.objectStore(PENDENTES));
    transacao.oncomplete = () => resolve(pedido.result);
    transacao.onerror = () => reject(transacao.error);
    transacao.onabort = () => reject(transacao.error);
  });
}

export const listarPendentes = () => executar<AtividadePendente[]>('readonly', (s) => s.getAll());

export async function salvarPendente(pendente: AtividadePendente): Promise<void> {
  await executar('readwrite', (s) => s.put(pendente, pendente.id));
}

export async function removerPendente(id: string): Promise<void> {
  await executar('readwrite', (s) => s.delete(id));
}
