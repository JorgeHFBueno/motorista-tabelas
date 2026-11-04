import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { listarObras } from '../obras/obrasData';
import { localPendente, type ObraDetalhe } from '../obras/obrasDomain';
import { contratoPortalDe, ehColunaCnpjCliente, type LinhaContrato } from './contratosPortalDominio';
import { normalizarDocumento, PORTAL_COLECOES, type ContratoPortal, type PessoaRef } from './portalDominio';
import { progressoPadrao, type ProgressoObra } from './progressoObra';

// Contracts in the client portal (team side, adm2): portal-obras/{id} with the id of obras-v2/{id}.
// The Manuscript: 01_FIRESTORE/COLECOES/portal.md. Rules: firestore.rules, "client portal".

/** Every obras-v2 contract with its portal-obras document (null when not published). */
export async function listarContratos(): Promise<LinhaContrato[]> {
  const [obras, publicados] = await Promise.all([listarObras(), getDocs(collection(db, PORTAL_COLECOES.obras))]);
  const portal = new Map(publicados.docs.map((item) => [item.id, contratoPortalDe(item.id, item.data())]));
  return obras.map((obra) => ({ obra, portal: portal.get(obra.id) ?? null }));
}

export type DocumentoDoFriday =
  | { situacao: 'ok'; documento: string }
  | { situacao: 'invalido'; valor: string }
  | { situacao: 'vazio' | 'sem_item' | 'sem_coluna' };

/**
 * CNPJ/CPF of the contract in the Friday: the item linked to the contract (vinculo.id = obraId, not a sub-item, not in
 * the trash), column "CNPJ/CPF Cliente" of its board, normalized.
 */
export async function documentoDoFriday(obraId: string): Promise<DocumentoDoFriday> {
  const itens = await getDocs(query(collection(db, 'friday-itens'), where('vinculo.id', '==', obraId)));
  const item = itens.docs.map((d) => d.data()).find((d) => d.vinculo?.sub == null && !d.excluido_em && typeof d.quadro_id === 'number');
  if (!item) return { situacao: 'sem_item' };
  const colunas = await getDocs(query(collection(db, 'friday-colunas'), where('quadro_id', '==', item.quadro_id)));
  const coluna = colunas.docs.find((d) => ehColunaCnpjCliente(d.data().titulo));
  if (!coluna) return { situacao: 'sem_coluna' };
  const bruto = (item.valores as Record<string, unknown> | undefined)?.[String(coluna.data().id ?? coluna.id)];
  const valor = typeof bruto === 'string' ? bruto.trim() : typeof bruto === 'number' ? String(bruto) : '';
  if (!valor) return { situacao: 'vazio' };
  const documento = normalizarDocumento(valor);
  return documento ? { situacao: 'ok', documento } : { situacao: 'invalido', valor };
}

/** Creates portal-obras/{obra.id} from obras-v2. There is no unpublish: the Rules forbid deleting portal-obras. */
export async function publicarContrato(obra: ObraDetalhe, clienteDocumento: string, pessoa: PessoaRef): Promise<void> {
  const documento = normalizarDocumento(clienteDocumento);
  if (!documento) throw new Error('CNPJ/CPF inválido.');
  const ref = doc(db, PORTAL_COLECOES.obras, obra.id);
  if ((await getDoc(ref)).exists()) throw new Error('Este contrato já está publicado no portal.');
  const progresso = progressoPadrao();
  await setDoc(ref, {
    clienteDocumento: documento,
    nome: obra.nomeObra,
    local: localPendente(obra.local) ? null : obra.local,
    numeroContrato: obra.numeroContrato || null,
    previsao: { inicio: obra.dataInicial, fim: obra.dataFinal },
    valorContrato: null,
    progresso: { ...progresso, atualizadoEm: null, atualizadoPor: null },
    equipe: { saida: null, chegada: null },
    criadoEm: serverTimestamp(),
    criadoPor: pessoa,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: pessoa,
  });
}

