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
import { adminRefreshExternalNews } from "@/lib/functions";
import type { NoticiaCategoria, NoticiaCreateInput, NoticiaUpdateInput } from "@/types/noticias";

const CATEGORIAS: NoticiaCategoria[] = ["economia", "infraestrutura", "logistica", "inovacao", "institucional"];
const PUBLIC_CATEGORIES = CATEGORIAS;

export const noticiasKeys = {
  all: ["noticias"] as const,
  public: () => [...noticiasKeys.all, "public"] as const,
  publicByCategory: (categoria: NoticiaCategoria) => [...noticiasKeys.public(), categoria] as const,
  admin: () => [...noticiasKeys.all, "admin"] as const,
  adminInstitutional: () => [...noticiasKeys.admin(), "institucional"] as const,
};

export async function refetchNoticiasQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: noticiasKeys.public() }),
    queryClient.invalidateQueries({ queryKey: noticiasKeys.admin() }),
  ]);
}

export const usePublicNoticias = () => {
  const queries = useQueries({
    queries: PUBLIC_CATEGORIES.map((categoria) => ({
      queryKey: noticiasKeys.publicByCategory(categoria),
      queryFn: () => listPublicNoticiasByCategoria(categoria),
      staleTime: 15 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnMount: "always" as const,
    })),
  });

  const isLoading = queries.some((item) => item.isLoading);
  const isError = queries.some((item) => item.isError);

  const data = buildEmptyNoticiasByCategoria(CATEGORIAS);
  queries.forEach((item, index) => {
    data[PUBLIC_CATEGORIES[index]] = item.data ?? [];
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
      await refetchNoticiasQueries(queryClient);
    },
  });
};

export const useUpdateInstitutionalNoticia = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string; input: NoticiaUpdateInput; user: { uid: string; nome?: string; email?: string } }) =>
      updateInstitutionalNoticia(payload.id, payload.input, payload.user),
    onSuccess: async () => {
      await refetchNoticiasQueries(queryClient);
    },
  });
};

export const useDeleteInstitutionalNoticia = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteInstitutionalNoticia(id),
    onSuccess: async () => {
      await refetchNoticiasQueries(queryClient);
    },
  });
};

export const useUploadInstitutionalImage = () =>
  useMutation({
    mutationFn: ({uid, file}: { uid: string; file: File }) => uploadInstitutionalImage(uid, file),
  });

export const useRefreshExternalNoticias = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: adminRefreshExternalNews,
    onSuccess: async () => {
      await refetchNoticiasQueries(queryClient);
      await Promise.all(
        PUBLIC_CATEGORIES.map((categoria) =>
          queryClient.refetchQueries({queryKey: noticiasKeys.publicByCategory(categoria), type: "all"}),
        ),
      );
      await queryClient.refetchQueries({queryKey: noticiasKeys.adminInstitutional(), type: "all"});
    },
  });
};
