import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadDocumento,
  getDocumentoById,
  listAssinaturas,
  listAuditoria,
  listDocumentos,
  listVersoes,
  uploadDocumento,
} from "./documentos.service";
import type { DocumentoCategoria, UploadDocumentoInput } from "./documentos.types";

export const documentosKeys = {
  all: ["documentos"] as const,
  list: (obraId?: string, categoria?: DocumentoCategoria | null, searchText?: string) =>
    [...documentosKeys.all, "list", obraId ?? "global", categoria ?? "todos", searchText ?? ""] as const,
  detail: (id?: string) => [...documentosKeys.all, "one", id ?? ""] as const,
  auditoria: (id?: string) => [...documentosKeys.all, "auditoria", id ?? ""] as const,
  versoes: (id?: string) => [...documentosKeys.all, "versoes", id ?? ""] as const,
  assinaturas: (id?: string) => [...documentosKeys.all, "assinaturas", id ?? ""] as const,
};

export const useDocumentosList = (obraId: string | undefined, categoria: DocumentoCategoria | null, searchText: string) => {
  const params = { obraId, categoria, searchText };
  return useQuery({
    queryKey: documentosKeys.list(params.obraId, params.categoria, params.searchText),
    queryFn: () => listDocumentos(params),
    enabled: Boolean(obraId),
  });

  };

export const useDocumento = (id?: string, enabled = true) =>
  useQuery({
    queryKey: documentosKeys.detail(id),
    queryFn: () => (id ? getDocumentoById(id) : Promise.resolve(null)),
    enabled: Boolean(id) && enabled,
  });

export const useAuditoria = (docId?: string, enabled = true) =>
  useQuery({
    queryKey: documentosKeys.auditoria(docId),
    queryFn: () => (docId ? listAuditoria(docId) : Promise.resolve([])),
    enabled: Boolean(docId) && enabled,
  });

export const useVersoes = (docId?: string, enabled = true) =>
  useQuery({
    queryKey: documentosKeys.versoes(docId),
    queryFn: () => (docId ? listVersoes(docId) : Promise.resolve([])),
    enabled: Boolean(docId) && enabled,
  });

export const useAssinaturas = (docId?: string, enabled = true) =>
  useQuery({
    queryKey: documentosKeys.assinaturas(docId),
    queryFn: () => (docId ? listAssinaturas(docId) : Promise.resolve([])),
    enabled: Boolean(docId) && enabled,
  });

export const useUploadDocumento = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UploadDocumentoInput) => uploadDocumento(input),
    onSuccess: async (docId) => {
      await queryClient.invalidateQueries({ queryKey: documentosKeys.all });
      await queryClient.invalidateQueries({ queryKey: documentosKeys.detail(docId) });
    },
  });
};

export const useDownloadDocumento = () =>
  useMutation({
    mutationFn: downloadDocumento,
  });