import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserRole } from "@/types/rbac";
import type {
  CreateSupportTicketInput,
  ReplySupportTicketInput,
  SupportActor,
  SupportTicket,
  SupportTicketMessage,
  UpdateSupportTicketAdminInput,
} from "@/types/support";

const SUPPORT_COLLECTION = "suporteTickets";
const STAFF_ROLES: UserRole[] = ["admin", "gerente", "operacional"];
const SUPPORT_NOTIFICATION_TYPES = [
  "suporte_ticket_novo",
  "suporte_ticket_resposta",
  "suporte_ticket_status",
] as const;

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const coerceNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const truncateText = (value: string, max = 140) =>
  value.length > max ? `${value.slice(0, max - 1)}...` : value;

const mapTicket = (snap: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }): SupportTicket => {
  const data = snap.data();
  return {
    id: snap.id,
    clienteUid: normalizeString(data.clienteUid),
    clienteNome: normalizeString(data.clienteNome) || "Cliente",
    clienteEmail: normalizeString(data.clienteEmail) || null,
    obraId: normalizeString(data.obraId) || null,
    obraNome: normalizeString(data.obraNome) || null,
    titulo: normalizeString(data.titulo) || "Ticket sem título",
    descricaoInicial: normalizeString(data.descricaoInicial),
    categoria: data.categoria,
    prioridade: data.prioridade,
    status: data.status,
    criadoEm: data.criadoEm,
    atualizadoEm: data.atualizadoEm,
    criadoPorTipo: data.criadoPorTipo,
    responsavelUid: normalizeString(data.responsavelUid) || null,
    responsavelNome: normalizeString(data.responsavelNome) || null,
    ultimaMensagemResumo: normalizeString(data.ultimaMensagemResumo),
    ultimaMensagemEm: data.ultimaMensagemEm,
    ultimaMensagemPorTipo: data.ultimaMensagemPorTipo,
    naoLidasCliente: coerceNumber(data.naoLidasCliente),
    naoLidasAdmin: coerceNumber(data.naoLidasAdmin),
  } as SupportTicket;
};

const mapMessage = (snap: QueryDocumentSnapshot<DocumentData>): SupportTicketMessage => {
  const data = snap.data();
  return {
    id: snap.id,
    autorUid: normalizeString(data.autorUid),
    autorNome: normalizeString(data.autorNome) || "Usuário",
    autorTipo: data.autorTipo,
    mensagem: normalizeString(data.mensagem),
    criadoEm: data.criadoEm,
    anexos: Array.isArray(data.anexos) ? data.anexos : [],
  } as SupportTicketMessage;
};

const supportTicketsCollection = collection(db, SUPPORT_COLLECTION);

const supportTicketRef = (ticketId: string) => doc(db, SUPPORT_COLLECTION, ticketId);
const supportMessagesCollection = (ticketId: string) => collection(db, SUPPORT_COLLECTION, ticketId, "mensagens");

type NotificationTarget = {
  ticketId: string;
  obraId?: string | null;
  titulo: string;
  mensagem: string;
  rotaDestino: string;
};

const buildTicketPayload = (input: CreateSupportTicketInput) => {
  const trimmedTitle = normalizeString(input.titulo);
  const trimmedDescription = normalizeString(input.descricaoInicial);

  return {
    ticketPayload: {
      clienteUid: input.clienteUid,
      clienteNome: input.clienteNome,
      clienteEmail: input.clienteEmail ?? null,
      obraId: input.obraId ?? null,
      obraNome: input.obraNome ?? null,
      titulo: trimmedTitle,
      descricaoInicial: trimmedDescription,
      categoria: input.categoria,
      prioridade: input.prioridade,
      status: "aberto",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      criadoPorTipo: "cliente",
      ultimaMensagemResumo: truncateText(trimmedDescription),
      ultimaMensagemEm: serverTimestamp(),
      ultimaMensagemPorTipo: "cliente",
      naoLidasCliente: 0,
      naoLidasAdmin: 1,
    },
  };
};

