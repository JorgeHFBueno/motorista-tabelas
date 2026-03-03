export interface ObraStatusTemplateFase {
  id: string;
  titulo: string;
  ordem: number;
  itens: string[];
}

export const OBRA_STATUS_TEMPLATE: ObraStatusTemplateFase[] = [
  {
    id: "preparo",
    titulo: "Preparo do terreno",
    ordem: 1,
    itens: ["Limpeza do terreno", "Nivelamento", "Demarcação"],
  },
  {
    id: "fundacao",
    titulo: "Fundação",
    ordem: 2,
    itens: ["Escavação", "Armação de ferragem", "Concretagem", "Cura do concreto"],
  },
  {
    id: "estrutura",
    titulo: "Estrutura",
    ordem: 3,
    itens: ["Pilares", "Vigas", "Lajes", "Escadas"],
  },
  {
    id: "vedacao",
    titulo: "Vedação",
    ordem: 4,
    itens: ["Alvenaria externa", "Alvenaria interna"],
  },
  {
    id: "instalacoes",
    titulo: "Instalações",
    ordem: 5,
    itens: ["Elétrica", "Hidráulica", "Gás"],
  },
];