import type { Row } from '../api.ts';
import { calcular } from '../quadro/formula.ts';
import { itemConcluido, rotuloDe, textoCelula, vazio, type Coluna, type Grupo, type Item, type Rotulo } from '../quadro/tipos.ts';
import { CORES, diasEntre, fmtData, fmtNumero, hojeISO, inicioDaSemana, somarDias } from '../util.ts';

// Painel: números e gráficos calculados a partir dos itens de um ou mais quadros.
// As colunas são escolhidas pelo TÍTULO, então o mesmo widget junta quadros com a mesma estrutura
// (ex.: Negócios públicos 2025 + 2026). O grupo do item é a coluna especial GRUPO.
export const GRUPO = '@grupo';
export const SEM_VALOR = '(sem valor)';

export type Calculo = 'contagem' | 'soma' | 'media';
export type TipoWidget = 'numero' | 'pizza' | 'colunas' | 'barras' | 'linha' | 'bateria' | 'funil' | 'pivo' | 'matriz' | 'lista' | 'carga' | 'texto';
export type Periodo = 'dia' | 'semana' | 'mes' | 'trimestre' | 'ano';
export type Atalho = 'mes_atual' | 'mes_anterior' | 'trimestre_atual' | 'ano_atual' | 'ano_anterior' | 'ultimos_30' | 'ultimos_90';
// Filtro do widget: o item entra se a coluna tiver um dos valores (ou nenhum deles, com negar).
export type FiltroWidget = { coluna: string; valores: string[]; negar?: boolean };
// Janela de datas: um atalho que acompanha o dia de hoje ("mês atual") ou um intervalo fixo.
export type Janela = { coluna: string; atalho?: Atalho; de?: string; ate?: string };
export type Widget = {
  id: string; titulo: string; tipo: TipoWidget;
  calculo: Calculo; valor?: string; // valor: título da coluna de números (soma e média)
  eixo?: string; // gráficos: agrupar por esta coluna
  periodo?: Periodo; // eixo de data: agrupar por dia, semana, mês, trimestre ou ano (sem nada: mês)
  pilha?: string; // barras, colunas, linha e tabela dinâmica: dividir por esta coluna
  filtros?: FiltroWidget[];
  janela?: Janela; // só deste widget; tem prioridade sobre a janela geral do painel
  ignorarGeral?: boolean; // o filtro geral do painel não vale para este widget
  largo?: boolean;
  ordem?: 'padrao' | 'maior' | 'menor' | 'alfabetica';
  texto?: string; // texto
  feito?: string[]; // bateria: rótulos que contam como feito (sem nada: os marcados como concluído)
  etapas?: string[]; // funil: ordem das etapas
  acumular?: boolean; // funil: quem está numa etapa já passou pelas anteriores (padrão: sim)
  colunas?: string[]; // matriz e lista
  ordenarPor?: string; direcao?: 1 | -1; limite?: number; // lista e matriz
  dataAlerta?: string; // lista: coluna de data que dá a cor de atraso e os dias até vencer
  soPendentes?: boolean; // matriz: só as linhas com alguma célula vazia
  ocultarConcluidos?: boolean; // lista e carga: tira os itens concluídos
  data?: string; // carga: coluna de data ou período do trabalho
  capacidade?: number; // carga: acima disso a célula fica em alerta
  comparar?: 'periodo_anterior' | 'ano_anterior'; // numero
  tendencia?: boolean; // numero: mini gráfico dos últimos 6 meses
  comQuantidade?: boolean; // colunas com soma ou média: mostra também a quantidade de itens, lado a lado
};
export type FiltroGeral = { filtros?: FiltroWidget[]; janela?: Janela };
// aparencia 'monday': grade de 2 colunas e gráficos como os do monday. Muda só o desenho, não o cálculo.
export type ConfigPainel = { quadros?: number[]; widgets?: Widget[]; geral?: FiltroGeral; aparencia?: 'monday' };
export type DadosQuadro = { quadro: Row; grupos: Grupo[]; colunas: Coluna[]; itens: Item[] };

// Eixo Y: passo redondo (1, 2, 2,5 ou 5 vezes uma potência de 10) e o topo, múltiplo do passo, que cobre o máximo.
export function escalaEixo(max: number, inteiro = false) {
  if (!(max > 0)) return { topo: 1, passo: 1 };
  const alvo = max / 6;
  const potencia = 10 ** Math.floor(Math.log10(alvo));
  let passo = [1, 2, 2.5, 5, 10].map(c => c * potencia).find(p => p >= alvo) ?? 10 * potencia;
  if (inteiro) passo = Math.max(1, Math.ceil(passo));
  return { topo: Math.ceil(max / passo) * passo, passo };
}

