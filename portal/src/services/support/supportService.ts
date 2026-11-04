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
  where,
  type DocumentData,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PORTAL_COLECOES, toMillis } from "@/lib/portal";
import type { ObraDoc, PessoaRef } from "@/types/rbac";
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketMessage,
  type SupportTicketPriority,
} from "@/types/support";

// Client side of portal-atendimentos (Manuscript portal.md). Notices to the team come with the Functions stage.
const IN_LIMIT = 30;

const ticketsCollection = () => collection(db, PORTAL_COLECOES.atendimentos);
const ticketRef = (ticketId: string) => doc(db, PORTAL_COLECOES.atendimentos, ticketId);
const messagesCollection = (ticketId: string) => collection(db, PORTAL_COLECOES.atendimentos, ticketId, "mensagens");

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const asTimestamp = (value: unknown) => (value instanceof Timestamp ? value : undefined);
const asPessoa = (value: unknown): PessoaRef | null => {
  const raw = value as { uid?: unknown; nome?: unknown } | null | undefined;
  return raw && typeof raw.uid === "string" ? { uid: raw.uid, nome: asString(raw.nome) } : null;
};
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

const truncateText = (value: string, max = 140) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const mapTicket = (id: string, data: DocumentData): SupportTicket => {
  const ultima = (data.ultimaMensagem ?? {}) as { resumo?: unknown; em?: unknown; autorTipo?: unknown };
  return {
    id,
    obraId: asString(data.obraId),
    clienteDocumento: asString(data.clienteDocumento),
    criadoPor: asPessoa(data.criadoPor),
    titulo: asString(data.titulo) || "Atendimento",
    descricaoInicial: asString(data.descricaoInicial),
    categoria: oneOf(SUPPORT_TICKET_CATEGORIES, data.categoria, "outro"),
    prioridade: oneOf(SUPPORT_TICKET_PRIORITIES, data.prioridade, "media"),
    status: oneOf(SUPPORT_TICKET_STATUSES, data.status, "aberto"),
    responsavel: asPessoa(data.responsavel),
    ultimaMensagemResumo: asString(ultima.resumo),
    ultimaMensagemEm: asTimestamp(ultima.em),
    ultimaMensagemPorTipo: ultima.autorTipo === "equipe" ? "equipe" : "cliente",
    naoLidasCliente: asNumber(data.naoLidasCliente),
    naoLidasEquipe: asNumber(data.naoLidasEquipe),
    criadoEm: asTimestamp(data.criadoEm),
    atualizadoEm: asTimestamp(data.atualizadoEm),
  };
};

const mapMessage = (id: string, data: DocumentData): SupportTicketMessage => {
  const autor = asPessoa(data.autor);
  return {
    id,
    autorUid: autor?.uid ?? "",
    autorNome: autor?.nome || (data.autorTipo === "equipe" ? "Equipe Ledur" : "Cliente"),
    autorTipo: data.autorTipo === "equipe" ? "equipe" : "cliente",
    mensagem: asString(data.texto),
    criadoEm: asTimestamp(data.criadoEm),
    anexos: Array.isArray(data.anexos) ? data.anexos : [],
  };
};

// Tickets of the client's CNPJ/CPF (shared by every login of the same CNPJ/CPF), newest activity first.
export const subscribeClientTickets = (
  documentos: string[],
  onNext: (tickets: SupportTicket[]) => void,
  onError: (error: FirestoreError) => void,
) =>
  onSnapshot(
    query(ticketsCollection(), where("clienteDocumento", "in", documentos.slice(0, IN_LIMIT))),
    (snapshot) =>
      onNext(
        snapshot.docs
          .map((item) => mapTicket(item.id, item.data()))
          .sort((a, b) => toMillis(b.ultimaMensagemEm ?? b.criadoEm) - toMillis(a.ultimaMensagemEm ?? a.criadoEm)),
      ),
    onError,
  );

// `confirmado` is false while the ticket exists only on this device (write not yet acknowledged by the server).
export const subscribeTicket = (
  ticketId: string,
  onNext: (ticket: SupportTicket | null, confirmado: boolean) => void,
  onError: (error: FirestoreError) => void,
) =>
  onSnapshot(
    ticketRef(ticketId),
    { includeMetadataChanges: true },
    (snap) => onNext(snap.exists() ? mapTicket(snap.id, snap.data()) : null, !snap.metadata.hasPendingWrites),
    onError,
  );

export const subscribeTicketMessages = (
  ticketId: string,
  onNext: (messages: SupportTicketMessage[]) => void,
  onError: (error: FirestoreError) => void,
) =>
  onSnapshot(
    query(messagesCollection(ticketId), orderBy("criadoEm", "asc")),
    (snapshot) => onNext(snapshot.docs.map((item) => mapMessage(item.id, item.data()))),
    onError,
  );

// The ticket is written first: the message Rules read the ticket, which must already exist.
export const createSupportTicket = async ({
  obra,
  autor,
  titulo,
  descricaoInicial,
  categoria,
  prioridade,
}: {
  obra: ObraDoc;
  autor: PessoaRef;
  titulo: string;
  descricaoInicial: string;
  categoria: SupportTicketCategory;
  prioridade: SupportTicketPriority;
}) => {
  const tituloLimpo = titulo.trim();
  const descricao = descricaoInicial.trim();
  if (!tituloLimpo) throw new Error("Informe um título para o atendimento.");
  if (!descricao) throw new Error("Descreva o que você precisa.");

  const novoTicket = doc(ticketsCollection());
  await setDoc(novoTicket, {
    obraId: obra.id,
    clienteDocumento: obra.clienteDocumento,
    criadoPor: autor,
    titulo: tituloLimpo,
    descricaoInicial: descricao,
    categoria,
    prioridade,
    status: "aberto",
    responsavel: null,
    ultimaMensagem: { resumo: truncateText(descricao), em: serverTimestamp(), autorTipo: "cliente" },
    naoLidasCliente: 0,
    naoLidasEquipe: 1,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });

  await setDoc(doc(messagesCollection(novoTicket.id)), {
    autor,
    autorTipo: "cliente",
    texto: descricao,
    anexos: [],
    criadoEm: serverTimestamp(),
  });

  return { ticketId: novoTicket.id };
};

export const replySupportTicket = async (ticketId: string, autor: PessoaRef, texto: string) => {
  const mensagem = texto.trim();
  if (!mensagem) throw new Error("Escreva uma mensagem antes de enviar.");

  await setDoc(doc(messagesCollection(ticketId)), {
    autor,
    autorTipo: "cliente",
    texto: mensagem,
    anexos: [],
    criadoEm: serverTimestamp(),
  });

  await updateDoc(ticketRef(ticketId), {
    ultimaMensagem: { resumo: truncateText(mensagem), em: serverTimestamp(), autorTipo: "cliente" },
    naoLidasEquipe: increment(1),
    naoLidasCliente: 0,
    atualizadoEm: serverTimestamp(),
  });
};

export const markTicketReadByClient = (ticketId: string) => updateDoc(ticketRef(ticketId), { naoLidasCliente: 0 });
