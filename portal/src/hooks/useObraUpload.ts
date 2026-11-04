import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import type { DocumentoTipoPdf, FotoTipoImagem } from "@/types/upload";

interface UploadBasePayload {
  observacao?: string;
  registroEm?: string;
  obraNomeSnapshot?: string | null;
}

interface UploadPdfPayload extends UploadBasePayload {
  tipo: DocumentoTipoPdf;
}

interface UploadImagePayload extends UploadBasePayload {
  tipo: FotoTipoImagem;
}

const isDev = import.meta.env.DEV;

const sanitizeFileName = (fileName: string) =>
  fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_");

const toDateParts = (date: Date) => ({
  yyyy: date.getFullYear().toString(),
  mm: `${date.getMonth() + 1}`.padStart(2, "0"),
});

const uploadWithProgress = (
  storagePath: string,
  file: File,
  metadata: { contentType: string; customMetadata: Record<string, string> },
  onProgress: (progress: number) => void,
) =>
  new Promise<{ storagePath: string; url: string }>((resolve, reject) => {
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ storagePath, url });
        } catch (error) {
          reject(error);
        }
      },
    );
  });

  const mapFotoTipoToEtapa = (tipo: FotoTipoImagem) => {
  if (tipo === "Fundação") return "FUNDACAO" as const;
  if (tipo === "Estrutura") return "ESTRUTURA" as const;
  if (tipo === "Cobertura") return "COBERTURA" as const;
  return "FECHAMENTO" as const;
};

const mapPdfTipoToCategoria = (tipo: DocumentoTipoPdf) => (tipo === "ART/RRT" ? "ART / RRT" : tipo);

const addDocumentAuditEvent = async ({
  docId,
  type,
  actorUid,
  actorNomeSnapshot,
  meta,
}: {
  docId: string;
  type: "upload" | "sign" | "version_upload";
  actorUid: string;
  actorNomeSnapshot?: string | null;
  meta?: Record<string, unknown>;
}) =>
  addDoc(collection(db, "documentos", docId, "auditoria"), {
    type,
    actorUid,
    actorNomeSnapshot: actorNomeSnapshot ?? null,
    createdAt: serverTimestamp(),
    meta: meta ?? null,
  });

