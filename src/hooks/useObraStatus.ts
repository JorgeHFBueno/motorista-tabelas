import { useQuery } from "@tanstack/react-query";
import { listObraStatusFases } from "@/services/obraStatus.service";

export const useObraStatus = (obraId?: string | null) =>
  useQuery({
    queryKey: ["obraStatus", obraId],
    queryFn: () => listObraStatusFases(obraId as string),
    enabled: Boolean(obraId),
  });