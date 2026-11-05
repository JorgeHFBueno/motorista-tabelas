import type { Row } from '../api.ts';
import { calcular } from '../quadro/formula.ts';
import { rotuloDe, vazio, type Coluna, type Grupo, type Item, type Rotulo } from '../quadro/tipos.ts';
import { CORES } from '../util.ts';

// Painel: números e gráficos calculados a partir dos itens de um ou mais quadros.
// As colunas são escolhidas pelo TÍTULO, então o mesmo widget junta quadros com a mesma estrutura
// (ex.: Negócios públicos 2025 + 2026). O grupo do item é a coluna especial GRUPO.
export const GRUPO = '@grupo';

export type Calculo = 'contagem' | 'soma' | 'media';
export type TipoWidget = 'numero' | 'pizza' | 'colunas' | 'barras';
// Filtro do widget: o item entra se a coluna tiver um dos valores (ou nenhum deles, com negar).
export type FiltroWidget = { coluna: string; valores: string[]; negar?: boolean };
export type Widget = {
  id: string; titulo: string; tipo: TipoWidget;
  calculo: Calculo; valor?: string; // valor: título da coluna de números (soma e média)
  eixo?: string; // gráficos: agrupar por esta coluna (data e período agrupam por mês)
  pilha?: string; // barras: dividir cada barra por esta coluna
  filtros?: FiltroWidget[];
  largo?: boolean;
};
export type ConfigPainel = { quadros?: number[]; widgets?: Widget[] };
export type DadosQuadro = { quadro: Row; grupos: Grupo[]; colunas: Coluna[]; itens: Item[] };

