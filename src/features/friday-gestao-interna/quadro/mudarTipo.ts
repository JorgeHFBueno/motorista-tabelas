// Mudar o tipo de uma coluna (ex.: "Cap. de Carga Liq." importada como texto → número ×10). Funções puras: calculam
// os alvos possíveis e a conversão dos valores; quem grava é api.ts (mudarTipoColuna).
import { CORES, fmtNumeroColuna, lerNumero } from '../util.ts';
import type { Coluna, Rotulo, TipoColuna } from './tipos.ts';

export type Alvo = { tipo: TipoColuna; x10?: boolean };
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
  const status = { chave: 'status', rotulo: 'Status (um rótulo por valor)', alvo: { tipo: 'status' as TipoColuna } };
  if (TEXTOS.includes(c.tipo)) return [...textos(c.tipo), numero, numeroX10, status];
  if (c.tipo === 'numero') return [...textos(), c.config.x10 ? numero : numeroX10];
  if (c.tipo === 'status') return [...textos(), numero, numeroX10];
  if (c.tipo === 'avaliacao') return [numero, numeroX10];
  return [];
}

/** Texto de uma célula, para converter para texto ou status. */
function textoDe(c: Coluna, v: unknown): string | null {
  if (vazio(v)) return null;
  if (c.tipo === 'status') return ((c.config.rotulos ?? []) as Rotulo[]).find(r => r.id === String(v))?.texto?.trim() || null;
  if (c.tipo === 'numero') return fmtNumeroColuna({ ...c.config, unidade: '' }, v) || null;
  return String(v).trim() || null;
}
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
    const config = { unidade: c.config.unidade ?? '', resumo: c.config.resumo ?? 'soma', ...(alvo.x10 ? { x10: true } : {}) };
    return { config, mudancas, falhas, convertidos };
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

export const nomeDoAlvo = (alvo: Alvo) => (alvo.tipo === 'numero' ? (alvo.x10 ? 'Número ×10' : 'Número') : alvo.tipo === 'status' ? 'Status' : ROTULO_TEXTO[alvo.tipo] ?? alvo.tipo);
