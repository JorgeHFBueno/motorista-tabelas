import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import type { DocumentoTipoPdf, FotoTipoImagem } from "@/types/upload";

interface UploadBasePayload {
  observacao?: string;
  registroEm?: string;
}

interface UploadPdfPayload extends UploadBasePayload {
  tipo: DocumentoTipoPdf;
}

interface UploadImagePayload extends UploadBasePayload {
  tipo: FotoTipoImagem;
}

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
      const filename = `${fileUuid}_${safeName}`;
      const storagePath = `obras/${obraId}/documentos/${yyyy}/${mm}/${filename}`;

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

      await addDoc(collection(db, "obras", obraId, "documentos"), {
        createdAt: payload.registroEm ? Timestamp.fromDate(new Date(payload.registroEm)) : serverTimestamp(),
        tipo: payload.tipo,
        filename,
        contentType: file.type,
        storagePath: result.storagePath,
        url: result.url,
        observacao: payload.observacao?.trim() || null,
        createdByUid: user.uid,
        createdByNomeSnapshot: userDoc?.nome ?? null,
      });

      await queryClient.invalidateQueries({ queryKey: ["documentos", obraId] });
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
      const filename = `${fileUuid}_${safeName}`;
      const storagePath = `obras/${obraId}/fotos/${yyyy}/${mm}/${filename}`;

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

      await addDoc(collection(db, "obras", obraId, "fotos"), {
        createdAt: payload.registroEm ? Timestamp.fromDate(new Date(payload.registroEm)) : serverTimestamp(),
        obraId,
        tipo: payload.tipo,
        filename,
        contentType: file.type,
        storagePath: result.storagePath,
        url: result.url,
        observacao: payload.observacao?.trim() || null,
        createdByUid: user.uid,
        createdByNomeSnapshot: userDoc?.nome ?? null,
      });

      await queryClient.invalidateQueries({ queryKey: ["fotos", obraId] });
      return result;
    },
  });

  return {
    uploadPdf: uploadPdfMutation.mutateAsync,
    uploadImage: uploadImageMutation.mutateAsync,
    isUploading: uploadPdfMutation.isPending || uploadImageMutation.isPending,
  };
};