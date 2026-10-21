// Filtros, ordenação e "agrupar por" de uma visão. Tudo calculado no navegador sobre os itens do quadro.
import { CORES, fmtNumeroColuna, hojeISO, inicioDaSemana, somarDias } from '../util.ts';
import { itemConcluido, rotuloDe, textoCelula, vazio, type Agrupar, type Coluna, type EstadoVisao, type Grupo, type Item, type Rotulo, type Visao } from './tipos.ts';

export type Contexto = { colunas: Coluna[]; nomeUsuario: (id: unknown) => string; eu: number | null; hoje?: string };

// ---------------------------------------------------------------- estado salvo na visão
export function normalizar(e: EstadoVisao): EstadoVisao {
  const filtros = Object.fromEntries(Object.entries(e.filtros ?? {}).filter(([, v]) => v.length).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));
  return { filtros, pessoa: e.pessoa ?? null, ordenacao: e.ordenacao ?? null, agrupar: e.agrupar ?? null, ocultas: [...new Set(e.ocultas ?? [])].sort((a, b) => a - b) };
}
// Visões antigas não têm "ocultas": vale o que estava marcado nas colunas.
export function estadoDaVisao(v: Visao, colunas: Coluna[]): EstadoVisao {
  const c = v.config ?? {};
  return normalizar({ filtros: c.filtros ?? {}, pessoa: c.pessoa ?? null, ordenacao: c.ordenacao ?? null, agrupar: c.agrupar ?? null, ocultas: c.ocultas ?? colunas.filter(x => x.oculta).map(x => x.id) });
}
export const mesmoEstado = (a: EstadoVisao, b: EstadoVisao) => JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
export const totalFiltros = (e: EstadoVisao) => Object.values(e.filtros).reduce((s, v) => s + v.length, 0) + (e.pessoa ? 1 : 0);

