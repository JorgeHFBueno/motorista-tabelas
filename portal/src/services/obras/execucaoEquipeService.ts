import { Timestamp, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ExecucaoEquipeTipo } from "@/types/rbac";

interface ExecucaoEquipeActor {
  uid: string;
  nome: string;
}

export const salvarConfirmacaoExecucaoEquipe = async ({
  obraId,
  tipo,
  dataHora,
  actor,
}: {
  obraId: string;
  tipo: ExecucaoEquipeTipo;
  dataHora: Date;
  actor: ExecucaoEquipeActor;
}) => {
  if (!obraId) throw new Error("Obra inválida.");
  if (!actor.uid) throw new Error("Sessão expirada.");
  if (Number.isNaN(dataHora.getTime())) {
    throw new Error("Informe uma data e hora válidas.");
  }

  await updateDoc(doc(db, "obras", obraId), {
    [`execucaoEquipe.${tipo}`]: {
      confirmado: true,
      dataHora: Timestamp.fromDate(dataHora),
      confirmadoPorUid: actor.uid,
      confirmadoPorNome: actor.nome || "Equipe",
      updatedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
};
