import {
  collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc,
  updateDoc, where, writeBatch, type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from '../../../firebase';
import {
  pessoaDoDocumento, veiculosDoDocumento, type AnexoObservacao, type Observacao, type Programacao, type ProgramacaoEditavel, type RefCadastro,
  type RefPessoa, type Semana,
} from '../domain/models';
import { codigoDaProgramacao } from '../domain/codigo';
import { semanaDoId, semanaIdValido } from '../domain/semanas';
import { ETIQUETAS_PADRAO, type EtiquetaStatus } from '../domain/status';

// Cronograma Logístico (The Manuscript, 01_FIRESTORE/COLECOES/logistica.md). logistica, mecanico ou adm2 lê e grava.
export const SEMANAS = 'logistica-semanas';
export const PROGRAMACOES = 'logistica-programacoes';
export const OBSERVACOES = 'logistica-observacoes';
export const CONFIG = 'logistica-config';

export const LIMITE_ARQUIVO = 25 * 1024 * 1024;
export const MAX_ANEXOS = 10;
export const MAX_TEXTO_OBSERVACAO = 2000;

const data = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const texto = (value: unknown) => (typeof value === 'string' ? value : '');

function refPessoa(value: unknown): RefPessoa | null {
  const ref = value as { uid?: unknown; nome?: unknown } | null;
  return ref && typeof ref.uid === 'string' && ref.uid ? { uid: ref.uid, nome: texto(ref.nome) } : null;
}

function refCadastro(value: unknown): RefCadastro | null {
  const ref = value as { id?: unknown; nome?: unknown } | null;
  return ref && typeof ref.id === 'string' && ref.id ? { id: ref.id, nome: texto(ref.nome) } : null;
}

export function programacaoDoDocumento(id: string, value: Record<string, unknown>): Programacao | null {
  if (typeof value.semanaId !== 'string') return null;
  return {
    id,
    cod: typeof value.cod === 'string' && value.cod ? value.cod : null,
    semanaId: value.semanaId,
    item: texto(value.item),
    status: texto(value.status),
    inicio: data(value.inicio),
    fim: data(value.fim),
    motorista: pessoaDoDocumento(value.motorista),
    auxiliar: pessoaDoDocumento(value.auxiliar),
    veiculos: veiculosDoDocumento(value),
    obra: refCadastro(value.obra),
    posicao: typeof value.posicao === 'number' ? value.posicao : 0,
  };
}

function anexoDo(value: unknown): AnexoObservacao | null {
  const anexo = value as Partial<Record<keyof AnexoObservacao, unknown>> | null;
  if (!anexo || typeof anexo.caminho !== 'string' || typeof anexo.url !== 'string') return null;
  return {
    caminho: anexo.caminho,
    url: anexo.url,
    nome: texto(anexo.nome) || anexo.caminho.split('/').pop() || 'arquivo',
    tipo: texto(anexo.tipo),
    tamanho: typeof anexo.tamanho === 'number' ? anexo.tamanho : 0,
  };
}

export function observacaoDoDocumento(id: string, value: Record<string, unknown>): Observacao | null {
  const autor = refPessoa(value.autor);
  if (typeof value.programacaoId !== 'string' || !autor) return null;
  const criadoEm = value.criadoEm as Timestamp | null | undefined;
  return {
    id,
    programacaoId: value.programacaoId,
    texto: texto(value.texto),
    anexos: (Array.isArray(value.anexos) ? value.anexos : []).map(anexoDo).filter((anexo): anexo is AnexoObservacao => anexo !== null),
    autor,
    criadoEm: criadoEm && typeof criadoEm.toMillis === 'function' ? criadoEm.toMillis() : null,
  };
}

export function observarSemanas(onData: (semanas: Semana[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, SEMANAS), (snapshot) => {
    onData(snapshot.docs
      .filter((item) => semanaIdValido(item.id))
      .map((item) => {
        const value = item.data();
        const semana = semanaDoId(item.id);
        return { id: item.id, inicio: data(value.inicio) ?? semana.inicio, fim: data(value.fim) ?? semana.fim, abertura: value.abertura === 'manual' ? 'manual' : 'automatica' };
      }));
  }, onError);
}

export function observarProgramacoes(onData: (programacoes: Programacao[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, PROGRAMACOES), (snapshot) => {
    onData(snapshot.docs
      .map((item) => programacaoDoDocumento(item.id, item.data()))
      .filter((item): item is Programacao => item !== null));
  }, onError);
}

export function observarObservacoes(onData: (observacoes: Observacao[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, OBSERVACOES), (snapshot) => {
    onData(snapshot.docs
      .map((item) => observacaoDoDocumento(item.id, item.data({ serverTimestamps: 'estimate' })))
      .filter((item): item is Observacao => item !== null));
  }, onError);
}

export interface PessoaFriday { id: string; nome: string; funcao?: string }
export interface PessoasFriday { motoristas: PessoaFriday[]; auxiliares: PessoaFriday[] }

/** Motoristas (quadro FUNCIONARIOS) e auxiliares (Banco de Currículos) do Friday, só nome e função (Function). */
export async function pessoasDoFriday(): Promise<PessoasFriday> {
  const resultado = await httpsCallable<void, PessoasFriday>(functions, 'logisticaPessoasFriday')();
  return { motoristas: resultado.data?.motoristas ?? [], auxiliares: resultado.data?.auxiliares ?? [] };
}

/** Etiquetas de status (logistica-config/status); sem o documento, as padrão. */
export function observarEtiquetas(onData: (etiquetas: EtiquetaStatus[]) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(db, CONFIG, 'status'), (snapshot) => {
    const lista = snapshot.exists() && Array.isArray(snapshot.data().etiquetas) ? snapshot.data().etiquetas as unknown[] : null;
    if (!lista) { onData([...ETIQUETAS_PADRAO]); return; }
    onData(lista.flatMap((item) => {
      const etiqueta = item as Partial<Record<keyof EtiquetaStatus, unknown>> | null;
      return etiqueta && typeof etiqueta.id === 'string' && typeof etiqueta.nome === 'string'
        ? [{ id: etiqueta.id, nome: etiqueta.nome, cor: typeof etiqueta.cor === 'string' ? etiqueta.cor : '#c4c4c4' }]
        : [];
    }));
  }, onError);
}

