import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import { ContractAnalysisRequest } from "./ContractAnalysisRequest";
import type { ContratoCronograma } from "../domain/models";

type Props = {
  collapsed: boolean;
  count: number;
  contrato?: ContratoCronograma;
  showReview?: boolean;
};

/** Canonical fixed-width gutter shared by contract parent rows. */
export function ContractRowControls({ collapsed, count, contrato, showReview = false }: Props) {
  return <span className="co-contract-controls">
    <KeyboardArrowDownRounded className={collapsed ? "is-collapsed" : ""} />
    <b aria-label={`${count} obras`}>{count}</b>
    {showReview && contrato && <ContractAnalysisRequest contrato={contrato} variant="indicator" />}
  </span>;
}