export const useObraUpload = (obraId: string) => {
  const { user, userDoc } = useAuth();
  const queryClient = useQueryClient();

  const uploadPdfMutation = useMutation({
    mutationFn: async ({ file, payload, onProgress }: { file: File; payload: UploadPdfPayload; onProgress: (progress: number) => void }) => {
      if (!user) throw new Error("Sessão inválida");

      const now = new Date();
      const { yyyy, mm } = toDateParts(now);
      const safeName = sanitizeFileName(file.name);
      const fileUuid = crypto.randomUUID();
      const storedName = `${fileUuid}_${safeName}`;
      const storagePath = `obras/${obraId}/documentos/${yyyy}/${mm}/${storedName}`;

      const result = await uploadWithProgress(
        storagePath,
        file,
        {
          contentType: file.type,
          customMetadata: {
            obraId,
            uploadedByUid: user.uid,
            uploadedAt: now.toISOString(),
            contentType: file.type,
          },
        },
        onProgress,
      );

      try {
        const created = await addDoc(collection(db, "documentos"), {
          obraId,
          obraNomeSnapshot: payload.obraNomeSnapshot ?? null,
          tipo: payload.tipo,
          categoria: mapPdfTipoToCategoria(payload.tipo),
          titulo: file.name,
          createdAt: payload.registroEm ? Timestamp.fromDate(new Date(payload.registroEm)) : serverTimestamp(),
          updatedAt: serverTimestamp(),
          displayName: file.name,
          originalName: file.name,
          storedName,
          filename: storedName,
          fileName: storedName,
          contentType: file.type,
          mimeType: file.type,
          storagePath: result.storagePath,
          filePath: result.storagePath,
          url: result.url,
          fileSizeBytes: file.size,
          observacao: payload.observacao?.trim() || null,
          createdByUid: user.uid,
          createdByNomeSnapshot: userDoc?.nome ?? null,
          status: "Finalizado",
          requerAssinatura: false,
          assinaturaStatus: "ASSINADO",
        });
        await addDocumentAuditEvent({
          docId: created.id,
          type: "upload",
          actorUid: user.uid,
          actorNomeSnapshot: userDoc?.nome,
          meta: {
            storagePath: result.storagePath,
            storedName,
            originalName: file.name,
          },
        });
      } catch (error) {
        if (isDev) {
          console.error("[UPLOAD] falha ao salvar documento no Firestore; rollback no Storage", { obraId, storagePath, error });
        }
        await deleteObject(ref(storage, result.storagePath)).catch((rollbackError) => {
          console.error("[UPLOAD] rollback falhou para documento", { obraId, storagePath, rollbackError });
        });
        throw error;
      }

      if (isDev) {
        console.info("[UPLOAD] documento enviado", { obraId, source: "global_documentos", storagePath: result.storagePath });
      }

      await queryClient.invalidateQueries({ queryKey: ["documentos", obraId] });
      await queryClient.invalidateQueries({ queryKey: ["documentos"] });
      return result;
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async ({ file, payload, onProgress }: { file: File; payload: UploadImagePayload; onProgress: (progress: number) => void }) => {
      if (!user) throw new Error("Sessão inválida");

      const now = new Date();
      const { yyyy, mm } = toDateParts(now);
      const safeName = sanitizeFileName(file.name);
      const fileUuid = crypto.randomUUID();
      const storedName = `${fileUuid}_${safeName}`;
      const storagePath = `obras/${obraId}/fotos/${yyyy}/${mm}/${storedName}`;

      const result = await uploadWithProgress(
        storagePath,
        file,
        {
          contentType: file.type,
          customMetadata: {
            obraId,
            uploadedByUid: user.uid,
            uploadedAt: now.toISOString(),
            contentType: file.type,
          },
        },
        onProgress,
      );

      try {
        await addDoc(collection(db, "fotos"), {
          obraId,
          obraNomeSnapshot: payload.obraNomeSnapshot ?? null,
          tipo: payload.tipo,
          etapa: mapFotoTipoToEtapa(payload.tipo),
          etapaLabel: payload.tipo,
          displayName: file.name,
          originalName: file.name,
          storedName,
          filename: storedName,
          fileName: storedName,
          contentType: file.type,
          storagePath: result.storagePath,
          filePath: result.storagePath,
          url: result.url,
          sizeBytes: file.size,
          observacao: payload.observacao?.trim() || null,
          observacaoTecnica: payload.observacao?.trim() || "",
          createdByUid: user.uid,
          createdByNomeSnapshot: userDoc?.nome ?? null,
          createdAt: payload.registroEm ? Timestamp.fromDate(new Date(payload.registroEm)) : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (isDev) {
          console.error("[UPLOAD] falha ao salvar foto no Firestore; rollback no Storage", { obraId, storagePath, error });
        }
        await deleteObject(ref(storage, result.storagePath)).catch((rollbackError) => {
          console.error("[UPLOAD] rollback falhou para foto", { obraId, storagePath, rollbackError });
        });
        throw error;
      }

      if (isDev) {
        console.info("[UPLOAD] foto enviada", { obraId, source: "global_fotos", storagePath: result.storagePath });
      }

      await queryClient.invalidateQueries({ queryKey: ["fotos", obraId] });
      await queryClient.invalidateQueries({ queryKey: ["fotos"] });
      return result;
    },
  });

  return {
    uploadPdf: uploadPdfMutation.mutateAsync,
    uploadImage: uploadImageMutation.mutateAsync,
    isUploading: uploadPdfMutation.isPending || uploadImageMutation.isPending,
  };
};