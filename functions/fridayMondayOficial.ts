// Reimportação do monday num quadro oficial ligado a um cadastro existente (ex.: GESTÃO DE OBRAS → obras-v2).
// Decisão de 2026-10-29: o monday continua sendo editado por um tempo e vale nos conflitos. Um item (ou subitem) que
// mudou no monday desde a última importação tem as colunas vindas do monday regravadas, mesmo que tenha sido editado no
// Friday; as ligadas vão para o cadastro pela mesma validação da tela. Funções puras, sem Firestore: o plano serve à
// prévia (nada é gravado) e à gravação. Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md e
// 14_FRIDAY_CADASTROS_OFICIAIS.md.
import { valorDoOficial } from './fridayCadastroConverter.js';
import { campoComRotuloNovo, lerCaminho, valorParaGravarExistente, type CampoExistente } from './fridayCadastrosExistentes.js';
import { json, manterCopias, valorDe, type ColunaImportada, type ContextoValor, type MItem, type MValor } from './fridayMondayConverter.js';

type AnyRecord = Record<string, any>;
/** Coluna do quadro vinda do monday, com o tipo e a configuração que ela tem hoje no Friday (pode ter mudado de tipo). */
export type ColunaDoQuadro = ColunaImportada & { titulo: string; tipo: string };
export type Mudanca = { coluna: string; de: string; para: string; recusa?: string };
export type PlanoAtualizacao = {
  mudancas: Mudanca[];
  /** Valores das colunas livres vindas do monday (substituem as importadas; as criadas no Friday ficam). */
  livres: AnyRecord;
  /** Campos ligados que mudaram e cabem no cadastro: gravados pela gravação do quadro oficial. */
  ligados: { coluna_id: number; titulo: string; valor: unknown }[];
  nome: string | null;
  grupo_id: number | null;
};