// Texto do widget: "# título", "- item" (ou "• item") e **negrito**. Sem HTML: o resto é texto puro.
export type ParteTexto = { texto: string; negrito: boolean };
export type BlocoTexto = { tipo: 'titulo' | 'item' | 'paragrafo'; partes: ParteTexto[] };
export function blocosDoTexto(texto: string): BlocoTexto[] {
  return texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const tipo: BlocoTexto['tipo'] = l.startsWith('# ') ? 'titulo' : /^[-•] /.test(l) ? 'item' : 'paragrafo';
    const corpo = tipo === 'paragrafo' ? l : l.slice(2).trim();
    const partes = corpo.split('**').map((t, i) => ({ texto: t, negrito: i % 2 === 1 })).filter(p => p.texto);
    return { tipo, partes };
  });
}

export type Fatia = { chave: string; rotulo: string; cor: string; valor: number; n: number; pilhas: Fatia[]; concluido?: boolean };
export type EtapaFunil = { chave: string; rotulo: string; cor: string; proprio: number; acumulado: number; conversao: number | null };
export type CelulaTabela = { texto: string; cor?: string; vazia: boolean };
export type LinhaTabela = { id: number; quadroId: number; nome: string; quadro: string; grupo: string; celulas: Record<string, CelulaTabela>; dias?: number | null };
export type LinhaCarga = { chave: string; rotulo: string; celulas: number[]; total: number };
export type Intervalo = { de: string; ate: string };
export type Resultado = {
  valor: number; n: number; fatias: Fatia[]; unidade: string;
  // Itens que passaram nos filtros mas ficaram de fora (ou valeram zero) por falta de dado: o painel mostra isso.
  semEixo: number; semValor: number;
  // Quadros em que alguma coluna usada pelo widget não existe.
  faltando: { quadro: string; coluna: string }[];
  intervalo?: Intervalo | null;
  pilhasColunas?: { chave: string; rotulo: string; cor: string; valor: number }[];
  feito?: { valor: number; total: number; pct: number };
  funil?: EtapaFunil[]; foraFunil?: Fatia[];
  comparacao?: { anterior: number; variacao: number | null; rotulo: string };
  serie?: { chave: string; rotulo: string; valor: number }[];
  tabela?: { colunas: string[]; linhas: LinhaTabela[]; cortadas: number };
  carga?: { buckets: { chave: string; rotulo: string; de: string; ate: string }[]; linhas: LinhaCarga[]; max: number };
};
export type Ctx = { nomeUsuario: (id: unknown) => string; nomeItem?: (id: unknown) => string | undefined; hoje?: string };
type Categoria = { chave: string; rotulo: string; cor?: string; ordem: number; concluido?: boolean };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(2, 4)}`;
const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// "jan/25" vira "janeiro 2025"; qualquer outro rótulo fica como está.
export function mesPorExtenso(rotulo: string) {
  const m = /^([a-zç]{3})\/(\d{2})$/.exec(rotulo);
  const i = m ? MESES.indexOf(m[1]) : -1;
  return m && i >= 0 ? `${MESES_EXTENSO[i]} 20${m[2]}` : rotulo;
}

// Tipos de coluna que podem agrupar um gráfico ou filtrar.
export const CATEGORICAS = ['status', 'pessoa', 'lista', 'data', 'periodo', 'caixa', 'texto', 'avaliacao', 'formula', 'ligacao'];
export const NUMERICAS = ['numero', 'formula', 'avaliacao'];
export const DATAS = ['data', 'periodo'];

// ---------------------------------------------------------------- datas
const addMeses = (iso: string, n: number) => {
  const [a, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const fimDoMes = (iso: string) => somarDias(addMeses(iso, 1), -1);
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
const inicioDoTrimestre = (iso: string) => `${iso.slice(0, 4)}-${String(Math.floor((Number(iso.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;

export function resolverJanela(j: Janela | undefined, hoje: string): Intervalo | null {
  if (!j?.coluna) return null;
  const a = hoje.slice(0, 4);
  switch (j.atalho) {
    case 'mes_atual': return { de: inicioDoMes(hoje), ate: fimDoMes(hoje) };
    case 'mes_anterior': { const d = addMeses(hoje, -1); return { de: d, ate: fimDoMes(d) }; }
    case 'trimestre_atual': { const d = inicioDoTrimestre(hoje); return { de: d, ate: fimDoMes(addMeses(d, 2)) }; }
    case 'ano_atual': return { de: `${a}-01-01`, ate: `${a}-12-31` };
    case 'ano_anterior': return { de: `${Number(a) - 1}-01-01`, ate: `${Number(a) - 1}-12-31` };
    case 'ultimos_30': return { de: somarDias(hoje, -29), ate: hoje };
    case 'ultimos_90': return { de: somarDias(hoje, -89), ate: hoje };
    default: return j.de || j.ate ? { de: j.de || '0000-01-01', ate: j.ate || '9999-12-31' } : null;
  }
}

// Período de comparação: mês inteiro compara com mês inteiro; o resto, com o mesmo número de dias antes.
export function intervaloAnterior(i: Intervalo, com: 'periodo_anterior' | 'ano_anterior'): Intervalo {
  if (com === 'ano_anterior') {
    const volta = (iso: string) => {
      const [a, m, d] = iso.split('-').map(Number);
      return m === 2 && d === 29 ? `${a - 1}-02-28` : `${a - 1}-${iso.slice(5)}`;
    };
    return { de: volta(i.de), ate: i.ate === fimDoMes(i.ate) ? fimDoMes(`${Number(i.ate.slice(0, 4)) - 1}-${i.ate.slice(5, 7)}-01`) : volta(i.ate) };
  }
  if (i.de.endsWith('-01') && i.ate === fimDoMes(i.ate)) {
    const n = (Number(i.ate.slice(0, 4)) - Number(i.de.slice(0, 4))) * 12 + Number(i.ate.slice(5, 7)) - Number(i.de.slice(5, 7)) + 1;
    return { de: addMeses(i.de, -n), ate: fimDoMes(addMeses(i.ate, -n)) };
  }
  const n = diasEntre(i.de, i.ate) + 1;
  return { de: somarDias(i.de, -n), ate: somarDias(i.ate, -n) };
}

function chaveData(iso: string, p: Periodo): { chave: string; rotulo: string } | null {
  if (!/^\d{4}-\d{2}/.test(iso)) return null;
  const mes = iso.slice(0, 7);
  switch (p) {
    case 'dia': return iso.length >= 10 ? { chave: iso.slice(0, 10), rotulo: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` } : null;
    case 'semana': {
      if (iso.length < 10) return null;
      const ini = inicioDaSemana(iso.slice(0, 10));
      return { chave: ini, rotulo: `sem ${ini.slice(8, 10)}/${ini.slice(5, 7)}` };
    }
    case 'trimestre': {
      const t = Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;
      return { chave: `${iso.slice(0, 4)}-T${t}`, rotulo: `${t}º tri/${iso.slice(2, 4)}` };
    }
    case 'ano': return { chave: iso.slice(0, 4), rotulo: iso.slice(0, 4) };
    default: return { chave: mes, rotulo: nomeMes(mes) };
  }
}

// ---------------------------------------------------------------- leitura dos itens
// Categorias de um item numa coluna (pessoa, lista e ligação podem ter várias: o item conta em cada uma).
function categorias(d: DadosQuadro, item: Item, titulo: string, ctx: Ctx, periodo: Periodo = 'mes'): Categoria[] | null {
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
      return r?.texto ? [{ chave: r.texto, rotulo: r.texto, cor: r.cor, ordem, concluido: !!r.concluido }] : [];
    }
    case 'pessoa': return (v as number[]).map(id => ({ chave: ctx.nomeUsuario(id), rotulo: ctx.nomeUsuario(id), ordem: 0 }));
    case 'lista': return (v as string[]).flatMap(id => {
      const o = ((c.config.opcoes ?? []) as Rotulo[]).find(x => x.id === id);
      return o ? [{ chave: o.texto, rotulo: o.texto, cor: o.cor, ordem: 0 }] : [];
    });
    case 'ligacao': return (v as number[]).map(id => {
      const nome = ctx.nomeItem?.(id) ?? `Item ${id}`;
      return { chave: nome, rotulo: nome, ordem: 0 };
    });
    case 'data': case 'periodo': {
      const k = chaveData(String(c.tipo === 'periodo' ? v.inicio ?? v.fim ?? '' : v), periodo);
      return k ? [{ ...k, ordem: 0 }] : [];
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

function intervaloDoItem(d: DadosQuadro, item: Item, titulo: string): Intervalo | null {
  const c = d.colunas.find(x => x.titulo === titulo);
  if (!c) return null;
  const v = item.valores[c.id];
  if (vazio(v)) return null;
  if (c.tipo === 'periodo') {
    const de = v.inicio ?? v.fim;
    const ate = v.fim ?? v.inicio;
    return de ? { de: String(de).slice(0, 10), ate: String(ate).slice(0, 10) } : null;
  }
  return c.tipo === 'data' ? { de: String(v).slice(0, 10), ate: String(v).slice(0, 10) } : null;
}
const sobrepoe = (a: Intervalo, b: Intervalo) => a.de <= b.ate && a.ate >= b.de;
const dentro = (d: DadosQuadro, item: Item, janela: Janela | undefined, i: Intervalo | null) => {
  if (!janela || !i) return true;
  const it = intervaloDoItem(d, item, janela.coluna);
  return !!it && sobrepoe(it, i);
};

const ehData = (dados: DadosQuadro[], titulo?: string) =>
  !!titulo && dados.some(d => DATAS.includes(d.colunas.find(c => c.titulo === titulo)?.tipo ?? ''));

export const TEM_PILHA: TipoWidget[] = ['barras', 'colunas', 'linha', 'pivo'];
export const TEM_EIXO: TipoWidget[] = ['pizza', 'colunas', 'barras', 'linha', 'bateria', 'funil', 'pivo', 'carga'];

function escopo(w: Widget, geral: FiltroGeral | undefined, ctx: Ctx) {
  const usa = w.ignorarGeral ? undefined : geral;
  const filtros = [...(usa?.filtros ?? []), ...(w.filtros ?? [])];
  const janela = w.janela?.coluna ? w.janela : usa?.janela?.coluna ? usa.janela : undefined;
  return { filtros, janela, intervalo: resolverJanela(janela, ctx.hoje ?? hojeISO()) };
}

function faltaColuna(r: Resultado, d: DadosQuadro, titulos: (string | null | undefined)[]) {
  for (const titulo of titulos) {
    if (titulo && titulo !== GRUPO && !d.colunas.some(c => c.titulo === titulo) && !r.faltando.some(f => f.quadro === d.quadro.nome && f.coluna === titulo)) {
      r.faltando.push({ quadro: String(d.quadro.nome), coluna: titulo });
    }
  }
}
const resultadoVazio = (intervalo?: Intervalo | null): Resultado => ({ valor: 0, n: 0, fatias: [], unidade: '', semEixo: 0, semValor: 0, faltando: [], intervalo });

// ---------------------------------------------------------------- cálculo principal
function nucleo(w: Widget, dados: DadosQuadro[], ctx: Ctx, filtros: FiltroWidget[], janela: Janela | undefined, intervalo: Intervalo | null): Resultado {
  const usaValor = w.calculo !== 'contagem' && !!w.valor;
  const eixo = TEM_EIXO.includes(w.tipo) ? w.eixo : undefined;
  const pilha = TEM_PILHA.includes(w.tipo) ? w.pilha : undefined;
  const periodo = w.periodo ?? 'mes';
  const r = resultadoVazio(intervalo);
  type SomaPilha = Fatia & { somados: number; ordem: number };
  type Soma = Omit<Fatia, 'pilhas'> & { ordem: number; somados: number; pilhas: SomaPilha[] };
  const fatias = new Map<string, Soma>();
  let somados = 0;
  for (const d of dados) {
    faltaColuna(r, d, [usaValor ? w.valor : null, eixo, pilha, janela?.coluna, ...filtros.map(f => f.coluna)]);
    const colValor = usaValor ? d.colunas.find(c => c.titulo === w.valor) : undefined;
    if (colValor?.config.unidade && !r.unidade) r.unidade = colValor.config.unidade;
    for (const item of d.itens) {
      if (!passa(d, item, filtros, ctx) || !dentro(d, item, janela, intervalo)) continue;
      const v = usaValor ? numero(d, item, w.valor!, ctx) : 1;
      if (usaValor && v == null) r.semValor++;
      let cats: Categoria[] = eixo ? categorias(d, item, eixo, ctx, periodo) ?? [] : [{ chave: '', rotulo: '', ordem: 0 }];
      // Bateria: item sem status conta como não feito, em vez de sumir.
      if (w.tipo === 'bateria' && !cats.length) cats = [{ chave: SEM_VALOR, rotulo: 'Sem valor', cor: '#c4c4c4', ordem: 9999 }];
      if (!cats.length) { r.semEixo++; continue; }
      r.n++;
      if (v != null) { r.valor += v; somados++; }
      for (const cat of cats) {
        let f = fatias.get(cat.chave);
        if (!f) { f = { ...cat, cor: cat.cor ?? '', valor: 0, n: 0, pilhas: [], somados: 0 }; fatias.set(cat.chave, f); }
        f.n++;
        if (v != null) { f.valor += v; f.somados++; }
        if (pilha) {
          for (const p of categorias(d, item, pilha, ctx, periodo) ?? []) {
            let s = f.pilhas.find(x => x.chave === p.chave);
            if (!s) { s = { chave: p.chave, rotulo: p.rotulo, cor: p.cor ?? '', valor: 0, n: 0, pilhas: [], somados: 0, ordem: p.ordem }; f.pilhas.push(s); }
            s.n++;
            if (v != null) { s.valor += v; s.somados++; }
          }
        }
      }
    }
  }
  // Média: só entre os itens que têm valor (os vazios aparecem no aviso "sem valor").
  const media = (soma: number, k: number) => (k ? soma / k : 0);
  if (w.calculo === 'media') r.valor = media(r.valor, somados);
  const final = (x: { valor: number; somados: number }) => (w.calculo === 'media' ? media(x.valor, x.somados) : x.valor);
  const lista = [...fatias.values()].map(f => ({ ...f, valor: final(f), pilhas: f.pilhas.map(p => ({ ...p, bruto: p.valor, valor: final(p) })) }));
  // Datas em ordem de calendário (e numa cor só); status na ordem dos rótulos; o resto do maior para o menor.
  const porData = ehData(dados, eixo);
  if (porData) lista.forEach(f => { f.cor = '#579bfc'; });
  if (porData) lista.sort((a, b) => a.chave.localeCompare(b.chave));
  else if (lista.some(f => f.ordem)) lista.sort((a, b) => a.ordem - b.ordem || b.valor - a.valor);
  else lista.sort((a, b) => b.valor - a.valor);
  if (w.ordem === 'maior') lista.sort((a, b) => b.valor - a.valor);
  if (w.ordem === 'menor') lista.sort((a, b) => a.valor - b.valor);
  if (w.ordem === 'alfabetica') lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  // Cores: as dos rótulos; quem não tem cor pega da paleta.
  let k = 0;
  const cor = (f: { cor: string }) => f.cor || CORES[k++ % CORES.length];
  const pilhaCores = new Map<string, string>();
  r.fatias = lista.map(f => ({
    chave: f.chave, rotulo: f.rotulo, valor: f.valor, n: f.n, cor: cor(f), concluido: f.concluido,
    pilhas: f.pilhas.map(p => {
      if (!pilhaCores.has(p.chave)) pilhaCores.set(p.chave, p.cor || CORES[(pilhaCores.size + 3) % CORES.length]);
      return { chave: p.chave, rotulo: p.rotulo, valor: p.valor, n: p.n, pilhas: [], cor: pilhaCores.get(p.chave)! };
    }),
  }));
  if (pilha) {
    // Colunas da tabela dinâmica e legenda: datas em ordem de calendário; status na ordem dos rótulos.
    const vistas = new Map<string, { chave: string; rotulo: string; cor: string; valor: number; somados: number; ordem: number }>();
    for (const f of lista) for (const p of f.pilhas) {
      const x = vistas.get(p.chave) ?? { chave: p.chave, rotulo: p.rotulo, cor: pilhaCores.get(p.chave)!, valor: 0, somados: 0, ordem: p.ordem };
      x.valor += p.bruto; x.somados += p.somados;
      vistas.set(p.chave, x);
    }
    const cols = [...vistas.values()];
    if (ehData(dados, pilha)) cols.sort((a, b) => a.chave.localeCompare(b.chave));
    else if (cols.some(c => c.ordem)) cols.sort((a, b) => a.ordem - b.ordem);
    else cols.sort((a, b) => b.valor - a.valor);
    r.pilhasColunas = cols.map(c => ({ chave: c.chave, rotulo: c.rotulo, cor: c.cor, valor: final(c) }));
    // As fatias seguem a mesma ordem, para a pilha não mudar de lugar entre uma barra e outra.
    const pos = new Map(cols.map((c, i) => [c.chave, i]));
    r.fatias.forEach(f => f.pilhas.sort((a, b) => (pos.get(a.chave) ?? 0) - (pos.get(b.chave) ?? 0)));
  }
  return r;
}

function aplicarBateria(w: Widget, r: Resultado) {
  const feitos = w.feito?.length ? r.fatias.filter(f => w.feito!.includes(f.chave)) : r.fatias.filter(f => f.concluido);
  const valor = feitos.reduce((s, f) => s + Math.max(f.valor, 0), 0);
  const total = r.fatias.reduce((s, f) => s + Math.max(f.valor, 0), 0);
  r.feito = { valor, total, pct: total ? (valor / total) * 100 : 0 };
}

// Funil: a ordem vem do widget. Quem está numa etapa já passou pelas anteriores (acumular), salvo se o widget disser que não.
function aplicarFunil(w: Widget, r: Resultado, dados: DadosQuadro[], ctx: Ctx) {
  const conhecidos = valoresDaColuna(dados, w.eixo ?? '', ctx);
  const ordem = w.etapas?.length ? w.etapas : conhecidos.map(v => v.chave).filter(c => !/perd|cancel/i.test(c));
  const porChave = new Map(r.fatias.map(f => [f.chave, f]));
  const info = new Map(conhecidos.map(v => [v.chave, v]));
  let k = 0;
  const etapas: EtapaFunil[] = ordem.map(chave => {
    const f = porChave.get(chave);
    return { chave, rotulo: f?.rotulo ?? info.get(chave)?.rotulo ?? chave, cor: f?.cor ?? info.get(chave)?.cor ?? CORES[k++ % CORES.length], proprio: f?.valor ?? 0, acumulado: f?.valor ?? 0, conversao: null };
  });
  if (w.acumular !== false && w.calculo !== 'media') for (let i = etapas.length - 2; i >= 0; i--) etapas[i].acumulado += etapas[i + 1].acumulado;
  etapas.forEach((e, i) => { if (i) e.conversao = etapas[i - 1].acumulado ? (e.acumulado / etapas[i - 1].acumulado) * 100 : null; });
  r.funil = etapas;
  r.foraFunil = r.fatias.filter(f => !ordem.includes(f.chave));
}

// Valor de uma coluna para mostrar na matriz e na lista.
function celula(d: DadosQuadro, item: Item, titulo: string, ctx: Ctx): CelulaTabela {
  if (titulo === GRUPO) {
    const g = d.grupos.find(x => x.id === item.grupo_id);
    return { texto: g?.nome ?? '', cor: g?.cor, vazia: !g };
  }
  const c = d.colunas.find(x => x.titulo === titulo);
  if (!c) return { texto: '', vazia: true };
  if (c.tipo === 'formula') { const texto = textoCelula(c, item, d.colunas, ctx.nomeUsuario); return { texto, vazia: !texto }; }
  const v = item.valores[c.id];
  if (vazio(v)) return { texto: '', vazia: true };
  switch (c.tipo) {
    case 'status': case 'lista': case 'ligacao': case 'pessoa': {
      const cats = categorias(d, item, titulo, ctx) ?? [];
      return { texto: cats.map(x => x.rotulo).join(', '), cor: cats.length === 1 ? cats[0].cor : undefined, vazia: !cats.length };
    }
    case 'data': return { texto: fmtData(String(v)), vazia: false };
    case 'periodo': return { texto: `${fmtData(v.inicio)} a ${fmtData(v.fim)}`, vazia: false };
    case 'numero': return { texto: fmtNumero(v, c.config.unidade), vazia: false };
    case 'caixa': return { texto: 'Sim', vazia: false };
    default: { const texto = textoCelula(c, item, d.colunas, ctx.nomeUsuario); return { texto, vazia: !texto }; }
  }
}

const COMPARADOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function montarTabela(w: Widget, dados: DadosQuadro[], ctx: Ctx, filtros: FiltroWidget[], janela: Janela | undefined, intervalo: Intervalo | null, r: Resultado) {
  const colunas = w.colunas ?? [];
  const hoje = ctx.hoje ?? hojeISO();
  const linhas: (LinhaTabela & { _ordem: string | number | null })[] = [];
  const porColuna = w.ordenarPor ?? w.dataAlerta;
  for (const d of dados) {
    faltaColuna(r, d, [...colunas, w.dataAlerta, porColuna, janela?.coluna, ...filtros.map(f => f.coluna)]);
    const colOrdem = d.colunas.find(c => c.titulo === porColuna);
    for (const item of d.itens) {
      if (!passa(d, item, filtros, ctx) || !dentro(d, item, janela, intervalo)) continue;
      if (w.ocultarConcluidos && itemConcluido(item, d.colunas)) continue;
      const celulas = Object.fromEntries(colunas.map(t => [t, celula(d, item, t, ctx)]));
      if (w.tipo === 'matriz' && w.soPendentes && !colunas.some(t => celulas[t].vazia)) continue;
      const data = w.dataAlerta ? intervaloDoItem(d, item, w.dataAlerta) : null;
      let chave: string | number | null = item.nome;
      if (porColuna) {
        if (colOrdem && DATAS.includes(colOrdem.tipo)) chave = intervaloDoItem(d, item, colOrdem.titulo)?.ate ?? null;
        else if (colOrdem?.tipo === 'numero') chave = vazio(item.valores[colOrdem.id]) ? null : Number(item.valores[colOrdem.id]);
        else chave = colOrdem ? celula(d, item, colOrdem.titulo, ctx).texto || null : null;
      }
      const g = d.grupos.find(x => x.id === item.grupo_id);
      linhas.push({ id: item.id, quadroId: Number(d.quadro.id), nome: item.nome, quadro: String(d.quadro.nome), grupo: g?.nome ?? '', celulas, dias: data ? diasEntre(hoje, data.ate) : w.dataAlerta ? null : undefined, _ordem: chave });
    }
  }
  const dir = w.direcao ?? 1;
  // Sem valor vai para o fim, nos dois sentidos.
  linhas.sort((a, b) => {
    if (a._ordem == null) return b._ordem == null ? 0 : 1;
    if (b._ordem == null) return -1;
    if (typeof a._ordem === 'number' && typeof b._ordem === 'number') return (a._ordem - b._ordem) * dir;
    return COMPARADOR.compare(String(a._ordem), String(b._ordem)) * dir;
  });
  const limite = w.limite && w.limite > 0 ? w.limite : 200;
  r.n = linhas.length;
  r.tabela = { colunas, linhas: linhas.slice(0, limite).map(({ _ordem, ...l }) => l), cortadas: Math.max(0, linhas.length - limite) };
}

function bucketsCarga(w: Widget, hoje: string, intervalo: Intervalo | null) {
  const p = w.periodo === 'mes' || w.periodo === 'dia' ? w.periodo : 'semana';
  const base = intervalo && intervalo.de !== '0000-01-01' ? intervalo.de : hoje;
  const out: { chave: string; rotulo: string; de: string; ate: string }[] = [];
  if (p === 'mes') {
    let m = inicioDoMes(base);
    for (let i = 0; i < 6; i++) { out.push({ chave: m, rotulo: nomeMes(m.slice(0, 7)), de: m, ate: fimDoMes(m) }); m = addMeses(m, 1); }
  } else if (p === 'dia') {
    for (let i = 0; i < 14; i++) { const d = somarDias(base, i); out.push({ chave: d, rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`, de: d, ate: d }); }
  } else {
    let s = inicioDaSemana(base);
    for (let i = 0; i < 12; i++) { out.push({ chave: s, rotulo: `${s.slice(8, 10)}/${s.slice(5, 7)}`, de: s, ate: somarDias(s, 6) }); s = somarDias(s, 7); }
  }
  return intervalo && intervalo.ate !== '9999-12-31' ? out.filter(b => b.de <= intervalo.ate) : out;
}

function montarCarga(w: Widget, dados: DadosQuadro[], ctx: Ctx, filtros: FiltroWidget[], intervalo: Intervalo | null, r: Resultado) {
  const buckets = bucketsCarga(w, ctx.hoje ?? hojeISO(), intervalo);
  const linhas = new Map<string, LinhaCarga>();
  const usaValor = w.calculo === 'soma' && !!w.valor;
  for (const d of dados) {
    faltaColuna(r, d, [w.eixo, w.data, usaValor ? w.valor : null, ...filtros.map(f => f.coluna)]);
    const colValor = usaValor ? d.colunas.find(c => c.titulo === w.valor) : undefined;
    if (colValor?.config.unidade && !r.unidade) r.unidade = colValor.config.unidade;
    for (const item of d.itens) {
      if (!passa(d, item, filtros, ctx)) continue;
      if (w.ocultarConcluidos !== false && itemConcluido(item, d.colunas)) continue;
      const it = w.data ? intervaloDoItem(d, item, w.data) : null;
      if (!it || !buckets.some(b => sobrepoe(it, b))) continue;
      const pessoas = categorias(d, item, w.eixo ?? '', ctx) ?? [];
      if (!pessoas.length) { r.semEixo++; continue; }
      const v = usaValor ? numero(d, item, w.valor!, ctx) ?? 0 : 1;
      r.n++;
      for (const p of pessoas) {
        let l = linhas.get(p.chave);
        if (!l) { l = { chave: p.chave, rotulo: p.rotulo, celulas: buckets.map(() => 0), total: 0 }; linhas.set(p.chave, l); }
        const linha = l;
        buckets.forEach((b, i) => { if (sobrepoe(it, b)) { linha.celulas[i] += v; linha.total += v; } });
      }
    }
  }
  const lista = [...linhas.values()].sort((a, b) => b.total - a.total);
  r.carga = { buckets, linhas: lista, max: Math.max(0, ...lista.flatMap(l => l.celulas)) };
}

export function calcularWidget(w: Widget, dados: DadosQuadro[], ctx: Ctx, geral?: FiltroGeral): Resultado {
  const { filtros, janela, intervalo } = escopo(w, geral, ctx);
  if (w.tipo === 'texto') return resultadoVazio();
  if (w.tipo === 'matriz' || w.tipo === 'lista') {
    const r = resultadoVazio(intervalo);
    montarTabela(w, dados, ctx, filtros, janela, intervalo, r);
    return r;
  }
  if (w.tipo === 'carga') {
    const r = resultadoVazio(intervalo);
    montarCarga(w, dados, ctx, filtros, intervalo, r);
    return r;
  }
  const r = nucleo(w, dados, ctx, filtros, janela, intervalo);
  if (w.tipo === 'bateria') aplicarBateria(w, r);
  if (w.tipo === 'funil') aplicarFunil(w, r, dados, ctx);
  if (w.tipo === 'numero') {
    if (w.comparar && janela && intervalo) {
      const ant = intervaloAnterior(intervalo, w.comparar);
      const anterior = nucleo(w, dados, ctx, filtros, janela, ant).valor;
      const curto: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: '2-digit' };
      r.comparacao = { anterior, variacao: anterior ? ((r.valor - anterior) / Math.abs(anterior)) * 100 : null, rotulo: `${fmtData(ant.de, curto)} a ${fmtData(ant.ate, curto)}` };
    }
    if (w.tendencia && janela) {
      const fim = inicioDoMes(intervalo && intervalo.ate !== '9999-12-31' ? intervalo.ate : ctx.hoje ?? hojeISO());
      r.serie = Array.from({ length: 6 }, (_, i) => {
        const de = addMeses(fim, i - 5);
        return { chave: de.slice(0, 7), rotulo: nomeMes(de.slice(0, 7)), valor: nucleo(w, dados, ctx, filtros, janela, { de, ate: fimDoMes(de) }).valor };
      });
    }
  }
  return r;
}

// Itens por trás de uma fatia, barra ou célula (clique no gráfico).
export type ItemVisto = { id: number; quadroId: number; nome: string; quadro: string; grupo: string; valor?: string };
export function itensDoWidget(w: Widget, dados: DadosQuadro[], ctx: Ctx, geral: FiltroGeral | undefined, sel: { chave?: string; pilha?: string; bucket?: Intervalo }): ItemVisto[] {
  const { filtros, janela, intervalo } = escopo(w, geral, ctx);
  const periodo = w.periodo ?? 'mes';
  const out: ItemVisto[] = [];
  const usaValor = w.calculo !== 'contagem' && !!w.valor;
  for (const d of dados) {
    const colValor = usaValor ? d.colunas.find(c => c.titulo === w.valor) : undefined;
    for (const item of d.itens) {
      if (!passa(d, item, filtros, ctx)) continue;
      if (w.tipo === 'carga') {
        if (w.ocultarConcluidos !== false && itemConcluido(item, d.colunas)) continue;
        const it = w.data ? intervaloDoItem(d, item, w.data) : null;
        if (!it || (sel.bucket && !sobrepoe(it, sel.bucket))) continue;
        if (sel.chave != null && !(categorias(d, item, w.eixo ?? '', ctx) ?? []).some(c => c.chave === sel.chave)) continue;
      } else {
        if (!dentro(d, item, janela, intervalo)) continue;
        if (sel.chave != null && w.eixo) {
          const cats = categorias(d, item, w.eixo, ctx, periodo) ?? [];
          if (sel.chave === SEM_VALOR ? cats.length > 0 : !cats.some(c => c.chave === sel.chave)) continue;
        }
        if (sel.pilha != null && w.pilha && !(categorias(d, item, w.pilha, ctx, periodo) ?? []).some(c => c.chave === sel.pilha)) continue;
      }
      const g = d.grupos.find(x => x.id === item.grupo_id);
      const v = colValor ? item.valores[colValor.id] : undefined;
      out.push({ id: item.id, quadroId: Number(d.quadro.id), nome: item.nome, quadro: String(d.quadro.nome), grupo: g?.nome ?? '', valor: colValor?.tipo === 'numero' && !vazio(v) ? fmtNumero(v, colValor.config.unidade) : undefined });
    }
  }
  return out.sort((a, b) => COMPARADOR.compare(a.nome, b.nome));
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
