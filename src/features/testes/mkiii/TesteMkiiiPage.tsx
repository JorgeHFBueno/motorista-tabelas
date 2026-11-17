import PrazosContratuaisPage from "../../prazos-contratuais/PrazosContratuaisPage";
import { prazosFicticios } from "../fontesFicticias";
import { TesteCronogramaPage } from "../TesteCronogramaPage";
import { QuadroGantt } from "./QuadroGantt";
import { QuadroLista } from "./QuadroLista";
import "../mkii/mkii.css";
import "./quadro.css";

/** Prazos Contratuais da aba, com os mesmos contratos fictícios. */
const carregarPrazosFicticios = async () => prazosFicticios();

/**
 * /testes/mkiii: o visual do MKII com uma grade própria de "Obra iniciada" (QuadroGantt), a lista de "Obra finalizada"
 * no mesmo padrão (QuadroLista) e as abas Cronograma | Mestres | Prazos Contratuais no topo, com dados fictícios.
 */
export default function TesteMkiiiPage() {
  return <TesteCronogramaPage tema="mkii" nome="MKIII" gradeIniciadas={QuadroGantt} tabelaFinalizadas={QuadroLista} abas={{ prazos: <PrazosContratuaisPage carregar={carregarPrazosFicticios} /> }} />;
}
