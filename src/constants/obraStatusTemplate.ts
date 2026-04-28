export interface ObraStatusTemplateEtapa {
  id: string;
  nome: string;
  ordem: number;
  modoControle: "percentual" | "checklist";
  itens: string[];
}

// Fonte oficial para o estado base de status das obras.
export const OBRA_STATUS_TEMPLATE: ObraStatusTemplateEtapa[] = [
  {
    id: "projeto",
    nome: "Projeto",
    ordem: 1,
    modoControle: "checklist",
    itens: [
      "Projeto Executivo - Assinatura",
      "Projeto Estrutural",
      "Detalhamento",
    ],
  },
  {
    id: "producao",
    nome: "Produção",
    ordem: 2,
    modoControle: "percentual",
    itens: ["Pilares", "Placas", "Vigas", "Laje", "Cobertura"],
  },
  {
    id: "fundacao",
    nome: "Fundação",
    ordem: 3,
    modoControle: "checklist",
    itens: ["Sondagem", "Cálculo", "Execução"],
  },
  {
    id: "montagem",
    nome: "Montagem",
    ordem: 4,
    modoControle: "percentual",
    itens: ["Pilares", "Placas", "Vigas", "Laje", "Cobertura"],
  },
];
