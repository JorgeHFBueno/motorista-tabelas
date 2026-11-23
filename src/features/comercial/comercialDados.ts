import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase';
import {
  CATEGORIAS_CONTATO, ETAPAS, GRUPOS_ARQUIVO, MOTIVOS_PERDA, ORIGENS, PRIORIDADES, TIPOS_CONTATO,
  camposDoContato, camposDoNegocio, camposDaEtapa, dataValida,
  type ArquivoNegocio, type Contato, type ContatoForm, type Etapa, type GrupoArquivo, type Negocio, type NegocioForm, type PessoaRef,
} from './comercialDominio';

// Comercial: comercial-negocios (com a subcoleção atualizacoes), comercial-contatos e os arquivos em
// comercial/negocios/{id}/. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/comercial.md. Ninguém apaga negócio nem
// contato: a lixeira é excluidoEm/excluidoPor. Quem grava assina (as Rules conferem o uid).

const NEGOCIOS = 'comercial-negocios';
const CONTATOS = 'comercial-contatos';
export const LIMITE_ARQUIVO = 25 * 1024 * 1024;

const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const data = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pessoa = (v: unknown): PessoaRef | null => {
  const raw = v as { uid?: unknown; nome?: unknown } | null | undefined;
  return raw && typeof raw.uid === 'string' ? { uid: raw.uid, nome: texto(raw.nome) } : null;
};
const daLista = <T extends { id: string }>(lista: readonly T[], v: unknown) => (lista.some((i) => i.id === v) ? (v as T['id']) : null);

function arquivo(v: unknown): ArquivoNegocio | null {
  const raw = v as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw.path !== 'string' || !raw.path) return null;
  return {
    path: raw.path,
    nome: texto(raw.nome) || 'arquivo',
    contentType: texto(raw.contentType),
    bytes: numero(raw.bytes) ?? 0,
    grupo: daLista(GRUPOS_ARQUIVO, raw.grupo) ?? 'outros',
  };
}

function paraNegocio(id: string, d: DocumentData): Negocio {
  const origemFriday = d.origemFriday as { quadroId?: unknown; itemId?: unknown; quadro?: unknown } | null | undefined;
  return {
    id,
    titulo: texto(d.titulo),
    cliente: texto(d.cliente),
    segmento: d.segmento === 'publico' ? 'publico' : 'privado',
    tipo: d.tipo === 'projeto' ? 'projeto' : 'negocio',
    etapa: daLista(ETAPAS, d.etapa) ?? 'lead',
    responsaveis: Array.isArray(d.responsaveis) ? d.responsaveis.filter((u: unknown): u is string => typeof u === 'string' && Boolean(u)) : [],
    prioridade: daLista(PRIORIDADES, d.prioridade),
    origem: daLista(ORIGENS, d.origem),
    valor: numero(d.valor),
    metragem: numero(d.metragem),
    dataCriacao: dataValida(d.dataCriacao) ? d.dataCriacao : '',
    dataFechamento: dataValida(d.dataFechamento) ? d.dataFechamento : null,
    motivoPerda: daLista(MOTIVOS_PERDA, d.motivoPerda),
    contatoIds: Array.isArray(d.contatoIds) ? d.contatoIds.filter((c: unknown): c is string => typeof c === 'string') : [],
    arquivos: Array.isArray(d.arquivos) ? d.arquivos.map(arquivo).filter((a: ArquivoNegocio | null): a is ArquivoNegocio => a !== null) : [],
    origemFriday: origemFriday && typeof origemFriday.itemId === 'number'
      ? { quadroId: Number(origemFriday.quadroId), itemId: origemFriday.itemId, quadro: texto(origemFriday.quadro) || undefined }
      : null,
    criadoPor: pessoa(d.criadoPor),
    atualizadoPor: pessoa(d.atualizadoPor),
    atualizadoEm: data(d.atualizadoEm),
    excluidoEm: data(d.excluidoEm),
    excluidoPor: pessoa(d.excluidoPor),
  };
}

function paraContato(id: string, d: DocumentData): Contato {
  return {
    id,
    nome: texto(d.nome),
    tipo: daLista(TIPOS_CONTATO, d.tipo),
    categoria: daLista(CATEGORIAS_CONTATO, d.categoria),
    empresa: texto(d.empresa),
    cargo: texto(d.cargo),
    email: texto(d.email),
    telefone: texto(d.telefone),
    notas: texto(d.notas),
    excluidoEm: data(d.excluidoEm),
  };
}

/** Todos os negócios (lixeira inclusa), em tempo real; a tela filtra e ordena. */
export function ouvirNegocios(onNext: (itens: Negocio[]) => void, onError: (erro: FirestoreError) => void) {
  return onSnapshot(collection(db, NEGOCIOS), (snap) => {
    onNext(snap.docs.map((d) => paraNegocio(d.id, d.data({ serverTimestamps: 'estimate' })))
      .sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao) || a.titulo.localeCompare(b.titulo, 'pt-BR')));
  }, onError);
}