const buildFirstMessagePayload = (input: CreateSupportTicketInput) => ({
  autorUid: input.clienteUid,
  autorNome: input.clienteNome,
  autorTipo: "cliente",
  mensagem: normalizeString(input.descricaoInicial),
  criadoEm: serverTimestamp(),
  anexos: [],
});

const createTicketDoc = async (ticketId: string, payload: Record<string, unknown>) => {
  const ticketRef = supportTicketRef(ticketId);
  await setDoc(ticketRef, payload);
  return ticketRef;
};

const createInitialMessage = async (ticketId: string, payload: Record<string, unknown>) => {
  const messageRef = doc(supportMessagesCollection(ticketId));
  await setDoc(messageRef, payload);
  return messageRef;
};

const buildNotificationDoc = ({
  userId,
  ticketId,
  obraId,
  tipo,
  titulo,
  mensagem,
  rotaDestino,
}: {
  userId: string;
  ticketId: string;
  obraId?: string | null;
  tipo: (typeof SUPPORT_NOTIFICATION_TYPES)[number];
  titulo: string;
  mensagem: string;
  rotaDestino: string;
}) => ({
  userId,
  obraId: obraId ?? "",
  tipo,
  titulo,
  mensagem,
  lida: false,
  createdAt: serverTimestamp(),
  origemColecao: SUPPORT_COLLECTION,
  origemId: ticketId,
  metadata: {
    rotaDestino,
  },
});

const listActiveStaffRecipients = async () => {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs
    .map((item) => ({
      uid: item.id,
      role: item.data().role as UserRole | undefined,
      ativo: item.data().ativo === true,
      nome: normalizeString(item.data().nome),
    }))
    .filter((item) => item.ativo && item.role && STAFF_ROLES.includes(item.role));
};

const notifyStaffAboutTicket = async ({
  ticketId,
  obraId,
  titulo,
  mensagem,
  rotaDestino,
}: {
  ticketId: string;
  obraId?: string | null;
  titulo: string;
  mensagem: string;
  rotaDestino: string;
}) => {
  const recipients = await listActiveStaffRecipients();
  if (recipients.length === 0) return;

  const batch = writeBatch(db);
  recipients.forEach((recipient) => {
    const notificationRef = doc(collection(db, "users", recipient.uid, "notificacoes"));
    batch.set(
      notificationRef,
      buildNotificationDoc({
        userId: recipient.uid,
        ticketId,
        obraId,
        tipo: "suporte_ticket_novo",
        titulo,
        mensagem,
        rotaDestino,
      }),
    );
  });
  await batch.commit();
};

const createSupportNotification = async ({
  ticketId,
  obraId,
  titulo,
  mensagem,
  rotaDestino,
}: NotificationTarget) => {
  await notifyStaffAboutTicket({
    ticketId,
    obraId,
    titulo,
    mensagem,
    rotaDestino,
  });
};

const notifyClientAboutTicket = async ({
  clientUid,
  ticketId,
  obraId,
  tipo,
  titulo,
  mensagem,
  rotaDestino,
}: {
  clientUid: string;
  ticketId: string;
  obraId?: string | null;
  tipo: "suporte_ticket_resposta" | "suporte_ticket_status";
  titulo: string;
  mensagem: string;
  rotaDestino: string;
}) => {
  const notificationRef = doc(collection(db, "users", clientUid, "notificacoes"));
  await runTransaction(db, async (transaction) => {
    transaction.set(
      notificationRef,
      buildNotificationDoc({
        userId: clientUid,
        ticketId,
        obraId,
        tipo,
        titulo,
        mensagem,
        rotaDestino,
      }),
    );
  });
};

