// Mudar o tipo de uma coluna (ex.: "Cap. de Carga Liq." importada como texto → número ×10; "Empresa" importada como lista
// → status; "Ano" → número sem separador de milhar). Funções puras: calculam os alvos possíveis e a conversão dos valores;
// quem grava é api.ts (mudarTipoColuna).
import { CORES, fmtNumeroColuna, lerNumero } from '../util.ts';
import type { Coluna, Rotulo, TipoColuna } from './tipos.ts';

export type Alvo = { tipo: TipoColuna; x10?: boolean; semMilhar?: boolean };
export type OpcaoAlvo = { chave: string; rotulo: string; alvo: Alvo };
type Valor = { id: number; nome: string; v: unknown };
export type Conversao = {
  config: Record<string, unknown>;
  mudancas: { id: number; valor: unknown }[];       // valor null = célula fica vazia
  falhas: { id: number; nome: string; original: string }[];
  convertidos: number;
};

const TEXTOS: TipoColuna[] = ['texto', 'texto_longo', 'telefone', 'email'];
const ROTULO_TEXTO: Record<string, string> = { texto: 'Texto', texto_longo: 'Texto longo', telefone: 'Telefone', email: 'E-mail' };
const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Tipos para os quais a coluna pode ir sem perder o sentido dos valores. */
export function alvosPara(c: Coluna): OpcaoAlvo[] {
  const textos = (excluir?: string) => TEXTOS.filter(t => t !== excluir).map(t => ({ chave: t, rotulo: ROTULO_TEXTO[t], alvo: { tipo: t } }));
  const numero = { chave: 'numero', rotulo: 'Número', alvo: { tipo: 'numero' as TipoColuna } };
  const numeroX10 = { chave: 'numero_x10', rotulo: 'Número ×10 (uma casa decimal, digitado sem vírgula)', alvo: { tipo: 'numero' as TipoColuna, x10: true } };
  const numeroSemMilhar = { chave: 'numero_sem_milhar', rotulo: 'Número sem separador de milhar (ano, código)', alvo: { tipo: 'numero' as TipoColuna, semMilhar: true } };
  const status = { chave: 'status', rotulo: 'Status (um rótulo por valor)', alvo: { tipo: 'status' as TipoColuna } };
  // Campo oficial: tipo e valores são do cadastro; só o separador de milhar de um número muda (apenas a exibição).
  if (c.oficial) return c.tipo === 'numero' && !c.config.x10 ? [c.config.milhar === false ? numero : numeroSemMilhar] : [];
  if (TEXTOS.includes(c.tipo)) return [...textos(c.tipo), numero, numeroX10, numeroSemMilhar, status];
  if (c.tipo === 'numero') {
    if (c.config.x10) return [...textos(), numero];
    return [...textos(), numeroX10, c.config.milhar === false ? numero : numeroSemMilhar];
  }
  // Lista de uma opção por célula: as opções viram os rótulos (mesmo id, texto e cor).
  if (c.tipo === 'lista') return [{ chave: 'status', rotulo: 'Status (cada opção vira um rótulo)', alvo: { tipo: 'status' as TipoColuna } }];
  if (c.tipo === 'status') return [...textos(), numero, numeroX10];
  if (c.tipo === 'avaliacao') return [numero, numeroX10];
  return [];
}

/** Texto de uma célula, para converter para texto ou status. */
function textoDe(c: Coluna, v: unknown): string | null {
  if (vazio(v)) return null;
  if (c.tipo === 'status') return ((c.config.rotulos ?? []) as Rotulo[]).find(r => r.id === String(v))?.texto?.trim() || null;
  if (c.tipo === 'numero') return fmtNumeroColuna({ ...c.config, unidade: '' }, v) || null;
  if (c.tipo === 'lista') return opcoesDaLista(c, v).map(o => o.texto).filter(Boolean).join(', ') || null;
  return String(v).trim() || null;
}
const opcoesDaLista = (c: Coluna, v: unknown) => {
  const opcoes = (c.config.opcoes ?? []) as Rotulo[];
  return (Array.isArray(v) ? v : [v]).map(id => opcoes.find(o => o.id === String(id))).filter((o): o is Rotulo => !!o);
};
/** Número exibido de uma célula (sem a escala ×10), para converter para número. */
function numeroDe(c: Coluna, v: unknown): number | null {
  if (vazio(v)) return null;
  if (c.tipo === 'numero') { const n = Number(v); return Number.isFinite(n) ? n / (c.config.x10 ? 10 : 1) : null; }
  if (c.tipo === 'avaliacao') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return lerNumero(textoDe(c, v));
}