/** Grava a lista de etiquetas e, no mesmo lote, o status das programações que precisam acompanhar. */
export async function salvarEtiquetas(etiquetas: readonly EtiquetaStatus[], mudancas: readonly { id: string; status: string }[], uid: string): Promise<void> {
  const lote = writeBatch(db);
  lote.set(doc(db, CONFIG, 'status'), { schemaVersion: 1, etiquetas, atualizadoPorUid: uid, atualizadoEm: serverTimestamp() });
  for (const mudanca of mudancas) {
    lote.update(doc(db, PROGRAMACOES, mudanca.id), { status: mudanca.status, atualizadoPorUid: uid, atualizadoEm: serverTimestamp() });
  }
  await lote.commit();
}

/** Cria a semana se ainda não existir; quem chegar depois (outra aba, outro usuário) não faz nada. */
export async function abrirSemana(semanaId: string, abertura: Semana['abertura'], uid: string): Promise<void> {
  const semana = semanaDoId(semanaId);
  const ref = doc(db, SEMANAS, semanaId);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(ref)).exists()) return;
    transaction.set(ref, { schemaVersion: 1, inicio: semana.inicio, fim: semana.fim, abertura, criadoPorUid: uid, criadoEm: serverTimestamp() });
  });
}

/**
 * A linha nasce com o código: o contador da semana sobe um na mesma transação, então duas pessoas criando ao mesmo
 * tempo não repetem número.
 */
export async function criarProgramacao(semanaId: string, item: string, posicao: number, uid: string): Promise<string> {
  const semanaRef = doc(db, SEMANAS, semanaId);
  const ref = doc(collection(db, PROGRAMACOES));
  await runTransaction(db, async (transaction) => {
    const semana = await transaction.get(semanaRef);
    if (!semana.exists()) throw new Error('A semana não está aberta.');
    const numero = (typeof semana.data().contador === 'number' ? semana.data().contador : 0) + 1;
    transaction.update(semanaRef, { contador: numero });
    transaction.set(ref, {
      schemaVersion: 1, cod: codigoDaProgramacao(semanaId, numero), semanaId, item, status: '', inicio: null, fim: null,
      motorista: null, auxiliar: null, veiculos: [], obra: null, posicao,
      criadoPorUid: uid, criadoEm: serverTimestamp(), atualizadoPorUid: uid, atualizadoEm: serverTimestamp(),
    });
  });
  return ref.id;
}

