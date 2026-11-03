// Dados do checklist guardados no aparelho (IndexedDB, sem dependência): o rascunho em andamento, um por vez e sem
// expirar, como no app. Datas e Blobs passam direto (structured clone).
import type { ChecklistRascunho } from '../domain/rascunho';

const BANCO = 'ledur-checklist-mecanico';
const VERSAO = 1;
const RASCUNHO = 'rascunho';
const CHAVE_RASCUNHO = 'atual';

let aberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  aberto ??= new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(RASCUNHO)) db.createObjectStore(RASCUNHO);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => {
      aberto = null;
      reject(pedido.error);
    };
  });
  return aberto;
}

async function executar<T>(loja: string, modo: IDBTransactionMode, acao: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const transacao = db.transaction(loja, modo);
    const pedido = acao(transacao.objectStore(loja));
    transacao.oncomplete = () => resolve(pedido.result);
    transacao.onerror = () => reject(transacao.error);
    transacao.onabort = () => reject(transacao.error);
  });
}

export async function carregarRascunho(): Promise<ChecklistRascunho | null> {
  return (await executar<ChecklistRascunho | undefined>(RASCUNHO, 'readonly', (s) => s.get(CHAVE_RASCUNHO))) ?? null;
}

export async function salvarRascunho(rascunho: ChecklistRascunho): Promise<void> {
  await executar(RASCUNHO, 'readwrite', (s) => s.put(rascunho, CHAVE_RASCUNHO));
}

export async function descartarRascunho(): Promise<void> {
  await executar(RASCUNHO, 'readwrite', (s) => s.delete(CHAVE_RASCUNHO));
}