/** Converte os valores da coluna para o tipo novo. Valores que não dão para converter ficam vazios (listados em `falhas`). */
export function converterColuna(c: Coluna, alvo: Alvo, valores: Valor[]): Conversao {
  const mudancas: Conversao['mudancas'] = [];
  const falhas: Conversao['falhas'] = [];
  let convertidos = 0;
  const registrar = (x: Valor, novo: unknown) => {
    if (vazio(x.v)) return;
    if (novo == null) { falhas.push({ id: x.id, nome: x.nome, original: textoDe(c, x.v) ?? String(x.v) }); mudancas.push({ id: x.id, valor: null }); return; }
    convertidos++;
    if (JSON.stringify(novo) !== JSON.stringify(x.v)) mudancas.push({ id: x.id, valor: novo });
  };
  if (alvo.tipo === 'numero') {
    for (const x of valores) { const n = numeroDe(c, x.v); registrar(x, n == null ? null : alvo.x10 ? Math.round(n * 10) : n); }
    // Sem separador de milhar (ano, código): somar não faz sentido, o rodapé fica sem resumo.
    const config = alvo.semMilhar
      ? { unidade: c.config.unidade ?? '', resumo: 'nenhum', milhar: false }
      : { unidade: c.config.unidade ?? '', resumo: c.config.resumo ?? 'soma', ...(alvo.x10 ? { x10: true } : {}) };
    return { config, mudancas, falhas, convertidos };
  }
  if (alvo.tipo === 'status' && c.tipo === 'lista') {
    // As opções viram rótulos com o mesmo id, texto e cor (as não usadas também ficam). O id "0" é o rótulo vazio do
    // Friday: uma opção com esse id ganha um id novo. Célula com mais de uma opção não cabe num status: fica vazia.
    const opcoes = (c.config.opcoes ?? []) as Rotulo[];
    let proximo = Math.max(0, ...opcoes.map(o => Number(o.id)).filter(Number.isFinite)) + 1;
    const idNovo = new Map(opcoes.map(o => [o.id, o.id === '0' ? String(proximo++) : o.id]));
    for (const x of valores) {
      const escolhidas = opcoesDaLista(c, x.v);
      registrar(x, escolhidas.length === 1 ? idNovo.get(escolhidas[0].id)! : null);
    }
    const rotulos = opcoes.map(o => ({ id: idNovo.get(o.id)!, texto: o.texto, cor: o.cor }));
    return { config: { rotulos: [...rotulos, { id: '0', texto: '', cor: '#c4c4c4' }] }, mudancas, falhas, convertidos };
  }
  if (alvo.tipo === 'status') {
    // Um rótulo por texto diferente, na ordem em que aparecem; o rótulo vazio do Friday fica no fim.
    const rotulos: Rotulo[] = [];
    const porTexto = new Map<string, string>();
    for (const x of valores) {
      const t = textoDe(c, x.v);
      if (!t) { registrar(x, null); continue; }
      const k = t.toLowerCase();
      if (!porTexto.has(k)) { const id = String(rotulos.length + 1); porTexto.set(k, id); rotulos.push({ id, texto: t, cor: CORES[(rotulos.length * 3) % CORES.length] }); }
      registrar(x, porTexto.get(k)!);
    }
    return { config: { rotulos: [...rotulos, { id: '0', texto: '', cor: '#c4c4c4' }] }, mudancas, falhas, convertidos };
  }
  for (const x of valores) registrar(x, textoDe(c, x.v));
  return { config: {}, mudancas, falhas, convertidos };
}

export const nomeDoAlvo = (alvo: Alvo) => (alvo.tipo === 'numero' ? (alvo.x10 ? 'Número ×10' : alvo.semMilhar ? 'Número sem separador' : 'Número') : alvo.tipo === 'status' ? 'Status' : ROTULO_TEXTO[alvo.tipo] ?? alvo.tipo);
