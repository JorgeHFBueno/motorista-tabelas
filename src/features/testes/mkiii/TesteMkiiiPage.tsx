import { useEffect } from "react";
import PrazosContratuaisPage from "../../prazos-contratuais/PrazosContratuaisPage";
import { prazosFicticios } from "../fontesFicticias";
import { TesteCronogramaPage } from "../TesteCronogramaPage";
import { ligarBonequinho } from "./bonequinho";
import { QuadroGantt } from "./QuadroGantt";
import { QuadroLista } from "./QuadroLista";
import { QuadroMestres } from "./QuadroMestres";
import "../mkii/mkii.css";
import "./quadro.css";

/** Prazos Contratuais da aba, com os mesmos contratos fictícios. */
const carregarPrazosFicticios = async () => prazosFicticios();

/**
 * /testes/mkiii: o visual do MKII com grades próprias de "Obra iniciada" (QuadroGantt) e da aba Mestres
 * (QuadroMestres), a lista de "Obra finalizada" no mesmo padrão (QuadroLista), as abas Cronograma | Mestres | Prazos
 * Contratuais no topo e o bonequinho ao arrastar um mestre, com dados fictícios.
 */
export default function TesteMkiiiPage() {
  useEffect(() => ligarBonequinho(), []);
  return <TesteCronogramaPage tema="mkii" nome="MKIII" gradeIniciadas={QuadroGantt} gradeMestres={QuadroMestres} tabelaFinalizadas={QuadroLista} abas={{ prazos: <PrazosContratuaisPage carregar={carregarPrazosFicticios} /> }} />;
}
