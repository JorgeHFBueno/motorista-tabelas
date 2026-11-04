import {
  collection,
  doc,
  increment,
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
import { db } from '../../firebase';
import { PORTAL_COLECOES, type ArquivoPortal, type PessoaRef } from './portalDominio';

// portal-atendimentos and their mensagens, team side (adm2). Contract: The Manuscript, 01_FIRESTORE/COLECOES/portal.md.
// adm2 reads every ticket; it updates one only while obraId/clienteDocumento still match portal-obras (the Rules).

export const STATUS_ATENDIMENTO = ['aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'fechado'] as const;
export const CATEGORIAS_ATENDIMENTO = ['tecnico', 'financeiro', 'comercial', 'outro'] as const;
export const PRIORIDADES_ATENDIMENTO = ['baixa', 'media', 'alta'] as const;

export type StatusAtendimento = (typeof STATUS_ATENDIMENTO)[number];
export type CategoriaAtendimento = (typeof CATEGORIAS_ATENDIMENTO)[number];
export type PrioridadeAtendimento = (typeof PRIORIDADES_ATENDIMENTO)[number];
export type AutorTipo = 'cliente' | 'equipe';

export const ROTULO_STATUS: Record<StatusAtendimento, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_cliente: 'Aguardando cliente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const ROTULO_CATEGORIA: Record<CategoriaAtendimento, string> = {
  tecnico: 'Técnico',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  outro: 'Outro',
};

export const ROTULO_PRIORIDADE: Record<PrioridadeAtendimento, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

export type Atendimento = {
  id: string;
  obraId: string;
  clienteDocumento: string;
  criadoPor: PessoaRef | null;
  titulo: string;
  descricaoInicial: string;
  categoria: CategoriaAtendimento;
  prioridade: PrioridadeAtendimento;
  status: StatusAtendimento;
  responsavel: PessoaRef | null;
  ultimaMensagem: { resumo: string; em: Date | null; autorTipo: AutorTipo };
  naoLidasCliente: number;
  naoLidasEquipe: number;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
};

export type MensagemAtendimento = {
  id: string;
  autor: PessoaRef | null;
  autorTipo: AutorTipo;
  texto: string;
  anexos: ArquivoPortal[];
  criadoEm: Date | null;
};

/** Contract name and CNPJ/CPF from portal-obras, to show the ticket and check it can still be updated. */
export type ObraResumo = { nome: string; clienteDocumento: string };

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
const inteiro = (valor: unknown) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0);
const data = (valor: unknown) => (valor instanceof Timestamp ? valor.toDate() : null);
const pessoa = (valor: unknown): PessoaRef | null => {
  const raw = valor as { uid?: unknown; nome?: unknown } | null | undefined;
  return raw && typeof raw.uid === 'string' ? { uid: raw.uid, nome: texto(raw.nome) } : null;
};
const umDe = <T extends string>(valores: readonly T[], valor: unknown, padrao: T): T =>
  valores.includes(valor as T) ? (valor as T) : padrao;

const arquivos = (valor: unknown): ArquivoPortal[] =>
  Array.isArray(valor)
    ? valor
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.path === 'string')
      .map((item) => ({
        path: item.path as string,
        nome: texto(item.nome) || 'arquivo',
        contentType: texto(item.contentType),
        bytes: inteiro(item.bytes),
      }))
    : [];

function paraAtendimento(id: string, d: DocumentData): Atendimento {
  const ultima = (d.ultimaMensagem ?? {}) as { resumo?: unknown; em?: unknown; autorTipo?: unknown };
  return {
    id,
    obraId: texto(d.obraId),
    clienteDocumento: texto(d.clienteDocumento),
    criadoPor: pessoa(d.criadoPor),
    titulo: texto(d.titulo) || 'Atendimento',
    descricaoInicial: texto(d.descricaoInicial),
    categoria: umDe(CATEGORIAS_ATENDIMENTO, d.categoria, 'outro'),
    prioridade: umDe(PRIORIDADES_ATENDIMENTO, d.prioridade, 'media'),
    status: umDe(STATUS_ATENDIMENTO, d.status, 'aberto'),
    responsavel: pessoa(d.responsavel),
    ultimaMensagem: { resumo: texto(ultima.resumo), em: data(ultima.em), autorTipo: ultima.autorTipo === 'equipe' ? 'equipe' : 'cliente' },
    naoLidasCliente: inteiro(d.naoLidasCliente),
    naoLidasEquipe: inteiro(d.naoLidasEquipe),
    criadoEm: data(d.criadoEm),
    atualizadoEm: data(d.atualizadoEm),
  };
}

