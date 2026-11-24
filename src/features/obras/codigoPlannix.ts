// Código Plannix do LOTE (obras-v2.lotes.{id}.plannix), escolhido na coluna Código Plannix do detalhe da obra
// (/engenharia/obras/:id). No Plannix cada LOTE é uma obra própria, sem chave em comum com o nosso cadastro; a tela
// sugere a obra do Plannix pelo município, pelas dimensões e pelo nome do lugar, e quem edita confirma.
// The Manuscript, 02_APIS_FUNCTIONS/05_PLANNIX.md.

/** Obra do cadastro do Plannix (Function plannixObras). */
export type ObraPlannix = { codigo: number; sigla: string; nome: string; inicio: string | null; fim: string | null };

export const rotuloObraPlannix = (obra: Pick<ObraPlannix, 'codigo' | 'sigla' | 'nome'>) => `${obra.codigo} · ${obra.sigla} · ${obra.nome}`;

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// Palavras que não identificam o lugar (tipo de obra, preposições, siglas de prefeitura e de estado).
const COMUNS = new Set(['PM', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'LOTE', 'PONTE', 'GALERIA', 'BUEIRO', 'CELULAR', 'LINHA', 'MT', 'SUL',
  'ARROIO', 'RIO', 'LAJEADO', 'SAO', 'NOVA', 'NOVO', 'META', 'AMPLIACAO', 'AUMENTO', 'ESTRADA', 'VICINAL', 'DIVISA', 'TABULEIRO']);
const palavras = (texto: string) => new Set(normalizar(texto).replace(/[^A-Z0-9 ]/g, ' ').split(' ')
  .filter((p) => p.length > 2 && !COMUNS.has(p) && !/^\d/.test(p)));
/** Dimensões "5,00X10,00" ou "6,00 X 10,00 M" → "5X10" (e "2X2X10" com três). */
export const dimensoes = (texto: string) => [...normalizar(texto).replace(/\s*X\s*/g, 'X')
  .matchAll(/(\d+(?:[.,]\d+)?)X(\d+(?:[.,]\d+)?)(?:X(\d+(?:[.,]\d+)?))?/g)]
  .map((m) => m.slice(1).filter(Boolean).map((n) => String(Number(n.replace(',', '.')))).join('X'));
const tipo = (texto: string) => (/GALERIA|BUEIRO/.test(normalizar(texto)) ? 'GALERIA' : /PONTE/.test(normalizar(texto)) ? 'PONTE' : '');

/**
 * Pontos de uma obra do Plannix para um LOTE: precisa do mesmo município (palavra da sigla do Plannix no nome do
 * contrato ou do LOTE) e da mesma dimensão; o nome do lugar desempata (ex.: "(LAJ. GRINGA)"). 0 = não serve.
 */
export function pontos(nomeObra: string, nomeLote: string, plannix: Pick<ObraPlannix, 'sigla' | 'nome'>): number {
  const doContrato = palavras(nomeObra);
  const doLote = palavras(nomeLote);
  const municipio = [...palavras(plannix.sigla)].some((p) => doContrato.has(p) || doLote.has(p));
  const dimensao = dimensoes(plannix.nome).some((d) => dimensoes(nomeLote).includes(d));
  if (!municipio || !dimensao) return 0;
  if (tipo(plannix.nome) && tipo(nomeLote) && tipo(plannix.nome) !== tipo(nomeLote)) return 0;
  return 5 + [...palavras(plannix.nome)].filter((p) => doLote.has(p)).length;
}

/**
 * Sugestão de obra do Plannix para cada LOTE sem código: a de mais pontos, cada obra para um LOTE só (a que já está
 * em outro LOTE do contrato não é sugerida). Empate entre duas obras para o mesmo LOTE não vira sugestão.
 */
export function sugerirCodigos(
  nomeObra: string,
  lotes: { chave: string; nome: string; plannix: number | null }[],
  obras: ObraPlannix[],
): Record<string, ObraPlannix> {
  const usadas = new Set(lotes.flatMap((lote) => (lote.plannix == null ? [] : [lote.plannix])));
  const pares = lotes.filter((lote) => lote.plannix == null).flatMap((lote) => obras
    .filter((obra) => !usadas.has(obra.codigo))
    .map((obra) => ({ lote: lote.chave, obra, pontos: pontos(nomeObra, lote.nome, obra) }))
    .filter((par) => par.pontos > 0));
  const sugestoes: Record<string, ObraPlannix> = {};
  for (const par of [...pares].sort((a, b) => b.pontos - a.pontos)) {
    if (sugestoes[par.lote] || usadas.has(par.obra.codigo)) continue;
    const empate = pares.some((outro) => outro.lote === par.lote && outro.obra.codigo !== par.obra.codigo
      && outro.pontos === par.pontos && !usadas.has(outro.obra.codigo));
    if (empate) continue;
    sugestoes[par.lote] = par.obra;
    usadas.add(par.obra.codigo);
  }
  return sugestoes;
}
