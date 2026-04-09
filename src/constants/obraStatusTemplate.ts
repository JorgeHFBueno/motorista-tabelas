export interface ObraStatusTemplateEtapa {
  id: string;
  nome: string;
  ordem: number;
  itens: string[];
}

// Fonte oficial para o estado base de status das obras.
export const OBRA_STATUS_TEMPLATE: ObraStatusTemplateEtapa[] = [
  {
    id: "projeto",
    nome: "Projeto",
    ordem: 1,
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
    itens: ["Pilares", "Placas", "Vigas", "Laje", "Cobertura"],
  },
  {
    id: "fundacao",
    nome: "Fundação",
    ordem: 3,
    itens: ["Sondagem", "Cálculo", "Execução"],
  },
  {
    id: "montagem",
    nome: "Montagem",
    ordem: 4,
    itens: ["Pilares", "Placas", "Vigas", "Laje", "Cobertura"],
  },
];