export type DadosResumo = Pick<ContratoPortal, 'clienteDocumento' | 'nome' | 'local' | 'numeroContrato' | 'previsao' | 'valorContrato'>;

const FILHOS = [PORTAL_COLECOES.documentos, PORTAL_COLECOES.fotos, PORTAL_COLECOES.parcelas] as const;
const LIMITE_LOTE = 500;

/**
 * Rewrites clienteDocumento of the contract's documents, photos and installments that differ from the contract's.
 * Runs after portal-obras is saved: the Rules compare each record with the contract's current CNPJ/CPF.
 */
async function sincronizarRegistros(obraId: string, clienteDocumento: string): Promise<number> {
  const snapshots = await Promise.all(FILHOS.map((colecao) => getDocs(query(collection(db, colecao), where('obraId', '==', obraId)))));
  const pendentes = snapshots.flatMap((snapshot) => snapshot.docs.filter((item) => item.data().clienteDocumento !== clienteDocumento));
  for (let inicio = 0; inicio < pendentes.length; inicio += LIMITE_LOTE) {
    const lote = writeBatch(db);
    pendentes.slice(inicio, inicio + LIMITE_LOTE).forEach((item) => lote.update(item.ref, { clienteDocumento }));
    await lote.commit();
  }
  return pendentes.length;
}

export async function contratoTemAtendimentos(obraId: string): Promise<boolean> {
  const snapshot = await getDocs(query(collection(db, PORTAL_COLECOES.atendimentos), where('obraId', '==', obraId), limit(1)));
  return !snapshot.empty;
}

/**
 * Saves the summary of a published contract. A new CNPJ/CPF is refused when the contract has tickets (the Rules keep a
 * ticket's clienteDocumento fixed, so they would become read-only); otherwise the contract is saved first and then its
 * records follow. Returns how many records were rewritten.
 */
export async function salvarResumo(obraId: string, documentoAtual: string, dados: DadosResumo, pessoa: PessoaRef): Promise<number> {
  const documento = normalizarDocumento(dados.clienteDocumento);
  if (!documento) throw new Error('CNPJ/CPF inválido.');
  if (documento !== documentoAtual && (await contratoTemAtendimentos(obraId))) {
    throw new Error('O CNPJ/CPF não pode mudar: este contrato tem atendimentos, que ficam presos ao CNPJ/CPF com que foram abertos.');
  }
  await updateDoc(doc(db, PORTAL_COLECOES.obras, obraId), {
    clienteDocumento: documento,
    nome: dados.nome,
    local: dados.local,
    numeroContrato: dados.numeroContrato,
    previsao: dados.previsao,
    valorContrato: dados.valorContrato,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: pessoa,
  });
  try {
    return await sincronizarRegistros(obraId, documento);
  } catch (err) {
    console.error('Erro ao atualizar o CNPJ/CPF dos registros do contrato', err);
    throw new Error('O contrato foi salvo, mas parte dos documentos, fotos ou parcelas ficou com o CNPJ/CPF antigo (o cliente não os vê). Salve de novo para concluir.');
  }
}

export async function salvarProgresso(obraId: string, progresso: ProgressoObra, pessoa: PessoaRef): Promise<void> {
  await updateDoc(doc(db, PORTAL_COLECOES.obras, obraId), {
    progresso: { etapas: progresso.etapas, progressoGeral: progresso.progressoGeral, atualizadoEm: serverTimestamp(), atualizadoPor: pessoa },
    atualizadoEm: serverTimestamp(),
    atualizadoPor: pessoa,
  });
}

export type MomentoEquipe = 'saida' | 'chegada';

/** Confirms (date and time) or clears (null) the team's departure or arrival. */
export async function salvarEquipe(obraId: string, momento: MomentoEquipe, dataHora: Date | null, pessoa: PessoaRef): Promise<void> {
  await updateDoc(doc(db, PORTAL_COLECOES.obras, obraId), {
    [`equipe.${momento}`]: dataHora ? { dataHora: Timestamp.fromDate(dataHora), confirmadoPor: pessoa, confirmadoEm: serverTimestamp() } : null,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: pessoa,
  });
}
