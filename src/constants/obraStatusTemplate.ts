export interface ObraStatusTemplateEtapa {
  id: string;
  nome: string;
  ordem: number;
  itens: string[];
}

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
    nome: "Producao",
    ordem: 2,
    itens: ["Pilares", "Placas", "Vigas", "Laje", "Cobertura"],
  },
  {
    id: "fundacao",
    nome: "Fundacao",
    ordem: 3,
    itens: ["Sondagem", "Calculo", "Execucao"],
  },
  {
    id: "montagem",
    nome: "Montagem",
    ordem: 4,
    itens: ["Pilares", "Placas", "Vigas", "Laje", "Cobertura"],
  },
];
