import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContrato } from "@/contexts/ObraContext";
import type { PessoaRef } from "@/types/rbac";
import { buildFinancialOverview, listFinancialInstallments, uploadFinancialReceiptFile } from "./financas.service";

export const financasKeys = {
  list: (obraId?: string) => ["financas", "parcelas", obraId ?? ""] as const,
};

export const useFinancialInstallmentsList = (obraId?: string) => {
  const obra = useContrato(obraId);
  return useQuery({
    queryKey: financasKeys.list(obraId),
    queryFn: () => listFinancialInstallments(obra!),
    enabled: Boolean(obra),
  });
};

// Summary of the installments plus the contract value of the active contract.
export const useFinancialOverview = (obraId?: string) => {
  const obra = useContrato(obraId);
  const parcelas = useFinancialInstallmentsList(obraId);
  return {
    ...parcelas,
    data: obra && parcelas.data ? buildFinancialOverview(obra, parcelas.data) : undefined,
  };
};

export const useSubmitFinancialReceiptMutation = (obraId?: string) => {
  const obra = useContrato(obraId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { parcelaId: string; file: File; observacaoCliente?: string; enviadoPor: PessoaRef }) => {
      if (!obra) throw new Error("Contrato não encontrado.");
      return uploadFinancialReceiptFile({ obra, ...variables });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financasKeys.list(obraId) });
    },
  });
};
