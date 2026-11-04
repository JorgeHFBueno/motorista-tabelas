import { collection, doc, getDocs, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { trashMove, trashRestore } from "@/lib/functions";
import type { FirestoreItem } from "@/types/rbac";

const isDev = import.meta.env.DEV;

export type TrashType = "documentos" | "fotos";

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const resolveDirectUrl = (item: FirestoreItem) => {
  const urlKeys = [
    "url",
    "downloadUrl",
    "downloadURL",
    "arquivoUrl",
    "fileUrl",
    "fotoUrl",
    "boletoUrl",
    "comprovanteUrl",
    "latestUrl",
  ] as const;

  for (const key of urlKeys) {
    const candidate = asText(item[key]);
    if (candidate) return candidate;
  }

  return "";
};

const toEpoch = (value: unknown): number => {
  const withSeconds = value as { seconds?: number };
  if (typeof withSeconds?.seconds === "number") return withSeconds.seconds;
  const maybeDate = value as { toDate?: () => Date };
  if (typeof maybeDate?.toDate === "function") return Math.floor(maybeDate.toDate().getTime() / 1000);
  return 0;
};

const logDev = (message: string, payload?: unknown) => {
    if (isDev) {
    console.info(`[TRASH] ${message}`, payload ?? "");
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

export const moveToTrash = async ({ item, type, obraId, userName }: {
  item: FirestoreItem;
  type: TrashType;
  obraId: string;
  userName?: string;
}) => {
  const originalCollection = type;
  const originalDocId = asText(item.id);
  if (!originalDocId) throw new Error("Item inválido.");

  const originalStoragePath = resolveStoragePath(item);
  const storedName = resolveStoredName(item);
  const trashedStoragePath = originalStoragePath ? buildTrashPath({ obraId, type, storedName }) : "";

  const kind = type === "documentos" ? "documento" : "foto";
  const extra = {
    deletedByNomeSnapshot: userName ?? null,
  };

  logDev("callable trash_move start", { kind, obraId, originalCollection, originalDocId });
  const response = await trashMove({
    kind,
    obraId,
    originalDocId,
    originalCollection,
    originalStoragePath,
    trashedStoragePath,
    extra,
  });
  logDev("callable trash_move end", response);
};

export const restoreFromTrash = async ({ item, type, obraId }: { item: FirestoreItem; type: TrashType; obraId: string }) => {
  const originalCollection = (asText(item.originalCollection) || type) as TrashType;
  const trashedDocId = asText(item.id);
  const originalDocId = asText(item.originalDocId) || trashedDocId;
  const originalStoragePath = asText(item.originalStoragePath);
  const trashedStoragePath = asText(item.trashedStoragePath) || resolveStoragePath(item);

  if (!trashedDocId || !originalDocId) throw new Error("Item de lixeira inválido.");

  const kind = type === "documentos" ? "documento" : "foto";
  logDev("callable trash_restore start", { kind, obraId, originalCollection, originalDocId, trashedDocId });
  const response = await trashRestore({
    kind,
    obraId,
    trashedDocId,
    trashedStoragePath,
    originalStoragePath,
    originalCollection,
    originalDocId,
  });
  logDev("callable trash_restore end", response);
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
  const directUrl = resolveDirectUrl(item);
  if (directUrl) return directUrl;
  const storagePath = resolveStoragePath(item);
  if (!storagePath) return "";
  return getDownloadURL(ref(storage, storagePath));
};
