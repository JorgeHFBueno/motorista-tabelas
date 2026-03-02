import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFoto, downloadFoto, listFotos } from "./fotos.service";
import type { FotoEtapa, UploadFotoInput } from "./fotos.types";

export const fotosKeys = {
  all: ["fotos"] as const,
  list: (obraId?: string, etapa?: FotoEtapa | null) => [...fotosKeys.all, "list", obraId ?? "", etapa ?? "TODAS"] as const,
};

export const useFotosList = (obraId?: string, etapa?: FotoEtapa | null) =>
  useQuery({
    queryKey: fotosKeys.list(obraId, etapa),
    queryFn: () => listFotos({ obraId, etapa }),
    enabled: Boolean(obraId),
  });

export const useUploadFoto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UploadFotoInput) => createFoto(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fotosKeys.all });
    },
  });
};

export const useDownloadFoto = () =>
  useMutation({
    mutationFn: downloadFoto,
  });