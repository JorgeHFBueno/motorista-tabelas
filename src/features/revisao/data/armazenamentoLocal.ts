// Dados da Revisão guardados no aparelho (IndexedDB), como o ManutencaoLocalStore do app: a revisão nova ainda não
// salva (uma por vez), a cópia de trabalho de cada registro salvo, as fotos por chave `{registroId}/...` e a fila de
// envio, uma entrada por revisão (`{registroId}_{revisao}`), para um "Salvar" durante o envio da anterior não ser
// sobrescrito por ele. Datas e Blobs passam direto (structured clone).
import type { RevisaoPendente, RevisaoRegistro } from '../domain/registro';

const BANCO = 'ledur-revisao';
const VERSAO = 1;
const RASCUNHO = 'rascunho';
const CHAVE_RASCUNHO = 'atual';
const REGISTROS = 'registros';
const ARQUIVOS = 'arquivos';
const PENDENTES = 'pendentes';

let aberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  aberto ??= new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      for (const loja of [RASCUNHO, REGISTROS, ARQUIVOS, PENDENTES]) {
        if (!pedido.result.objectStoreNames.contains(loja)) pedido.result.createObjectStore(loja);
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

const faixaDoRegistro = (id: string) => IDBKeyRange.bound(`${id}/`, `${id}/${String.fromCharCode(0xffff)}`);

// ------------------------------------------------------------------ rascunho: revisão nova, antes do primeiro "Salvar"

export async function carregarRascunho(): Promise<RevisaoRegistro | null> {
  return (await executar<RevisaoRegistro | undefined>(RASCUNHO, 'readonly', (s) => s.get(CHAVE_RASCUNHO))) ?? null;
}

export async function salvarRascunho(registro: RevisaoRegistro): Promise<void> {
  await executar(RASCUNHO, 'readwrite', (s) => s.put(registro, CHAVE_RASCUNHO));
}

/** Apaga o rascunho e, salvo `apagarArquivos: false` (acabou de ser salvo), as fotos dele. */
export async function descartarRascunho({ apagarArquivos = true } = {}): Promise<void> {
  const rascunho = apagarArquivos ? await carregarRascunho() : null;
  await executar(RASCUNHO, 'readwrite', (s) => s.delete(CHAVE_RASCUNHO));
  if (rascunho) await apagarArquivosDoRegistro(rascunho.id);
}

// ------------------------------------------------------------------ registros salvos neste aparelho

/** Registros salvos neste aparelho, do mais antigo para o mais novo. */
export async function listarRegistros(): Promise<RevisaoRegistro[]> {
  const lista = await executar<RevisaoRegistro[]>(REGISTROS, 'readonly', (s) => s.getAll());
  return lista.sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());
}

export async function carregarRegistro(id: string): Promise<RevisaoRegistro | null> {
  return (await executar<RevisaoRegistro | undefined>(REGISTROS, 'readonly', (s) => s.get(id))) ?? null;
}

export async function salvarRegistro(registro: RevisaoRegistro): Promise<void> {
  await executar(REGISTROS, 'readwrite', (s) => s.put(registro, registro.id));
}

export async function removerRegistro(id: string): Promise<void> {
  await executar(REGISTROS, 'readwrite', (s) => s.delete(id));
  await apagarArquivosDoRegistro(id);
}

// ------------------------------------------------------------------ fotos

export const chaveArquivo = (registroId: string, nome: string) => `${registroId}/${nome}`;

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

export async function apagarArquivosDoRegistro(id: string): Promise<void> {
  await executar(ARQUIVOS, 'readwrite', (s) => s.delete(faixaDoRegistro(id)));
}

// ------------------------------------------------------------------ fila de envio

/** Revisões aguardando envio (e as recusadas), pela hora do "Salvar". */
export async function listarPendentes(): Promise<RevisaoPendente[]> {
  const lista = await executar<RevisaoPendente[]>(PENDENTES, 'readonly', (s) => s.getAll());
  return lista.sort((a, b) => a.salvoEm.getTime() - b.salvoEm.getTime());
}

export async function salvarPendente(p: RevisaoPendente): Promise<void> {
  await executar(PENDENTES, 'readwrite', (s) => s.put(p, `${p.registro.id}_${p.registro.revisao}`));
}

export async function removerPendentesAte(id: string, revisao: number): Promise<void> {
  const chaves = (await listarPendentes()).filter((p) => p.registro.id === id && p.registro.revisao <= revisao)
    .map((p) => `${p.registro.id}_${p.registro.revisao}`);
  if (chaves.length === 0) return;
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const transacao = db.transaction(PENDENTES, 'readwrite');
    for (const chave of chaves) transacao.objectStore(PENDENTES).delete(chave);
    transacao.oncomplete = () => resolve();
    transacao.onerror = () => reject(transacao.error);
  });
}
