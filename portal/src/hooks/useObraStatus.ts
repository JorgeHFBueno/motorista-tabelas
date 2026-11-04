import { useQuery } from "@tanstack/react-query";
import { getObraStatus } from "@/services/obraStatus.service";

export const useObraStatus = (obraId?: string | null) =>
  useQuery({
    queryKey: ["obraStatus", obraId],
    queryFn: () => getObraStatus(obraId as string),
    enabled: Boolean(obraId),
  });
