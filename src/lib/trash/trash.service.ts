import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { FirestoreItem } from "@/types/rbac";

const isDev = import.meta.env.DEV;

export type TrashType = "documentos" | "fotos";

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toEpoch = (value: unknown): number => {
  const withSeconds = value as { seconds?: number };
  if (typeof withSeconds?.seconds === "number") return withSeconds.seconds;
  const maybeDate = value as { toDate?: () => Date };
  if (typeof maybeDate?.toDate === "function") return Math.floor(maybeDate.toDate().getTime() / 1000);
  return 0;
};

const logDev = (prefix: "[TRASH]" | "[DOCS]" | "[PHOTOS]", message: string, payload?: unknown) => {
  if (isDev) {
    console.info(`${prefix} ${message}`, payload ?? "");
  }
};

const getTrashCollection = (type: TrashType) => (type === "documentos" ? "documentos-lixo" : "fotos-lixo");

const resolveStoragePath = (item: FirestoreItem) =>
  asText(item.storagePath) || asText(item.filePath) || asText(item.path);

const resolveStoredName = (item: FirestoreItem) => {
  const fileName = asText(item.storedName) || asText(item.fileName) || asText(item.filename) || "arquivo";
  return fileName.replace(/[\\/]+/g, "_");
};

const buildTrashPath = ({ obraId, type, storedName }: { obraId: string; type: TrashType; storedName: string }) => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const segment = type === "documentos" ? "documentos" : "fotos";
  return `obras/${obraId}/lixeira/${segment}/${yyyy}/${mm}/${storedName}`;
};

const copyStorageObject = async ({ sourcePath, targetPath, contentType }: { sourcePath: string; targetPath: string; contentType?: string }) => {
  const oldRef = ref(storage, sourcePath);
  const url = await getDownloadURL(oldRef);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao baixar arquivo para mover.");
  const blob = await response.blob();
  await uploadBytes(ref(storage, targetPath), blob, {
    contentType: contentType || blob.type || "application/octet-stream",
    customMetadata: { movedBy: "trash-flow" },
  });
};

export const moveToTrash = async ({ item, type, obraId, userUid, userName }: {
  item: FirestoreItem;
  type: TrashType;
  obraId: string;
  userUid?: string;
  userName?: string;
}) => {
  const originalCollection = type;
  const trashCollection = getTrashCollection(type);
  const originalId = asText(item.id);
  if (!originalId) throw new Error("Item inválido.");

  const originalStoragePath = resolveStoragePath(item);
  const storedName = resolveStoredName(item);
  const trashedStoragePath = originalStoragePath ? buildTrashPath({ obraId, type, storedName }) : "";

  const payload: Record<string, unknown> = {
    ...item,
    obraId,
    originalCollection,
    originalId,
    originalStoragePath,
    trashedStoragePath,
    deletedAt: serverTimestamp(),
    deletedByUid: userUid ?? null,
    deletedByNomeSnapshot: userName ?? null,
  };

  const trashRef = doc(db, trashCollection, originalId);
  await setDoc(trashRef, payload, { merge: true });
  logDev("[TRASH]", "Documento criado na lixeira", { trashCollection, originalId });

  if (originalStoragePath && trashedStoragePath) {
    await copyStorageObject({ sourcePath: originalStoragePath, targetPath: trashedStoragePath, contentType: asText(item.contentType) || asText(item.mimeType) });
    await deleteObject(ref(storage, originalStoragePath));
    const movedUrl = await getDownloadURL(ref(storage, trashedStoragePath));
    await setDoc(trashRef, { storagePath: trashedStoragePath, filePath: trashedStoragePath, url: movedUrl }, { merge: true });
    logDev(type === "documentos" ? "[DOCS]" : "[PHOTOS]", "Arquivo movido para lixeira", { originalStoragePath, trashedStoragePath });
  }

  await deleteDoc(doc(db, originalCollection, originalId));
};

export const restoreFromTrash = async ({ item, type }: { item: FirestoreItem; type: TrashType }) => {
  const trashCollection = getTrashCollection(type);
  const originalCollection = asText(item.originalCollection) || type;
  const itemId = asText(item.id);
  const originalId = asText(item.originalId) || itemId;
  const originalStoragePath = asText(item.originalStoragePath) || resolveStoragePath(item);
  const trashedStoragePath = asText(item.trashedStoragePath) || resolveStoragePath(item);

  if (!itemId || !originalId) throw new Error("Item de lixeira inválido.");

  if (trashedStoragePath && originalStoragePath) {
    await copyStorageObject({ sourcePath: trashedStoragePath, targetPath: originalStoragePath, contentType: asText(item.contentType) || asText(item.mimeType) });
  }

  const restorePayload = { ...item } as Record<string, unknown>;
  delete restorePayload.deletedAt;
  delete restorePayload.deletedByUid;
  delete restorePayload.deletedByNomeSnapshot;
  delete restorePayload.originalCollection;
  delete restorePayload.originalId;
  delete restorePayload.trashedStoragePath;
  restorePayload.storagePath = originalStoragePath;
  restorePayload.filePath = originalStoragePath;

  await setDoc(doc(db, originalCollection, originalId), restorePayload, { merge: true });
  await deleteDoc(doc(db, trashCollection, itemId));

  if (trashedStoragePath && originalStoragePath) {
    await deleteObject(ref(storage, trashedStoragePath));
  }

  logDev("[TRASH]", "Item restaurado", { originalCollection, originalId });
};

export const listTrashItems = async ({ obraId, type }: { obraId: string; type: TrashType }): Promise<FirestoreItem[]> => {
  const snap = await getDocs(query(collection(db, getTrashCollection(type)), where("obraId", "==", obraId)));
  const items: FirestoreItem[] = snap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Record<string, unknown>),
  }));

  return items.sort((a, b) => {
      const deleted = toEpoch(b.deletedAt) - toEpoch(a.deletedAt);
      if (deleted !== 0) return deleted;
      return toEpoch(b.createdAt) - toEpoch(a.createdAt);
    });
};

export const getItemPreviewUrl = async (item: FirestoreItem): Promise<string> => {
  const directUrl = asText(item.url);
  if (directUrl) return directUrl;
  const storagePath = resolveStoragePath(item);
  if (!storagePath) return "";
  return getDownloadURL(ref(storage, storagePath));
};