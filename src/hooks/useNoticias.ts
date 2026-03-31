import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildEmptyNoticiasByCategoria,
  createInstitutionalNoticia,
  deleteInstitutionalNoticia,
  listInstitutionalNoticiasAdmin,
  listPublicNoticiasByCategoria,
  updateInstitutionalNoticia,
  uploadInstitutionalImage,
} from "@/services/noticiasService";
import type { NoticiaCategoria, NoticiaCreateInput, NoticiaUpdateInput } from "@/types/noticias";

const CATEGORIAS: NoticiaCategoria[] = ["economia", "infraestrutura", "logistica", "inovacao", "institucional"];

export const noticiasKeys = {
  all: ["noticias"] as const,
  publicByCategory: (categoria: NoticiaCategoria) => [...noticiasKeys.all, "public", categoria] as const,
  adminInstitutional: () => [...noticiasKeys.all, "admin", "institucional"] as const,
};

export const usePublicNoticias = () => {
  const queries = useQueries({
    queries: CATEGORIAS.map((categoria) => ({
      queryKey: noticiasKeys.publicByCategory(categoria),
      queryFn: () => listPublicNoticiasByCategoria(categoria),
    })),
  });

  const isLoading = queries.some((item) => item.isLoading);
  const isError = queries.some((item) => item.isError);

  const data = buildEmptyNoticiasByCategoria(CATEGORIAS);
  queries.forEach((item, index) => {
    data[CATEGORIAS[index]] = item.data ?? [];
  });

  return {
    data,
    isLoading,
    isError,
    error: queries.find((item) => item.error)?.error,
    refetchAll: () => Promise.all(queries.map((q) => q.refetch())),
  };
};

export const useAdminInstitutionalNoticias = () =>
  useQuery({
    queryKey: noticiasKeys.adminInstitutional(),
    queryFn: listInstitutionalNoticiasAdmin,
  });

export const useCreateInstitutionalNoticia = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { input: NoticiaCreateInput; user: { uid: string; nome?: string; email?: string } }) =>
      createInstitutionalNoticia(payload.input, payload.user),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: noticiasKeys.all });
    },
  });
};

export const useUpdateInstitutionalNoticia = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string; input: NoticiaUpdateInput; user: { uid: string; nome?: string; email?: string } }) =>
      updateInstitutionalNoticia(payload.id, payload.input, payload.user),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: noticiasKeys.all });
    },
  });
};

export const useDeleteInstitutionalNoticia = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteInstitutionalNoticia(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: noticiasKeys.all });
    },
  });
};

export const useUploadInstitutionalImage = () =>
  useMutation({
    mutationFn: ({ uid, file }: { uid: string; file: File }) => uploadInstitutionalImage(uid, file),
  });