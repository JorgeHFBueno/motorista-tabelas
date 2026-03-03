import {
  deleteField,
  type FieldValue,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { OBRA_STATUS_TEMPLATE } from "@/constants/obraStatusTemplate";
import { db } from "@/lib/firebase";

export interface ObraStatusItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ObraStatusFase {
  id: string;
  titulo: string;
  ordem: number;
  inicio: Timestamp | null;
  fim: Timestamp | null;
  itens: ObraStatusItem[];
  updatedAt?: unknown;
  updatedByUid?: string;
  updatedByNomeSnapshot?: string;
}

export type ObraStatusResumo = "-" | "Em andamento" | "Concluída";

interface UpdateActor {
  uid: string;
  nome: string;
}

const buildStatusCollectionRef = (obraId: string) => collection(db, "obras", obraId, "status");

export const listFases = async (obraId: string): Promise<ObraStatusFase[]> => {
  const snap = await getDocs(query(buildStatusCollectionRef(obraId), orderBy("ordem", "asc")));
  return snap.docs.map((faseDoc) => ({
    id: faseDoc.id,
    ...(faseDoc.data() as Omit<ObraStatusFase, "id">),
  }));
};

export const bootstrapStatusIfEmpty = async (obraId: string, actor: UpdateActor) => {
  const statusRef = buildStatusCollectionRef(obraId);
  const existing = await getDocs(statusRef);
  if (!existing.empty) {
    if (import.meta.env.DEV) console.info("[STATUS] bootstrap ignorado: fases já existentes", { obraId, count: existing.size });
    return false;
  }

  const batch = writeBatch(db);

  OBRA_STATUS_TEMPLATE.forEach((faseTemplate) => {
    const faseRef = doc(db, "obras", obraId, "status", faseTemplate.id);
    batch.set(faseRef, {
      titulo: faseTemplate.titulo,
      ordem: faseTemplate.ordem,
      inicio: null,
      fim: null,
      itens: faseTemplate.itens.map((label, index) => ({
        id: `${faseTemplate.id}_${index + 1}`,
        label,
        done: false,
      })),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByNomeSnapshot: actor.nome,
    });
  });

  await batch.commit();

  if (import.meta.env.DEV) console.info("[STATUS] bootstrap concluído", { obraId, totalFases: OBRA_STATUS_TEMPLATE.length });

  return true;
};

export const toggleItem = async (
  obraId: string,
  faseId: string,
  itemId: string,
  actor: UpdateActor,
) => {
  const faseRef = doc(db, "obras", obraId, "status", faseId);
  const faseSnap = await getDoc(faseRef);
  if (!faseSnap.exists()) throw new Error("Fase não encontrada.");

  const fase = faseSnap.data() as Omit<ObraStatusFase, "id">;
  const itens = (fase.itens ?? []).map((item) =>
    item.id === itemId
      ? {
          ...item,
          done: !item.done,
        }
      : item,
  );

  await updateDoc(faseRef, {
    itens,
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByNomeSnapshot: actor.nome,
  });

  if (import.meta.env.DEV) console.info("[STATUS] item atualizado", { obraId, faseId, itemId });
};

export const setDatas = async (
  obraId: string,
  faseId: string,
  inicio: Timestamp | null,
  fim: Timestamp | null,
  actor: UpdateActor,
) => {
  const faseRef = doc(db, "obras", obraId, "status", faseId);
  await updateDoc(faseRef, {
    inicio,
    fim,
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByNomeSnapshot: actor.nome,
  });

  if (import.meta.env.DEV) console.info("[STATUS] datas atualizadas", { obraId, faseId, inicio, fim });
};
export const updateFaseDraft = async (
  obraId: string,
  faseId: string,
  payload: {
    itens: ObraStatusFase["itens"];
    inicio: Timestamp | null | FieldValue;
    fim?: Timestamp | null | FieldValue;
    statusResumo?: ObraStatusResumo | null;
  },
  actor: UpdateActor,
) => {
  const faseRef = doc(db, "obras", obraId, "status", faseId);
  const obraRef = doc(db, "obras", obraId);
  const batch = writeBatch(db);

  batch.update(faseRef, {
    itens: payload.itens,
    inicio: payload.inicio,
    ...(payload.fim !== undefined ? { fim: payload.fim } : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByNomeSnapshot: actor.nome,
  });

    batch.update(obraRef, {
    statusResumo: payload.statusResumo ?? deleteField(),
    statusResumoUpdatedAt: serverTimestamp(),
  });

  await batch.commit();

  if (import.meta.env.DEV) console.info("[STATUS] fase atualizada via draft", { obraId, faseId, payload });
};