export function ouvirContatos(onNext: (itens: Contato[]) => void, onError: (erro: FirestoreError) => void) {
  return onSnapshot(collection(db, CONTATOS), (snap) => {
    onNext(snap.docs.map((d) => paraContato(d.id, d.data({ serverTimestamps: 'estimate' })))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
  }, onError);
}

/** Id gerado antes, para os arquivos subirem em comercial/negocios/{id}/ antes do documento existir. */
export const novoIdNegocio = () => doc(collection(db, NEGOCIOS)).id;

const assinatura = (autor: PessoaRef) => ({ atualizadoPor: autor, atualizadoEm: serverTimestamp() });

export async function criarNegocio(id: string, form: NegocioForm, arquivos: ArquivoNegocio[], autor: PessoaRef, hoje: string) {
  await setDoc(doc(db, NEGOCIOS, id), {
    schemaVersion: 1,
    ...camposDoNegocio(form, hoje),
    arquivos,
    origemFriday: null,
    criadoPor: autor,
    registradoEm: serverTimestamp(),
    ...assinatura(autor),
    excluidoEm: null,
    excluidoPor: null,
  });
}

export const editarNegocio = (id: string, form: NegocioForm, arquivos: ArquivoNegocio[], autor: PessoaRef, hoje: string) =>
  updateDoc(doc(db, NEGOCIOS, id), { ...camposDoNegocio(form, hoje), arquivos, ...assinatura(autor) });

export const moverEtapa = (n: Negocio, nova: Etapa, autor: PessoaRef, hoje: string) =>
  updateDoc(doc(db, NEGOCIOS, n.id), { ...camposDaEtapa(n, nova, hoje), ...assinatura(autor) });

export const negocioParaLixeira = (id: string, autor: PessoaRef) =>
  updateDoc(doc(db, NEGOCIOS, id), { excluidoEm: serverTimestamp(), excluidoPor: autor, ...assinatura(autor) });

export const restaurarNegocio = (id: string, autor: PessoaRef) =>
  updateDoc(doc(db, NEGOCIOS, id), { excluidoEm: null, excluidoPor: null, ...assinatura(autor) });

/** Sobe um arquivo para comercial/negocios/{id}/ (as Rules não deixam sobrescrever: o nome leva a hora). */
export async function enviarArquivoNegocio(negocioId: string, file: File, grupo: GrupoArquivo): Promise<ArquivoNegocio> {
  if (file.size > LIMITE_ARQUIVO) throw new Error('O arquivo passa do limite de 25 MB.');
  const nome = file.name.replace(/[\\/#?[\]]/g, '_');
  const path = `comercial/negocios/${negocioId}/${Date.now()}-${nome}`;
  const contentType = file.type || 'application/octet-stream';
  await uploadBytes(ref(storage, path), file, { contentType });
  return { path, nome: file.name, contentType, bytes: file.size, grupo };
}

/** Apaga o arquivo do Storage (o negócio já foi gravado sem ele). Arquivo que não existe mais não é erro. */
export async function apagarArquivoNegocio(path: string) {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if ((err as { code?: string })?.code !== 'storage/object-not-found') throw err;
  }
}

// ---------------------------------------------------------------- linha do tempo

export type AtualizacaoNegocio = { id: string; texto: string; autor: PessoaRef | null; autorNome: string; criadoEm: Date | null };

export function ouvirAtualizacoes(negocioId: string, onNext: (itens: AtualizacaoNegocio[]) => void, onError: (erro: FirestoreError) => void) {
  return onSnapshot(query(collection(db, NEGOCIOS, negocioId, 'atualizacoes'), orderBy('criadoEm', 'desc')), (snap) => {
    onNext(snap.docs.map((d) => {
      const raw = d.data({ serverTimestamps: 'estimate' });
      const autor = pessoa(raw.autor);
      return { id: d.id, texto: texto(raw.texto), autor, autorNome: autor?.nome || 'Sem autor', criadoEm: data(raw.criadoEm) };
    }));
  }, onError);
}

export const adicionarAtualizacao = (negocioId: string, textoNovo: string, autor: PessoaRef) =>
  addDoc(collection(db, NEGOCIOS, negocioId, 'atualizacoes'), { texto: textoNovo.trim(), autor, criadoEm: serverTimestamp() });

export const apagarAtualizacao = (negocioId: string, id: string) => deleteDoc(doc(db, NEGOCIOS, negocioId, 'atualizacoes', id));

// ---------------------------------------------------------------- contatos

export async function criarContato(form: ContatoForm, autor: PessoaRef) {
  const novo = doc(collection(db, CONTATOS));
  await setDoc(novo, {
    schemaVersion: 1,
    ...camposDoContato(form),
    origemFriday: null,
    criadoPor: autor,
    registradoEm: serverTimestamp(),
    ...assinatura(autor),
    excluidoEm: null,
    excluidoPor: null,
  });
  return novo.id;
}

export const editarContato = (id: string, form: ContatoForm, autor: PessoaRef) =>
  updateDoc(doc(db, CONTATOS, id), { ...camposDoContato(form), ...assinatura(autor) });

export const contatoParaLixeira = (id: string, autor: PessoaRef) =>
  updateDoc(doc(db, CONTATOS, id), { excluidoEm: serverTimestamp(), excluidoPor: autor, ...assinatura(autor) });

export const restaurarContato = (id: string, autor: PessoaRef) =>
  updateDoc(doc(db, CONTATOS, id), { excluidoEm: null, excluidoPor: null, ...assinatura(autor) });
