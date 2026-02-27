import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadDocumento,
  getDocumentoById,
  listDocumentos,
  uploadDocumento,
} from "./documentos.service";
import type { DocumentoCategoria, UploadDocumentoInput } from "./documentos.types";

export const documentosKeys = {
  all: ["documentos"] as const,
  list: (obraId?: string, categoria?: DocumentoCategoria | null, searchText?: string) =>
    [...documentosKeys.all, "list", obraId ?? "global", categoria ?? "todos", searchText ?? ""] as const,
  detail: (id?: string) => [...documentosKeys.all, "detail", id ?? ""] as const,
};

export const useDocumentosList = (obraId: string | undefined, categoria: DocumentoCategoria | null, searchText: string) =>
  useQuery({
    queryKey: documentosKeys.list(obraId, categoria, searchText),
    queryFn: () => listDocumentos({ obraId, categoria, searchText }),
    enabled: true,
  });

export const useDocumento = (id?: string) =>
  useQuery({
    queryKey: documentosKeys.detail(id),
    queryFn: () => (id ? getDocumentoById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });

export const useUploadDocumento = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UploadDocumentoInput) => uploadDocumento(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: documentosKeys.all });
    },
  });
};

export const useDownloadDocumento = () =>
  useMutation({
    mutationFn: downloadDocumento,
  });