import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  convertLegacyFasesToStatus,
  createDefaultObraStatus,
  deriveObraStatusResumo,
  normalizeObraStatusData,
  recomputeObraStatus,
} from "@/lib/obraStatus";
import type { ObraStatusData } from "@/types/obraStatus";

interface UpdateActor {
  uid: string;
  nome: string;
}

const buildObraRef = (obraId: string) => doc(db, "obras", obraId);
const buildLegacyStatusCollectionRef = (obraId: string) =>
  collection(db, "obras", obraId, "status");

const listLegacyFases = async (obraId: string) => {
  const snap = await getDocs(
    query(buildLegacyStatusCollectionRef(obraId), orderBy("ordem", "asc")),
  );

  return snap.docs.map((faseDoc) => ({
    id: faseDoc.id,
    ...(faseDoc.data() as Record<string, unknown>),
  }));
};

const buildPersistedPayload = (
  statusObra: ObraStatusData,
  actor: UpdateActor,
) => ({
  statusObra: {
    ...statusObra,
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByNomeSnapshot: actor.nome,
  },
  statusResumo: deriveObraStatusResumo(statusObra),
  statusResumoUpdatedAt: serverTimestamp(),
});

export const getObraStatus = async (
  obraId: string,
): Promise<ObraStatusData> => {
  const obraSnap = await getDoc(buildObraRef(obraId));
  const obraData = obraSnap.exists()
    ? (obraSnap.data() as { statusObra?: unknown })
    : {};

  const normalized = normalizeObraStatusData(obraData.statusObra);
  if (normalized) return normalized;

  const legacyFases = await listLegacyFases(obraId);
  if (legacyFases.length > 0) {
    return convertLegacyFasesToStatus(legacyFases);
  }

  return createDefaultObraStatus();
};

export const ensureObraStatus = async (
  obraId: string,
  actor: UpdateActor,
): Promise<ObraStatusData> => {
  const obraRef = buildObraRef(obraId);
  const obraSnap = await getDoc(obraRef);
  const obraData = obraSnap.exists()
    ? (obraSnap.data() as { statusObra?: unknown })
    : {};

  const normalized = normalizeObraStatusData(obraData.statusObra);
  if (normalized) return normalized;

  const legacyFases = await listLegacyFases(obraId);
  const nextStatus =
    legacyFases.length > 0
      ? convertLegacyFasesToStatus(legacyFases)
      : createDefaultObraStatus();

  await updateDoc(obraRef, buildPersistedPayload(nextStatus, actor));

  if (import.meta.env.DEV) {
    console.info("[STATUS] statusObra inicializado", {
      obraId,
      fromLegacy: legacyFases.length > 0,
      etapas: nextStatus.etapas.length,
    });
  }

  return nextStatus;
};

export const saveObraStatus = async (
  obraId: string,
  payload: ObraStatusData,
  actor: UpdateActor,
) => {
  const obraRef = buildObraRef(obraId);
  const normalized = recomputeObraStatus(payload);
  await updateDoc(obraRef, buildPersistedPayload(normalized, actor));

  if (import.meta.env.DEV) {
    console.info("[STATUS] statusObra salvo", {
      obraId,
      etapas: normalized.etapas.length,
      progressoGeral: normalized.progressoGeral,
    });
  }

  return normalized;
};
