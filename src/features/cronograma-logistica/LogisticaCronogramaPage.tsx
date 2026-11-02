import LocalShippingRounded from "@mui/icons-material/LocalShippingRounded";
import type { CSSProperties } from "react";
import { TimelineHeader } from "../cronograma-obras/components/TimelineHeader";
import "../cronograma-obras/styles/cronograma-obras.css";

/**
 * Esqueleto do Cronograma Logístico (quadro "QUADRO LOGISTICO" do Monday).
 * Mesma estrutura visual do CronoObra, ainda sem fonte de dados nem ações.
 */
const INDICADORES = [
  "Transportes na semana",
  "Sem cronograma",
  "Motoristas alocados",
  "Veículos alocados",
  "Conflitos de alocação",
] as const;

const COLUNAS = ["Item", "Motorista", "Auxiliar", "Veículo", "Obra"] as const;

const gridStyle = {
  "--co-left-width": "760px",
  "--co-left-columns": "240px 130px 130px 140px 120px",
} as CSSProperties;

export default function LogisticaCronogramaPage() {
  return (
    <main className="co-page co-zoom--week">
      <header className="co-page-header">
        <div className="co-title">
          <span className="co-title-icon">
            <LocalShippingRounded />
          </span>
          <div>
            <div className="co-title-line">
              <h1>Cronograma Logístico</h1>
            </div>
            <p>Programação de transportes, motoristas e veículos</p>
          </div>
        </div>
      </header>
      <section className="co-indicators-bar">
        <div className="co-indicators-group">
          {INDICADORES.map((label) => (
            <div key={label}>
              <span>{label}</span>
              <strong>—</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="co-gantt" aria-label="Cronograma logístico">
        <div className="co-gantt-scroll">
          <div className="co-gantt-grid co-gantt-grid--week" style={gridStyle}>
            <div className="co-gantt-header">
              <div className="co-header-info co-left-header">
                {COLUNAS.map((coluna) => (
                  <span key={coluna}>{coluna}</span>
                ))}
              </div>
              <div className="co-header-timeline">
                <TimelineHeader zoom="week" />
              </div>
            </div>
          </div>
        </div>
        <div className="co-empty" role="status">
          Nenhum transporte programado.
        </div>
      </section>
    </main>
  );
}