const CORES = ['#00a36c', '#fdab3d', '#e2445c', '#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#9cd326', '#cab641', '#ffcb00', '#0086c0', '#66ccff', '#bb3354', '#ff158a', '#ff5ac4', '#784bd1'];
const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon((v as AnyRecord)[k])])) : v);
export const mesmoValor = (a: unknown, b: unknown) => (vazio(a) && vazio(b)) || JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Número escrito em texto: "2025", "20,5", "1.234,5", "20 t". null sem número. */
export function numeroDoTexto(texto: unknown): number | null {
  const m = String(texto ?? '').match(/-?\d[\d.]*(?:,\d+)?/);
  if (!m) return null;
  let s = m[0];
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rótulo de uma coluna de status pelo texto (sem contar maiúsculas); sem rótulo com esse texto, cria um na configuração
 * da coluna (em memória) e marca a coluna em `alteradas`, para quem grava salvar a configuração.
 */
export function rotuloPorTexto(alteradas: Set<number>) {
  return (col: ColunaDoQuadro, texto: string): string => {
    const rotulos = ((col.config.rotulos ??= []) as { id: string; texto: string; cor: string }[]);
    const t = texto.trim();
    const achado = rotulos.find(r => String(r.texto ?? '').trim().toLowerCase() === t.toLowerCase() && r.id !== '0');
    if (achado) return achado.id;
    const id = String(Math.max(0, ...rotulos.map(r => Number(r.id)).filter(Number.isFinite)) + 1);
    const vazioIdx = rotulos.findIndex(r => r.id === '0');
    const novo = { id, texto: t, cor: CORES[rotulos.length % CORES.length] };
    if (vazioIdx >= 0) rotulos.splice(vazioIdx, 0, novo); else rotulos.push(novo);
    alteradas.add(col.id);
    return id;
  };
}

/**
 * Valor de uma célula do monday no tipo que a coluna tem hoje no Friday. Colunas convertidas depois da importação
 * ("Mudar tipo…": lista → status, texto → número, número → ×10) recebem o valor convertido do mesmo jeito.
 */
export function valorNoTipoAtual(col: ColunaDoQuadro, cv: MValor, ctx: ContextoValor & { rotulo: (col: ColunaDoQuadro, texto: string) => string }): unknown {
  const natural = valorDe(col, cv, ctx);
  const texto = (cv.text ?? '').trim();
  switch (col.tipo) {
    case 'status': {
      if (col.tipoMonday === 'status') return natural;
      // Lista com mais de uma opção não cabe num status: a célula fica vazia (como na conversão do "Mudar tipo…").
      if (col.tipoMonday === 'dropdown' && (json(cv.value)?.ids?.length ?? 0) > 1) return null;
      return texto ? ctx.rotulo(col, texto) : null;
    }
    case 'numero': {
      const n = typeof natural === 'number' ? natural : numeroDoTexto(texto);
      if (n == null) return null;
      return col.config?.x10 ? Math.round(n * 10) : n; // coluna ×10 guarda o inteiro ×10
    }
    case 'texto': case 'texto_longo': case 'telefone': case 'email':
      return typeof natural === 'string' ? natural : texto || null;
    default: return natural;
  }
}

/** Valor de uma célula como texto curto, para a prévia. */
export function textoDoValor(col: { tipo: string; config?: AnyRecord }, v: unknown): string {
  if (vazio(v)) return '—';
  const cfg = col.config ?? {};
  let t: string;
  switch (col.tipo) {
    case 'status': t = ((cfg.rotulos ?? []) as AnyRecord[]).find(r => String(r.id) === String(v))?.texto ?? `rótulo ${String(v)}`; break;
    case 'lista': t = (Array.isArray(v) ? v : [v]).map(id => ((cfg.opcoes ?? []) as AnyRecord[]).find(o => String(o.id) === String(id))?.texto ?? String(id)).join(', '); break;
    case 'numero': t = (cfg.x10 ? Number(v) / 10 : Number(v)).toLocaleString('pt-BR', { useGrouping: cfg.milhar !== false, maximumFractionDigits: 2 }); break;
    case 'periodo': t = `${(v as AnyRecord).inicio ?? '?'} → ${(v as AnyRecord).fim ?? '?'}`; break;
    case 'caixa': t = 'marcado'; break;
    case 'arquivos': t = `${(v as unknown[]).length} arquivo(s)`; break;
    case 'pessoa': t = `${(v as unknown[]).length} pessoa(s)`; break;
    case 'link': t = String((v as AnyRecord).texto ?? (v as AnyRecord).url ?? ''); break;
    default: t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

const SEM_PREVIA = new Set(['formula', 'mirror']); // calculadas no Friday ou cópias: não aparecem na prévia

/**
 * Plano de um item (ou subitem) já importado que mudou no monday. `oficial` é o documento do cadastro (ou a entrada do
 * subitem no mapa do item pai); `campos`, os campos ligados ativos (sem os secundários). Ligações entre itens ficam
 * de fora (são resolvidas por quem grava, como na importação comum).
 */
export function planejarAtualizacao(p: {
  item: MItem; existente: AnyRecord; colunas: Map<string, ColunaDoQuadro>; campos: CampoExistente[]; oficial: AnyRecord | undefined;
  nomeTravado: boolean; grupoId: number | null; nomeDoGrupo: (id: unknown) => string;
  ctx: ContextoValor & { rotulo: (col: ColunaDoQuadro, texto: string) => string };
}): PlanoAtualizacao {
  const plano: PlanoAtualizacao = { mudancas: [], livres: {}, ligados: [], nome: null, grupo_id: null };
  const nome = String(p.item.name ?? '').slice(0, 500).trim() || 'Sem nome';
  if (!p.nomeTravado && nome !== String(p.existente.nome ?? '').trim()) {
    plano.nome = nome;
    plano.mudancas.push({ coluna: 'Nome', de: String(p.existente.nome ?? '') || '—', para: nome });
  }
  if (p.grupoId != null && Number(p.existente.grupo_id) !== p.grupoId) {
    plano.grupo_id = p.grupoId;
    plano.mudancas.push({ coluna: 'Grupo', de: p.nomeDoGrupo(p.existente.grupo_id), para: p.nomeDoGrupo(p.grupoId) });
  }
  for (const cv of p.item.column_values) {
    const col = p.colunas.get(cv.id);
    if (!col || col.tipoMonday === 'board_relation' || col.tipoMonday === 'dependency') continue;
    const campo = p.campos.find(c => Number(c.coluna_id) === col.id);
    if (!campo) {
      const atual = p.existente.valores?.[String(col.id)];
      // Arquivo do monday já copiado para o Friday: fica a cópia.
      const novo = manterCopias(atual, valorNoTipoAtual(col, cv, p.ctx));
      if (!vazio(novo)) plano.livres[String(col.id)] = novo;
      if (!SEM_PREVIA.has(col.tipo) && !mesmoValor(atual, novo)) plano.mudancas.push({ coluna: col.titulo, de: textoDoValor(col, atual), para: textoDoValor(col, novo) });
      continue;
    }
    const novo = valorNoTipoAtual(col, cv, p.ctx);
    const atual = valorDoOficial(campo, lerCaminho(p.oficial, campo.chave));
    if (mesmoValor(atual, novo)) continue;
    const r = valorParaGravarExistente(campoComRotuloNovo(campo, col.config.rotulos, novo).campo, vazio(novo) ? null : novo);
    const mudanca: Mudanca = { coluna: col.titulo, de: textoDoValor(col, atual), para: textoDoValor(col, novo) };
    if ('erro' in r) mudanca.recusa = r.erro;
    else plano.ligados.push({ coluna_id: col.id, titulo: col.titulo, valor: vazio(novo) ? null : novo });
    plano.mudancas.push(mudanca);
  }
  return plano;
}

/** Valores de um item novo do monday no tipo atual de cada coluna (ligações à parte, como na importação comum). */
export function valoresNoTipoAtual(item: MItem, colunas: Map<string, ColunaDoQuadro>, ctx: ContextoValor & { rotulo: (col: ColunaDoQuadro, texto: string) => string }) {
  const valores: AnyRecord = {};
  const ligacoes: Record<string, string[]> = {};
  for (const cv of item.column_values) {
    const col = colunas.get(cv.id);
    if (!col) continue;
    if (col.tipoMonday === 'board_relation' || col.tipoMonday === 'dependency') {
      const ids = valorDe(col, cv, ctx);
      if (Array.isArray(ids) && ids.length) ligacoes[String(col.id)] = ids as string[];
      continue;
    }
    const v = valorNoTipoAtual(col, cv, ctx);
    if (!vazio(v)) valores[String(col.id)] = v;
  }
  return { valores, ligacoes };
}