function paraMensagem(id: string, d: DocumentData): MensagemAtendimento {
  return {
    id,
    autor: pessoa(d.autor),
    autorTipo: d.autorTipo === 'equipe' ? 'equipe' : 'cliente',
    texto: typeof d.texto === 'string' ? d.texto : '',
    anexos: arquivos(d.anexos),
    criadoEm: data(d.criadoEm),
  };
}

const atendimentos = () => collection(db, PORTAL_COLECOES.atendimentos);
const atendimentoRef = (id: string) => doc(db, PORTAL_COLECOES.atendimentos, id);
const mensagens = (id: string) => collection(db, PORTAL_COLECOES.atendimentos, id, 'mensagens');

/** Every ticket, latest activity first (sorted here, no composite index). */
export function ouvirAtendimentos(onNext: (itens: Atendimento[]) => void, onError: (erro: FirestoreError) => void) {
  return onSnapshot(
    atendimentos(),
    (snapshot) => {
      const itens = snapshot.docs.map((item) => paraAtendimento(item.id, item.data({ serverTimestamps: 'estimate' })));
      const quando = (a: Atendimento) => (a.ultimaMensagem.em ?? a.criadoEm)?.getTime() ?? 0;
      onNext(itens.sort((a, b) => quando(b) - quando(a)));
    },
    onError,
  );
}

/** Name and CNPJ/CPF of every published contract, by portal-obras id. */
export function ouvirObrasResumo(onNext: (obras: Map<string, ObraResumo>) => void, onError: (erro: FirestoreError) => void) {
  return onSnapshot(
    collection(db, PORTAL_COLECOES.obras),
    (snapshot) => onNext(new Map(snapshot.docs.map((item) => {
      const d = item.data();
      return [item.id, { nome: texto(d.nome) || item.id, clienteDocumento: texto(d.clienteDocumento) }];
    }))),
    onError,
  );
}

export function ouvirMensagens(
  atendimentoId: string,
  onNext: (itens: MensagemAtendimento[]) => void,
  onError: (erro: FirestoreError) => void,
) {
  return onSnapshot(
    query(mensagens(atendimentoId), orderBy('criadoEm', 'asc')),
    (snapshot) => onNext(snapshot.docs.map((item) => paraMensagem(item.id, item.data({ serverTimestamps: 'estimate' })))),
    onError,
  );
}

/** The Rules let adm2 update a ticket only while its contract keeps the same CNPJ/CPF (and still exists). */
export const contratoConfere = (atendimento: Atendimento, obras: Map<string, ObraResumo>) =>
  obras.get(atendimento.obraId)?.clienteDocumento === atendimento.clienteDocumento;

export const erroDePermissao = (erro: unknown) => (erro as { code?: unknown } | null)?.code === 'permission-denied';

const resumir = (valor: string, max = 140) => (valor.length > max ? `${valor.slice(0, max - 1)}…` : valor);

/** Team reply: the message first (immutable), then the ticket summary and unread counters. */
export async function responderAtendimento(atendimentoId: string, autor: PessoaRef, textoMensagem: string) {
  const mensagem = textoMensagem.trim();
  if (!mensagem) throw new Error('Escreva uma mensagem antes de enviar.');
  await setDoc(doc(mensagens(atendimentoId)), {
    autor,
    autorTipo: 'equipe',
    texto: mensagem,
    anexos: [],
    criadoEm: serverTimestamp(),
  });
  await updateDoc(atendimentoRef(atendimentoId), {
    ultimaMensagem: { resumo: resumir(mensagem), em: serverTimestamp(), autorTipo: 'equipe' },
    naoLidasCliente: increment(1),
    naoLidasEquipe: 0,
    atualizadoEm: serverTimestamp(),
  });
}

export const alterarStatusAtendimento = (atendimentoId: string, status: StatusAtendimento) =>
  updateDoc(atendimentoRef(atendimentoId), { status, atualizadoEm: serverTimestamp() });

export const alterarResponsavelAtendimento = (atendimentoId: string, responsavel: PessoaRef | null) =>
  updateDoc(atendimentoRef(atendimentoId), { responsavel, atualizadoEm: serverTimestamp() });

/** Read by the team, like the client's own mark (no atualizadoEm: reading is not activity). */
export const marcarLidoPelaEquipe = (atendimentoId: string) => updateDoc(atendimentoRef(atendimentoId), { naoLidasEquipe: 0 });
