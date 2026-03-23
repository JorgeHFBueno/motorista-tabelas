import { useQuery } from "@tanstack/react-query";
import {
  getFinancialInstallmentById,
  getFinancialOverviewByObra,
  listFinancialInstallments,
} from "./financas.service";

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