export type Fatia = { chave: string; rotulo: string; cor: string; valor: number; n: number; pilhas: Fatia[] };
export type Resultado = {
  valor: number; n: number; fatias: Fatia[]; unidade: string;
  // Itens que passaram nos filtros mas ficaram de fora (ou valeram zero) por falta de dado: o painel mostra isso.
  semEixo: number; semValor: number;
  // Quadros em que alguma coluna usada pelo widget não existe.
  faltando: { quadro: string; coluna: string }[];
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(2, 4)}`;

// Tipos de coluna que podem agrupar um gráfico ou filtrar.
export const CATEGORICAS = ['status', 'pessoa', 'lista', 'data', 'periodo', 'caixa', 'texto', 'avaliacao', 'formula'];
export const NUMERICAS = ['numero', 'formula', 'avaliacao'];

type Ctx = { nomeUsuario: (id: unknown) => string };
type Categoria = { chave: string; rotulo: string; cor?: string; ordem: number };

// Categorias de um item numa coluna (pessoa e lista podem ter várias: o item conta em cada uma).
function categorias(d: DadosQuadro, item: Item, titulo: string, ctx: Ctx): Categoria[] | null {
  if (titulo === GRUPO) {
    const g = d.grupos.find(x => x.id === item.grupo_id);
    return g ? [{ chave: g.nome, rotulo: g.nome, cor: g.cor, ordem: g.posicao }] : [];
  }
  const c = d.colunas.find(x => x.titulo === titulo);
  if (!c) return null;
  const v = c.tipo === 'formula' ? calcular(c, item, { colunas: d.colunas, nomeUsuario: ctx.nomeUsuario }).valor : item.valores[c.id];
  if (vazio(v)) return [];
  switch (c.tipo) {
    case 'status': {
      const r = rotuloDe(c, v);
      const ordem = ((c.config.rotulos ?? []) as Rotulo[]).findIndex(x => x.id === r?.id);
      return r?.texto ? [{ chave: r.texto, rotulo: r.texto, cor: r.cor, ordem }] : [];
    }
    case 'pessoa': return (v as number[]).map(id => ({ chave: ctx.nomeUsuario(id), rotulo: ctx.nomeUsuario(id), ordem: 0 }));
    case 'lista': return (v as string[]).flatMap(id => {
      const o = ((c.config.opcoes ?? []) as Rotulo[]).find(x => x.id === id);
      return o ? [{ chave: o.texto, rotulo: o.texto, cor: o.cor, ordem: 0 }] : [];
    });
    case 'data': case 'periodo': {
      const iso = String(c.tipo === 'periodo' ? v.inicio ?? '' : v).slice(0, 7);
      return /^\d{4}-\d{2}$/.test(iso) ? [{ chave: iso, rotulo: nomeMes(iso), ordem: 0 }] : [];
    }
    case 'caixa': return [{ chave: v ? 'Marcado' : 'Não marcado', rotulo: v ? 'Marcado' : 'Não marcado', ordem: v ? 0 : 1 }];
    default: return [{ chave: String(v), rotulo: String(v), ordem: 0 }];
  }
}

function numero(d: DadosQuadro, item: Item, titulo: string, ctx: Ctx): number | null | undefined {
  const c = d.colunas.find(x => x.titulo === titulo);
  if (!c) return undefined;
  const v = c.tipo === 'formula' ? calcular(c, item, { colunas: d.colunas, nomeUsuario: ctx.nomeUsuario }).valor : item.valores[c.id];
  if (vazio(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function passa(d: DadosQuadro, item: Item, filtros: FiltroWidget[], ctx: Ctx): boolean {
  return filtros.every(f => {
    if (!f.valores.length) return true;
    const tem = (categorias(d, item, f.coluna, ctx) ?? []).some(c => f.valores.includes(c.chave));
    return f.negar ? !tem : tem;
  });
}

const ehData = (dados: DadosQuadro[], titulo?: string) =>
  !!titulo && dados.some(d => ['data', 'periodo'].includes(d.colunas.find(c => c.titulo === titulo)?.tipo ?? ''));

export function calcularWidget(w: Widget, dados: DadosQuadro[], ctx: Ctx): Resultado {
  const usaValor = w.calculo !== 'contagem' && !!w.valor;
  const eixo = w.tipo === 'numero' ? undefined : w.eixo;
  const pilha = w.tipo === 'barras' ? w.pilha : undefined;
  const r: Resultado = { valor: 0, n: 0, fatias: [], unidade: '', semEixo: 0, semValor: 0, faltando: [] };
  const fatias = new Map<string, Fatia & { ordem: number; somados: number }>();
  let somados = 0;
  for (const d of dados) {
    for (const titulo of [w.valor && usaValor ? w.valor : null, eixo, pilha, ...(w.filtros ?? []).map(f => f.coluna)]) {
      if (titulo && titulo !== GRUPO && !d.colunas.some(c => c.titulo === titulo) && !r.faltando.some(f => f.quadro === d.quadro.nome && f.coluna === titulo)) {
        r.faltando.push({ quadro: String(d.quadro.nome), coluna: titulo });
      }
    }
    const colValor = usaValor ? d.colunas.find(c => c.titulo === w.valor) : undefined;
    if (colValor?.config.unidade && !r.unidade) r.unidade = colValor.config.unidade;
    for (const item of d.itens) {
      if (!passa(d, item, w.filtros ?? [], ctx)) continue;
      const v = usaValor ? numero(d, item, w.valor!, ctx) : 1;
      if (usaValor && v == null) r.semValor++;
      const cats = eixo ? categorias(d, item, eixo, ctx) ?? [] : [{ chave: '', rotulo: '', ordem: 0 }];
      if (!cats.length) { r.semEixo++; continue; }
      r.n++;
      if (v != null) { r.valor += v; somados++; }
      for (const cat of cats) {
        let f = fatias.get(cat.chave);
        if (!f) { f = { ...cat, cor: cat.cor ?? '', valor: 0, n: 0, pilhas: [], somados: 0 }; fatias.set(cat.chave, f); }
        f.n++;
        if (v != null) { f.valor += v; f.somados++; }
        if (pilha) {
          for (const p of categorias(d, item, pilha, ctx) ?? []) {
            let s = f.pilhas.find(x => x.chave === p.chave);
            if (!s) { s = { chave: p.chave, rotulo: p.rotulo, cor: p.cor ?? '', valor: 0, n: 0, pilhas: [] }; f.pilhas.push(s); }
            s.n++;
            if (v != null) s.valor += v;
          }
        }
      }
    }
  }
  // Média: só entre os itens que têm valor (os vazios aparecem no aviso "sem valor").
  const media = (soma: number, k: number) => (k ? soma / k : 0);
  if (w.calculo === 'media') r.valor = media(r.valor, somados);
  const lista = [...fatias.values()].map(f => ({ ...f, valor: w.calculo === 'media' ? media(f.valor, f.somados) : f.valor }));
  // Meses em ordem de calendário (e numa cor só); status na ordem dos rótulos; o resto do maior para o menor.
  const porMes = ehData(dados, eixo);
  if (porMes) lista.forEach(f => { f.cor = '#579bfc'; });
  if (porMes) lista.sort((a, b) => a.chave.localeCompare(b.chave));
  else if (lista.some(f => f.ordem)) lista.sort((a, b) => a.ordem - b.ordem || b.valor - a.valor);
  else lista.sort((a, b) => b.valor - a.valor);
  // Cores: as dos rótulos; quem não tem cor pega da paleta.
  let k = 0;
  const cor = (f: Fatia) => f.cor || CORES[k++ % CORES.length];
  const pilhaCores = new Map<string, string>();
  r.fatias = lista.map(f => ({
    chave: f.chave, rotulo: f.rotulo, valor: f.valor, n: f.n, cor: cor(f),
    pilhas: f.pilhas.map(p => {
      if (!pilhaCores.has(p.chave)) pilhaCores.set(p.chave, p.cor || CORES[(pilhaCores.size + 3) % CORES.length]);
      return { ...p, cor: pilhaCores.get(p.chave)! };
    }),
  }));
  return r;
}

// Todos os valores que uma coluna assume nos quadros (para montar filtros).
export function valoresDaColuna(dados: DadosQuadro[], titulo: string, ctx: Ctx): { chave: string; rotulo: string; cor?: string }[] {
  const vistos = new Map<string, { chave: string; rotulo: string; cor?: string; ordem: number }>();
  for (const d of dados) {
    const c = d.colunas.find(x => x.titulo === titulo);
    // Rótulos e opções aparecem mesmo sem item usando.
    if (c?.tipo === 'status') ((c.config.rotulos ?? []) as Rotulo[]).forEach((r, i) => { if (r.texto && !vistos.has(r.texto)) vistos.set(r.texto, { chave: r.texto, rotulo: r.texto, cor: r.cor, ordem: i }); });
    if (c?.tipo === 'lista') ((c.config.opcoes ?? []) as Rotulo[]).forEach((o, i) => { if (!vistos.has(o.texto)) vistos.set(o.texto, { chave: o.texto, rotulo: o.texto, cor: o.cor, ordem: i }); });
    for (const item of d.itens) for (const cat of categorias(d, item, titulo, ctx) ?? []) if (!vistos.has(cat.chave)) vistos.set(cat.chave, cat);
  }
  return [...vistos.values()].sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo));
}

// Colunas disponíveis nos quadros do painel (pelo título), com o tipo da primeira ocorrência.
export function colunasDosQuadros(dados: DadosQuadro[]): { titulo: string; tipo: string; quadros: number }[] {
  const m = new Map<string, { titulo: string; tipo: string; quadros: number }>();
  for (const d of dados) for (const c of d.colunas) {
    const x = m.get(c.titulo);
    if (x) x.quadros++; else m.set(c.titulo, { titulo: c.titulo, tipo: c.tipo, quadros: 1 });
  }
  return [...m.values()];
}
