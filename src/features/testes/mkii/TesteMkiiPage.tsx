import { TesteCronogramaPage } from "../TesteCronogramaPage";
import { QuadroGantt } from "./QuadroGantt";
import "./mkii.css";

/** /testes/mkii: o CronoObra com uma identidade visual nova e uma grade própria (QuadroGantt), com dados fictícios. */
export default function TesteMkiiPage() {
  return <TesteCronogramaPage tema="mkii" nome="MKII" gradeIniciadas={QuadroGantt} />;
}
