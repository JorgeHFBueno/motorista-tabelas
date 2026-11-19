import type { CSSProperties } from "react";
import { LOTE_STATUS_COLORS } from "../../../services/loteStatusService";

/**
 * CronoObra: pílula do Status com a cor de cada um. O Status do LOTE usa as cores do controle de Status (as do Friday);
 * a situação do contrato (fórmula "Status" do GESTÃO DE OBRAS, ex.: "Obra em Andamento", "Obra Parada", "Obra
 * Finalizada") usa a cor do Status do LOTE equivalente; as demais (Aguardando…, Solicitar…) ficam em cinza.
 */
const corDoStatus = (status: string): string | null => {
  const exata = LOTE_STATUS_COLORS[status];
  if (exata) return exata;
  const texto = status.toLocaleLowerCase("pt-BR");
  if (texto.includes("finaliz")) return LOTE_STATUS_COLORS["Finalizado"];
  if (texto.includes("parad")) return LOTE_STATUS_COLORS["Parada"];
  if (texto.includes("andamento")) return LOTE_STATUS_COLORS["Em andamento"];
  if (texto.includes("próxima a iniciar") || texto.includes("proxima a iniciar")) return LOTE_STATUS_COLORS["Próxima a Iniciar"];
  if (texto.includes("não iniciad") || texto.includes("nao iniciad")) return LOTE_STATUS_COLORS["Não iniciada"];
  return null;
};

export function PilulaStatus({ status }: { status: string | null | undefined }) {
  const texto = status?.trim() || "Sem status";
  const cor = corDoStatus(texto);
  return <span className={`qg-pilula ${cor ? "" : "is-neutra"}`} title={texto} style={cor ? ({ "--qg-pilula": cor } as CSSProperties) : undefined}>{texto}</span>;
}
