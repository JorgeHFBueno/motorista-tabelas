// Tipos e constantes da conciliação com um cadastro existente (C5), usados pelo diálogo (quadro/Conciliar.tsx)
// e pela página (paginas/Conciliacao.tsx).

export type CampoContrato = {
  caminho: string; titulo: string; tipo: 'texto' | 'numero' | 'caixa' | 'opcao' | 'data'; obrigatorio: boolean; nulo: boolean; somente_leitura?: boolean; escala?: number;
  opcoes?: string[]; opcoes_abertas?: boolean; derivado?: boolean; deriva?: { caminho: string; verdadeiro_quando: string };
};
export type Cadastro = { colecao: string; nome: string; descricao: string; chaves: string[]; campos: CampoContrato[]; liberado: boolean; grupo_livre: string;
  dividir_nome?: { identificador: string; resto: string }; // chave "nome começa com": ao criar, 1ª palavra e resto do nome
};
export type Analise = {
  casados: { itemId: number; nome: string; registroId: string }[];
  ambiguos: { itemId: number; nome: string; chave: string; registroIds: string[] }[];
  semPar: { itemId: number; nome: string; chave: string }[];
  semItem: { registroId: string; chave: string; nome: string }[];
  jaVinculados: number;
};
export type Ligacao = { coluna_id: number | ''; prioridade: 'cadastro' | 'quadro'; rotulos: Record<string, string> };
type RelatorioCampo = { caminho: string; titulo: string; iguais: number; preenchidos: number; divergentes: number; mantidos: number; sobrescritos: number; erros: number };
export type Relatorio = {
  vinculados: number; registros_atualizados: number; criados: number; trazidos: number; deixados_fora: number; ambiguos_pendentes: number;
  fora_do_quadro: number; ja_vinculados: number; campos: RelatorioCampo[]; erros: string[]; total_erros: number;
  rotulos_novos?: { coluna_id: number; textos: string[] }[]; manuais?: number; desfeitos?: number; arquivados?: number;
};

// Igual a functions/fridayCadastrosExistentes.ts (COLUNAS_COMPATIVEIS): texto aceita rótulo (grava o texto do rótulo).
export const COMPATIVEIS: Record<CampoContrato['tipo'], string[]> = {
  texto: ['texto', 'texto_longo', 'telefone', 'email', 'status'], numero: ['numero', 'avaliacao'], caixa: ['caixa'], opcao: ['status'], data: ['data'],
};
export const NOME = 'nome', NOME_PREFIXO = 'nome_prefixo';
// Colunas que podem ir para o grupo livre ("friday.<chave>"), com as regras dos cadastros novos. Igual a TIPOS_OFICIAIS, sem pessoa.
export const TIPOS_LIVRES = new Set(['texto', 'texto_longo', 'telefone', 'email', 'numero', 'avaliacao', 'data', 'periodo', 'status', 'lista', 'caixa', 'link']);
export const sugerirChave = (titulo: string) => {
  const base = titulo.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return !base ? 'campo' : /^[a-z]/.test(base) ? base : `c_${base}`.slice(0, 40);
};