/** Dá código a uma linha de antes do código (uma vez; quem chegar depois, noutra aba, não faz nada). */
export async function darCodigo(id: string, uid: string): Promise<void> {
  const ref = doc(db, PROGRAMACOES, id);
  await runTransaction(db, async (transaction) => {
    const programacao = await transaction.get(ref);
    if (!programacao.exists() || programacao.data().cod) return;
    const semanaId = programacao.data().semanaId as string;
    const semanaRef = doc(db, SEMANAS, semanaId);
    const semana = await transaction.get(semanaRef);
    if (!semana.exists()) return;
    const numero = (typeof semana.data().contador === 'number' ? semana.data().contador : 0) + 1;
    transaction.update(semanaRef, { contador: numero });
    transaction.update(ref, { cod: codigoDaProgramacao(semanaId, numero), atualizadoPorUid: uid, atualizadoEm: serverTimestamp() });
  });
}

export async function atualizarProgramacao(id: string, alteracao: Partial<ProgramacaoEditavel>, uid: string): Promise<void> {
  // Gravar a lista de veículos aposenta o campo antigo `veiculo` do documento.
  const extra = 'veiculos' in alteracao ? { veiculo: deleteField() } : {};
  await updateDoc(doc(db, PROGRAMACOES, id), { ...alteracao, ...extra, atualizadoPorUid: uid, atualizadoEm: serverTimestamp() });
}

async function apagarArquivos(anexos: readonly AnexoObservacao[]): Promise<void> {
  // Arquivo que já não existe não impede a exclusão da observação.
  await Promise.all(anexos.map((anexo) => deleteObject(refArquivo(storage, anexo.caminho)).catch((error: { code?: string }) => {
    if (error?.code !== 'storage/object-not-found') throw error;
  })));
}

async function excluirObservacaoComArquivos(observacao: Pick<Observacao, 'id' | 'anexos'>): Promise<void> {
  await apagarArquivos(observacao.anexos);
  await deleteDoc(doc(db, OBSERVACOES, observacao.id));
}

/** Apaga as observações (e os arquivos) da programação e depois a programação. */
export async function excluirProgramacao(id: string): Promise<void> {
  const observacoes = await getDocs(query(collection(db, OBSERVACOES), where('programacaoId', '==', id)));
  for (const item of observacoes.docs) {
    const observacao = observacaoDoDocumento(item.id, item.data());
    await excluirObservacaoComArquivos({ id: item.id, anexos: observacao?.anexos ?? [] });
  }
  await deleteDoc(doc(db, PROGRAMACOES, id));
}

/**
 * Envia os arquivos para logistica/observacoes/{id}/ e grava a observação com os endereços. Se a gravação falhar,
 * os arquivos enviados são apagados.
 */
export async function publicarObservacao(
  programacaoId: string,
  textoObservacao: string,
  arquivos: readonly File[],
  autor: RefPessoa,
  aoEnviar?: (enviados: number) => void,
): Promise<void> {
  const grande = arquivos.find((arquivo) => arquivo.size > LIMITE_ARQUIVO);
  if (grande) throw new Error(`“${grande.name}” passa de 25 MB, o limite por arquivo.`);
  if (arquivos.length > MAX_ANEXOS) throw new Error(`No máximo ${MAX_ANEXOS} arquivos por observação.`);
  const ref = doc(collection(db, OBSERVACOES));
  const anexos: AnexoObservacao[] = [];
  try {
    for (const [indice, arquivo] of arquivos.entries()) {
      const caminho = `logistica/observacoes/${ref.id}/${indice + 1}-${arquivo.name.replace(/[/\\]/g, '_')}`;
      const tipo = arquivo.type || 'application/octet-stream';
      const alvo = refArquivo(storage, caminho);
      await uploadBytes(alvo, arquivo, { contentType: tipo, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(arquivo.name)}` });
      anexos.push({ caminho, url: await getDownloadURL(alvo), nome: arquivo.name, tipo, tamanho: arquivo.size });
      aoEnviar?.(indice + 1);
    }
    await setDoc(ref, {
      schemaVersion: 1, programacaoId, texto: textoObservacao, anexos, autor, criadoEm: serverTimestamp(),
    });
  } catch (error) {
    await apagarArquivos(anexos).catch(() => undefined);
    throw error;
  }
}

export async function excluirObservacao(observacao: Observacao): Promise<void> {
  await excluirObservacaoComArquivos(observacao);
}
