// Dados do checklist guardados no aparelho (IndexedDB, sem dependência): o rascunho em andamento, um por vez e sem
// expirar, como no app, e os arquivos (fotos, miniaturas e assinatura) por chave `{checklistId}/...`. Datas e Blobs
// passam direto (structured clone).
import type { ChecklistRascunho } from '../domain/rascunho';

const BANCO = 'ledur-checklist-mecanico';
const VERSAO = 2;
const RASCUNHO = 'rascunho';
const CHAVE_RASCUNHO = 'atual';
const ARQUIVOS = 'arquivos';

let aberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  aberto ??= new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      for (const loja of [RASCUNHO, ARQUIVOS]) {
        if (!db.objectStoreNames.contains(loja)) db.createObjectStore(loja);
      }
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

/** Apaga o rascunho e, salvo `apagarArquivos: false` (checklist concluído, ainda a enviar), os arquivos dele. */
export async function descartarRascunho({ apagarArquivos = true } = {}): Promise<void> {
  const rascunho = apagarArquivos ? await carregarRascunho() : null;
  await executar(RASCUNHO, 'readwrite', (s) => s.delete(CHAVE_RASCUNHO));
  if (rascunho) await apagarArquivosDoChecklist(rascunho.id);
}

/** Chave nova para um arquivo do checklist. */
export const chaveArquivo = (checklistId: string, nome: string) => `${checklistId}/${nome}`;

export async function salvarArquivo(chave: string, arquivo: Blob): Promise<void> {
  await executar(ARQUIVOS, 'readwrite', (s) => s.put(arquivo, chave));
}

export async function lerArquivo(chave: string): Promise<Blob | null> {
  return (await executar<Blob | undefined>(ARQUIVOS, 'readonly', (s) => s.get(chave))) ?? null;
}

export async function apagarArquivos(chaves: readonly string[]): Promise<void> {
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const transacao = db.transaction(ARQUIVOS, 'readwrite');
    for (const chave of chaves) transacao.objectStore(ARQUIVOS).delete(chave);
    transacao.oncomplete = () => resolve();
    transacao.onerror = () => reject(transacao.error);
  });
}

export async function apagarArquivosDoChecklist(checklistId: string): Promise<void> {
  const prefixo = `${checklistId}/`;
  await executar(ARQUIVOS, 'readwrite', (s) => s.delete(IDBKeyRange.bound(prefixo, prefixo + String.fromCharCode(0xffff))));
}
