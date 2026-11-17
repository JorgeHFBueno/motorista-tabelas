import { TesteCronogramaPage } from "../TesteCronogramaPage";
import { QuadroGantt } from "./QuadroGantt";
import "../mkii/mkii.css";
import "./quadro.css";

/** /testes/mkiii: o visual do MKII com uma grade própria de "Obra iniciada" (QuadroGantt), com dados fictícios. */
export default function TesteMkiiiPage() {
  return <TesteCronogramaPage tema="mkii" nome="MKIII" gradeIniciadas={QuadroGantt} />;
}
