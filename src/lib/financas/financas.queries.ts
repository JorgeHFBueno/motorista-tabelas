import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFinancialInstallmentById,
  getFinancialOverviewByObra,
  listFinancialInstallments,
  uploadFinancialReceiptFile,
} from "./financas.service";
import type { FinancialActorReference, FinancialInstallment } from "./financas.types";

export const financasKeys = {
  all: ["financas"] as const,
  list: (obraId?: string) => [...financasKeys.all, "parcelas", obraId ?? ""] as const,
  overview: (obraId?: string) => [...financasKeys.all, "overview", obraId ?? ""] as const,
  detail: (parcelaId?: string) => [...financasKeys.all, "parcela", parcelaId ?? ""] as const,
};

export const useFinancialOverview = (obraId?: string) =>
  useQuery({
    queryKey: financasKeys.overview(obraId),
    queryFn: () => getFinancialOverviewByObra(obraId),
    enabled: Boolean(obraId),
  });

export const useFinancialInstallmentsList = (obraId?: string) =>
  useQuery({
    queryKey: financasKeys.list(obraId),
    queryFn: () => listFinancialInstallments({ obraId }),
    enabled: Boolean(obraId),
  });

export const useFinancialInstallment = (parcelaId?: string, enabled = true) =>
  useQuery({
    queryKey: financasKeys.detail(parcelaId),
    queryFn: () => (parcelaId ? getFinancialInstallmentById(parcelaId) : Promise.resolve(null)),
    enabled: Boolean(parcelaId) && enabled,
  });

  interface SubmitReceiptVariables {
  obraId: string;
  parcelaId: string;
  file: File;
  observacaoCliente?: string;
  comprovanteEnviadoPor?: FinancialActorReference;
}

export const useSubmitFinancialReceiptMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: SubmitReceiptVariables) =>
      uploadFinancialReceiptFile(variables) as Promise<FinancialInstallment | null>,
    onSuccess: async (updatedInstallment, variables) => {
      if (updatedInstallment) {
        queryClient.setQueryData<FinancialInstallment[]>(
          financasKeys.list(variables.obraId),
          (current = []) =>
            current.map((parcela) =>
              parcela.id === updatedInstallment.id ? updatedInstallment : parcela,
            ),
        );
        queryClient.setQueryData(
          financasKeys.detail(updatedInstallment.id),
          updatedInstallment,
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financasKeys.list(variables.obraId) }),
        queryClient.invalidateQueries({ queryKey: financasKeys.overview(variables.obraId) }),
        queryClient.invalidateQueries({ queryKey: financasKeys.detail(variables.parcelaId) }),
      ]);
    },
  });
};