// ---------------------------------------------------------------- períodos de data
export const PERIODOS: { chave: string; rotulo: string }[] = [
  { chave: '__atrasado', rotulo: 'Atrasados' }, { chave: '__hoje', rotulo: 'Hoje' }, { chave: '__amanha', rotulo: 'Amanhã' }, { chave: '__ontem', rotulo: 'Ontem' },
  { chave: '__semana', rotulo: 'Esta semana' }, { chave: '__proxima', rotulo: 'Próxima semana' }, { chave: '__semana_passada', rotulo: 'Semana passada' },
  { chave: '__mes', rotulo: 'Este mês' }, { chave: '__proximo_mes', rotulo: 'Próximo mês' }, { chave: '__mes_passado', rotulo: 'Mês passado' },
  { chave: '__passadas', rotulo: 'Datas passadas' }, { chave: '__futuras', rotulo: 'Datas futuras' }, { chave: '__vazio', rotulo: 'Sem data' },
];
function intervalo(c: Coluna, v: any): [string, string] | null {
  if (!v) return null;
  if (c.tipo === 'periodo') { const a = v.inicio ?? v.fim, b = v.fim ?? v.inicio; return a ? [a, b] : null; }
  return typeof v === 'string' ? [v.slice(0, 10), v.slice(0, 10)] : null;
}
const mesDe = (iso: string, n: number) => { const [a, m] = iso.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function noPeriodo(chave: string, [a, b]: [string, string], hoje: string, feito: boolean): boolean {
  const cruza = (x: string, y: string) => a <= y && b >= x;
  const semana = (n: number) => { const i = somarDias(inicioDaSemana(hoje), 7 * n); return cruza(i, somarDias(i, 6)); };
  const mes = (n: number) => { const m = mesDe(hoje, n); return cruza(`${m}-01`, `${m}-31`); };
  switch (chave) {
    case '__atrasado': return b < hoje && !feito;
    case '__hoje': return cruza(hoje, hoje);
    case '__amanha': { const d = somarDias(hoje, 1); return cruza(d, d); }
    case '__ontem': { const d = somarDias(hoje, -1); return cruza(d, d); }
    case '__semana': return semana(0);
    case '__proxima': return semana(1);
    case '__semana_passada': return semana(-1);
    case '__mes': return mes(0);
    case '__proximo_mes': return mes(1);
    case '__mes_passado': return mes(-1);
    case '__passadas': return b < hoje;
    case '__futuras': return a > hoje;
    default: return false;
  }
}

// ---------------------------------------------------------------- opções do filtro por coluna
export type Opcao = { chave: string; rotulo: string; n: number; cor?: string; usuario?: number; especial?: boolean };
const COM_VAZIO_OU_NAO = new Set(['texto_longo', 'arquivos', 'ligacao']);
export const filtravel = (c: Coluna) => c.tipo !== 'formula' || !!c.config.formula;

export function opcoesFiltro(c: Coluna, itens: Item[], ctx: Contexto): Opcao[] {
  const conta = (k: string) => itens.reduce((n, i) => n + (casa(c, i, k, ctx) ? 1 : 0), 0);
  switch (c.tipo) {
    case 'status': {
      const rs = (c.config.rotulos ?? []) as Rotulo[];
      const ops: Opcao[] = [...rs.filter(r => r.id !== '0'), ...rs.filter(r => r.id === '0')].map(r => ({ chave: r.id, rotulo: r.texto || 'Sem rótulo', cor: r.cor, n: 0 }));
      const cont = new Map<string, number>();
      for (const i of itens) { const k = String(i.valores[c.id] ?? '0'); cont.set(k, (cont.get(k) ?? 0) + 1); }
      for (const o of ops) o.n = cont.get(o.chave) ?? 0;
      if (rs.some(r => r.concluido)) ops.unshift({ chave: '__concluidos', rotulo: 'Todos os concluídos', n: conta('__concluidos'), especial: true }, { chave: '__pendentes', rotulo: 'Todos os não concluídos', n: conta('__pendentes'), especial: true });
      return ops;
    }
    case 'lista': return [...((c.config.opcoes ?? []) as Rotulo[]).map(o => ({ chave: o.id, rotulo: o.texto, n: conta(o.id) })), { chave: '__vazio', rotulo: 'Vazio', n: conta('__vazio'), especial: true }];
    case 'pessoa': {
      const cont = new Map<number, number>();
      for (const i of itens) for (const u of (i.valores[c.id] ?? []) as number[]) cont.set(u, (cont.get(u) ?? 0) + 1);
      return [
        { chave: '__eu', rotulo: 'Eu (quem está usando)', n: conta('__eu'), especial: true },
        ...[...cont.entries()].sort((a, b) => b[1] - a[1]).map(([u, n]) => ({ chave: String(u), rotulo: ctx.nomeUsuario(u), n, usuario: u })),
        { chave: '__vazio', rotulo: 'Sem responsável', n: conta('__vazio'), especial: true },
      ];
    }
    case 'data': case 'periodo': return PERIODOS.map(p => ({ ...p, n: conta(p.chave), especial: true }));
    case 'caixa': return [{ chave: '1', rotulo: 'Marcado', n: conta('1') }, { chave: '__vazio', rotulo: 'Desmarcado', n: conta('__vazio') }];
    default: {
      if (COM_VAZIO_OU_NAO.has(c.tipo)) return [{ chave: '__com', rotulo: 'Preenchido', n: conta('__com') }, { chave: '__vazio', rotulo: 'Vazio', n: conta('__vazio') }];
      const cont = new Map<string, number>();
      for (const i of itens) { const t = textoCelula(c, i, ctx.colunas, ctx.nomeUsuario); if (t) cont.set(t, (cont.get(t) ?? 0) + 1); }
      const ops = [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40).map(([t, n]) => ({ chave: `t:${t}`, rotulo: t, n }));
      return [...ops, { chave: '__vazio', rotulo: 'Vazio', n: conta('__vazio'), especial: true }];
    }
  }
}

// Um item "casa" com uma opção de filtro de uma coluna?
function casa(c: Coluna, i: Item, k: string, ctx: Contexto): boolean {
  const v = i.valores[c.id];
  const hoje = ctx.hoje ?? hojeISO();
  if (k === '__vazio' && c.tipo !== 'status') return c.tipo === 'formula' ? !textoCelula(c, i, ctx.colunas, ctx.nomeUsuario) : vazio(v);
  if (k === '__com') return !vazio(v);
  switch (c.tipo) {
    case 'status':
      if (k === '__concluidos') return !!rotuloDe(c, v)?.concluido;
      if (k === '__pendentes') return !rotuloDe(c, v)?.concluido;
      return String(v ?? '0') === k;
    case 'lista': return ((v ?? []) as string[]).includes(k);
    case 'pessoa': return ((v ?? []) as number[]).includes(k === '__eu' ? (ctx.eu ?? -1) : Number(k));
    case 'data': case 'periodo': { const r = intervalo(c, v); return !!r && noPeriodo(k, r, hoje, itemConcluido(i, ctx.colunas)); }
    case 'caixa': return k === '1' ? !!v : !v;
    default: return k.startsWith('t:') && textoCelula(c, i, ctx.colunas, ctx.nomeUsuario) === k.slice(2);
  }
}

// Dentro de uma coluna vale qualquer opção marcada (OU); entre colunas, todas (E).
export function aplicarFiltros(itens: Item[], e: EstadoVisao, ctx: Contexto): Item[] {
  const ativos = Object.entries(e.filtros).filter(([, v]) => v.length);
  if (!ativos.length && !e.pessoa) return itens;
  const regras = ativos.map(([k, chaves]) => ({ k, chaves, c: ctx.colunas.find(x => String(x.id) === k) }));
  return itens.filter(i => {
    if (e.pessoa && !ctx.colunas.some(c => c.tipo === 'pessoa' && ((i.valores[c.id] ?? []) as number[]).includes(e.pessoa!))) return false;
    for (const r of regras) {
      if (r.k === 'grupo') { if (!r.chaves.includes(String(i.grupo_id))) return false; continue; }
      if (r.c && !r.chaves.some(k => casa(r.c!, i, k, ctx))) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- agrupar por coluna
export const AGRUPAVEIS = new Set(['status', 'lista', 'pessoa', 'data', 'periodo', 'caixa', 'numero', 'avaliacao', 'texto', 'telefone', 'email', 'formula', 'link']);
export type GrupoVirtual = Grupo & { valoresNovo: Record<string, unknown> };
type Balde = { chave: string; nome: string; cor: string; ordem: string | number; valoresNovo: Record<string, unknown> };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Grupos "virtuais" (um por valor da coluna). Em lista e pessoa o item aparece em cada valor que tiver.
export function agruparItens(itens: Item[], ag: Agrupar, ctx: Contexto & { usuarios: { id: number; nome: string; cor?: string }[] }): { grupos: GrupoVirtual[]; grupoDe: Map<number, number[]> } | null {
  const c = ctx.colunas.find(x => x.id === ag.coluna_id);
  if (!c) return null;
  const baldes = new Map<string, Balde>();
  const vazioB: Balde = { chave: '__vazio', nome: c.tipo === 'pessoa' ? 'Sem responsável' : c.tipo === 'data' || c.tipo === 'periodo' ? 'Sem data' : 'Sem valor', cor: '#c4c4c4', ordem: '￿', valoresNovo: {} };
  const add = (b: Balde) => { if (!baldes.has(b.chave)) baldes.set(b.chave, b); };
  const chavesDe = (i: Item): string[] => {
    const v = i.valores[c.id];
    switch (c.tipo) {
      case 'status': return [String(v ?? '0')];
      case 'lista': case 'pessoa': return ((v ?? []) as (string | number)[]).length ? (v as (string | number)[]).map(String) : ['__vazio'];
      case 'data': case 'periodo': { const r = intervalo(c, v); return [r ? r[0].slice(0, 7) : '__vazio']; }
      case 'caixa': return [v ? '1' : '__vazio'];
      case 'numero': case 'avaliacao': return [v == null || v === '' ? '__vazio' : String(Number(v))];
      default: { const t = textoCelula(c, i, ctx.colunas, ctx.nomeUsuario); return [t ? `t:${t}` : '__vazio']; }
    }
  };

  // Baldes que existem mesmo sem itens (para "mostrar grupos vazios").
  if (c.tipo === 'status') {
    const rs = (c.config.rotulos ?? []) as Rotulo[];
    [...rs.filter(r => r.id !== '0'), ...rs.filter(r => r.id === '0')].forEach((r, k) =>
      add({ chave: r.id, nome: r.texto || 'Sem rótulo', cor: r.id === '0' ? '#c4c4c4' : r.cor, ordem: r.id === '0' ? 99999 : k, valoresNovo: r.id === '0' ? {} : { [c.id]: r.id } }));
  } else if (c.tipo === 'lista') {
    ((c.config.opcoes ?? []) as Rotulo[]).forEach((o, k) => add({ chave: o.id, nome: o.texto, cor: CORES[(k * 3) % CORES.length], ordem: k, valoresNovo: { [c.id]: [o.id] } }));
  } else if (c.tipo === 'pessoa' && ag.vazios) {
    ctx.usuarios.forEach(u => add({ chave: String(u.id), nome: u.nome, cor: u.cor ?? '#579bfc', ordem: u.nome.toLowerCase(), valoresNovo: { [c.id]: [u.id] } }));
  } else if (c.tipo === 'caixa') {
    add({ chave: '1', nome: 'Marcado', cor: '#00a36c', ordem: 0, valoresNovo: { [c.id]: true } });
    add({ chave: '__vazio', nome: 'Desmarcado', cor: '#c4c4c4', ordem: 1, valoresNovo: {} });
  }

  const membros = new Map<number, string[]>();
  for (const i of itens) {
    const ks = chavesDe(i);
    membros.set(i.id, ks);
    for (const k of ks) {
      if (baldes.has(k)) continue;
      if (k === '__vazio') { add(vazioB); continue; }
      if (c.tipo === 'pessoa') { const u = ctx.usuarios.find(x => x.id === Number(k)); add({ chave: k, nome: u?.nome ?? ctx.nomeUsuario(k), cor: u?.cor ?? '#579bfc', ordem: (u?.nome ?? '').toLowerCase(), valoresNovo: { [c.id]: [Number(k)] } }); }
      else if (c.tipo === 'data' || c.tipo === 'periodo') { const [a, m] = k.split('-').map(Number); add({ chave: k, nome: `${MESES[m - 1]} de ${a}`, cor: CORES[(m * 5) % CORES.length], ordem: k, valoresNovo: {} }); }
      else if (c.tipo === 'numero' || c.tipo === 'avaliacao') add({ chave: k, nome: c.tipo === 'numero' ? fmtNumeroColuna({ ...c.config, unidade: '' }, k) : k.replace('.', ','), cor: '#579bfc', ordem: Number(k), valoresNovo: { [c.id]: Number(k) } });
      else { const t = k.slice(2); add({ chave: k, nome: t, cor: '#579bfc', ordem: t.toLowerCase(), valoresNovo: ['texto', 'telefone', 'email'].includes(c.tipo) ? { [c.id]: t } : {} }); }
    }
  }
  const usados = new Set([...membros.values()].flat());
  let lista = [...baldes.values()].filter(b => ag.vazios || usados.has(b.chave));
  lista.sort((a, b) => (a.chave === '__vazio' ? 1 : b.chave === '__vazio' ? -1 : (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : 0) * ag.ordem));
  // Cores diferentes para grupos de texto/número (que não têm cor própria).
  if (!['status', 'lista', 'pessoa', 'caixa', 'data', 'periodo'].includes(c.tipo)) lista = lista.map((b, k) => (b.chave === '__vazio' ? b : { ...b, cor: CORES[(k * 3) % CORES.length] }));
  const idDe = new Map(lista.map((b, k) => [b.chave, -(k + 1)]));
  const grupos = lista.map((b, k) => ({ id: -(k + 1), quadro_id: c.quadro_id, nome: b.nome, cor: b.cor, posicao: k, recolhido: 0, valoresNovo: b.valoresNovo }) as GrupoVirtual);
  const grupoDe = new Map<number, number[]>();
  for (const [id, ks] of membros) grupoDe.set(id, ks.map(k => idDe.get(k)).filter((x): x is number => x != null));
  return { grupos, grupoDe };
}