export const subscribeClientTickets = (
  clientUid: string,
  onChange: (tickets: SupportTicket[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe =>
  onSnapshot(
    query(supportTicketsCollection, where("clienteUid", "==", clientUid), orderBy("ultimaMensagemEm", "desc")),
    (snapshot) => {
      onChange(snapshot.docs.map(mapTicket));
    },
    (error) => {
      onError?.(error);
    },
  );

export const subscribeAdminTickets = (
  onChange: (tickets: SupportTicket[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe =>
  onSnapshot(
    query(supportTicketsCollection, orderBy("ultimaMensagemEm", "desc")),
    (snapshot) => {
      onChange(snapshot.docs.map(mapTicket));
    },
    (error) => {
      onError?.(error);
    },
  );

export const subscribeTicket = (
  ticketId: string,
  onChange: (ticket: SupportTicket | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe =>
  onSnapshot(
    supportTicketRef(ticketId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      onChange(mapTicket(snapshot));
    },
    (error) => onError?.(error),
  );

export const subscribeTicketMessages = (
  ticketId: string,
  onChange: (messages: SupportTicketMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe =>
  onSnapshot(
    query(supportMessagesCollection(ticketId), orderBy("criadoEm", "asc")),
    (snapshot) => {
      onChange(snapshot.docs.map(mapMessage));
    },
    (error) => onError?.(error),
  );

export const createSupportTicket = async (
  input: CreateSupportTicketInput,
): Promise<{ ticketId: string }> => {
  const ticketRef = doc(supportTicketsCollection);
  const { ticketPayload } = buildTicketPayload(input);
  const firstMessagePayload = buildFirstMessagePayload(input);
  const notificationPayload = {
    ticketId: ticketRef.id,
    obraId: input.obraId ?? null,
    titulo: `Novo ticket: ${normalizeString(input.titulo)}`,
    mensagem: `${input.clienteNome} abriu um ticket de suporte.`,
    rotaDestino: `/painel/atendimento?ticket=${ticketRef.id}`,
  };

  if (!normalizeString(input.titulo) || !normalizeString(input.descricaoInicial)) {
    throw new Error("Informe título e descrição para abrir o ticket.");
  }

  await createTicketDoc(ticketRef.id, ticketPayload);
  await createInitialMessage(ticketRef.id, firstMessagePayload);
  await createSupportNotification(notificationPayload);

  return { ticketId: ticketRef.id };
};

export const replySupportTicket = async (
  ticketId: string,
  actor: SupportActor,
  input: ReplySupportTicketInput,
): Promise<void> => {
  const trimmedMessage = normalizeString(input.mensagem);
  if (!trimmedMessage) {
    throw new Error("Digite uma mensagem antes de enviar.");
  }

  const messageRef = doc(supportMessagesCollection(ticketId));

  const ticketSnapshot = await runTransaction(db, async (transaction) => {
    const ticketRef = supportTicketRef(ticketId);
    const ticketDoc = await transaction.get(ticketRef);

    if (!ticketDoc.exists()) {
      throw new Error("Ticket não encontrado.");
    }

    const currentTicket = mapTicket(ticketDoc);
    if (currentTicket.status === "fechado") {
      throw new Error("Este ticket já foi fechado e não aceita novas mensagens.");
    }

    const nextStatus =
      actor.tipo === "cliente"
        ? (currentTicket.status === "aguardando_cliente" || currentTicket.status === "resolvido"
          ? "em_andamento"
          : currentTicket.status)
        : (currentTicket.status === "aberto" ? "aguardando_cliente" : currentTicket.status);

    transaction.set(messageRef, {
      autorUid: actor.uid,
      autorNome: actor.nome,
      autorTipo: actor.tipo,
      mensagem: trimmedMessage,
      criadoEm: serverTimestamp(),
      anexos: [],
    });
    transaction.update(ticketRef, {
      atualizadoEm: serverTimestamp(),
      ultimaMensagemResumo: truncateText(trimmedMessage),
      ultimaMensagemEm: serverTimestamp(),
      ultimaMensagemPorTipo: actor.tipo,
      naoLidasCliente: actor.tipo === "admin" ? currentTicket.naoLidasCliente + 1 : 0,
      naoLidasAdmin: actor.tipo === "cliente" ? currentTicket.naoLidasAdmin + 1 : 0,
      status: nextStatus,
      ...(actor.tipo === "admin"
        ? {
            responsavelUid: actor.uid,
            responsavelNome: actor.nome,
          }
        : {}),
    });

    return currentTicket;
  });

  if (actor.tipo === "cliente") {
    await notifyStaffAboutTicket({
      ticketId,
      obraId: ticketSnapshot.obraId,
      titulo: `Resposta no ticket: ${ticketSnapshot.titulo}`,
      mensagem: `${actor.nome} respondeu a um ticket de suporte.`,
      rotaDestino: `/painel/atendimento?ticket=${ticketId}`,
    });
    return;
  }

  await notifyClientAboutTicket({
    clientUid: ticketSnapshot.clienteUid,
    ticketId,
    obraId: ticketSnapshot.obraId,
    tipo: "suporte_ticket_resposta",
    titulo: `Resposta no ticket: ${ticketSnapshot.titulo}`,
    mensagem: `${actor.nome} respondeu ao seu ticket.`,
    rotaDestino: `/cliente/atendimento?ticket=${ticketId}`,
  });
};

export const updateSupportTicketAdmin = async (
  ticketId: string,
  actor: SupportActor,
  input: UpdateSupportTicketAdminInput,
): Promise<void> => {
  const ticketRef = supportTicketRef(ticketId);
  const beforeSnap = await getDoc(ticketRef);
  if (!beforeSnap.exists()) {
    throw new Error("Ticket não encontrado.");
  }

  const previousTicket = mapTicket(beforeSnap as QueryDocumentSnapshot<DocumentData>);
  await runTransaction(db, async (transaction) => {
    const currentSnap = await transaction.get(ticketRef);
    if (!currentSnap.exists()) {
      throw new Error("Ticket não encontrado.");
    }

    transaction.update(ticketRef, {
      ...(input.status ? { status: input.status } : {}),
      ...(input.categoria ? { categoria: input.categoria } : {}),
      ...(input.prioridade ? { prioridade: input.prioridade } : {}),
      responsavelUid: input.responsavelUid === undefined ? actor.uid : input.responsavelUid,
      responsavelNome: input.responsavelNome === undefined ? actor.nome : input.responsavelNome,
      atualizadoEm: serverTimestamp(),
    });
  });

  if (input.status && input.status !== previousTicket.status) {
    await notifyClientAboutTicket({
      clientUid: previousTicket.clienteUid,
      ticketId,
      obraId: previousTicket.obraId,
      tipo: "suporte_ticket_status",
      titulo: `Status atualizado: ${previousTicket.titulo}`,
      mensagem: `O ticket foi atualizado para ${input.status}.`,
      rotaDestino: `/cliente/atendimento?ticket=${ticketId}`,
    });
  }
};

export const markTicketReadByClient = async (ticketId: string) => {
  await runTransaction(db, async (transaction) => {
    const ticketRef = supportTicketRef(ticketId);
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists()) return;
    const ticket = mapTicket(ticketSnap);
    if (ticket.naoLidasCliente === 0) return;
    transaction.update(ticketRef, {
      naoLidasCliente: 0,
      atualizadoEm: serverTimestamp(),
    });
  });
};

export const markTicketReadByAdmin = async (ticketId: string) => {
  await runTransaction(db, async (transaction) => {
    const ticketRef = supportTicketRef(ticketId);
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists()) return;
    const ticket = mapTicket(ticketSnap);
    if (ticket.naoLidasAdmin === 0) return;
    transaction.update(ticketRef, {
      naoLidasAdmin: 0,
      atualizadoEm: serverTimestamp(),
    });
  });
};
