import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppNotification, NotificationMetadata, NotificationType } from "@/types/notifications";

const isDev = import.meta.env.DEV;

const logNotificationsDebug = (message: string, payload?: Record<string, unknown>) => {
  if (!isDev) return;
  console.info(`[NOTIFICATIONS] ${message}`, payload ?? {});
};

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeBoolean = (value: unknown): boolean => value === true;

const mapNotification = (
  snap: QueryDocumentSnapshot<DocumentData>,
): AppNotification => {
  const data = snap.data();
  return {
    id: snap.id,
    userId: normalizeString(data.userId),
    obraId: normalizeString(data.obraId),
    tipo: normalizeString(data.tipo) as NotificationType,
    titulo: normalizeString(data.titulo) || "Notificação",
    mensagem: normalizeString(data.mensagem) || "Você recebeu uma atualização.",
    lida: normalizeBoolean(data.lida),
    createdAt: data.createdAt,
    origemColecao: typeof data.origemColecao === "string" ? data.origemColecao : null,
    origemId: typeof data.origemId === "string" ? data.origemId : null,
    metadata:
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as NotificationMetadata)
        : undefined,
  };
};

const buildNotificationsCollection = (uid: string) =>
  collection(db, "users", uid, "notificacoes");

export const subscribeToNotifications = (
  uid: string,
  onChange: (notifications: AppNotification[]) => void,
  limitCount = 20,
): Unsubscribe => {
  const notificationQuery = query(
    buildNotificationsCollection(uid),
    orderBy("createdAt", "desc"),
    limit(limitCount),
  );

  return onSnapshot(notificationQuery, (snapshot) => {
    const notifications = snapshot.docs.map(mapNotification);
    const unreadCount = notifications.filter((item) => !item.lida).length;

    logNotificationsDebug("snapshot atualizado", {
      uid,
      total: notifications.length,
      unreadCount,
    });

    onChange(notifications);
  });
};

export const markNotificationAsRead = async (
  uid: string,
  notificationId: string,
): Promise<void> => {
  await updateDoc(doc(db, "users", uid, "notificacoes", notificationId), {
    lida: true,
  });
};

export const markAllNotificationsAsRead = async (uid: string): Promise<number> => {
  const snap = await getDocs(query(buildNotificationsCollection(uid), orderBy("createdAt", "desc"), limit(100)));
  const unreadDocs = snap.docs.filter((item) => item.data().lida !== true);

  if (unreadDocs.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  unreadDocs.forEach((item) => {
    batch.update(item.ref, { lida: true });
  });
  await batch.commit();
  return unreadDocs.length;
};