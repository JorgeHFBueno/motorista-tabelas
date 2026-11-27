import { hoje } from '../estoques/estoquesExemplo';
import type { FiltroRel, LinhaRel, RelatorioDef, Valores } from '../estoques/relatoriosEstoque';
import { PESSOAS_EXEMPLO, UFS } from '../pessoas/pessoasExemplo';
import {
  abreviatura, AVISO_TITULOS, BANCOS, CENTROS_CUSTO, PLANOS_TITULOS, SITUACOES_TITULO, TITULOS_EXEMPLO, type TituloExemplo,
} from './titulosExemplo';
import { CONTAS_BANCO, PROJECOES_EXEMPLO, saldoDaConta } from './fluxoExemplo';

// Relatórios de Contas a Pagar/Receber do ERP (2026-11-27): as definições do ERP do Samuel (server/src/erp/relatorios/
// financeiro.ts: contas_pagar_receber e baixas_periodo, tela FN_Relatorios do Elevor, e fluxo_caixa, RL_FluxoCaixa, desde 2026-11-27) com os mesmos filtros e colunas, na
// tela de relatório do ERP (ErpRelatorioEstoquePage.tsx). A conta, que lá é SQL, aqui roda sobre os títulos de exemplo
// (titulosExemplo.ts). The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const r2 = (v: number) => Math.round(v * 100) / 100;
const ops = (...pares: Array<[string, string]>) => pares.map(([valor, rotulo]) => ({ valor, rotulo }));
const lista = (itens: string[]) => itens.map((i) => ({ valor: i, rotulo: i }));
const PESSOAS = [...new Set(TITULOS_EXEMPLO.map((t) => t.pessoa))].sort();
const pessoaDe = (nome: string) => PESSOAS_EXEMPLO.find((p) => p.nome === nome);
const CIDADES = [...new Set(PESSOAS_EXEMPLO.map((p) => p.cidade && `${p.cidade} - ${p.uf}`).filter(Boolean))].sort();
const EMPRESA: FiltroRel = { nome: 'empresa', rotulo: 'Empresa', tipo: 'empresa', largura: 448 };
const numero = (v: string | undefined) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);
const dataBr = (d: string) => d.split('-').reverse().join('/');
const so = (...analises: string[]) => (f: Valores) => analises.includes(f.analise);

/** Saldo do título na data da posição (vazio = hoje): o valor menos as baixas até lá. */
const saldoNa = (t: TituloExemplo, posicao: string) =>
  !posicao ? t.saldo : r2(t.valor - t.baixas.filter((b) => b.data <= posicao).reduce((s, b) => s + b.valor, 0));

/** Os títulos do relatório, com o saldo na posição e a correção (juros, multa e descontos) até a "Data Base (Juros)". */
function titulosCorrigidos(f: Valores) {
  const base = f.baseJuros || hoje();
  const [taxa, multa, antec, pont] = [numero(f.taxa), numero(f.multa), numero(f.descAntec), numero(f.descPont)];
  const campo = (t: TituloExemplo) => (f.periodo === 'emissao' ? t.emissao : f.periodo === 'programacao' ? t.programacao || t.vencimento : t.vencimento);
  const noPeriodo = (t: TituloExemplo) => (f.periodo === 'baixa'
    ? t.baixas.some((b) => (!f.de || b.data >= f.de) && (!f.ate || b.data <= f.ate))
    : (!f.de || campo(t) >= f.de) && (!f.ate || campo(t) <= f.ate));
  return TITULOS_EXEMPLO.filter((t) => !t.cancelado && (!f.empresa || t.empresa === Number(f.empresa)) && (f.tipo === 'A' || t.tipo === f.tipo)
    && noPeriodo(t) && (!f.pessoa || t.pessoa === f.pessoa) && (!f.uf || pessoaDe(t.pessoa)?.uf === f.uf)
    && (!f.cidade || `${pessoaDe(t.pessoa)?.cidade} - ${pessoaDe(t.pessoa)?.uf}` === f.cidade)
    && (!f.situacao || t.situacao === f.situacao) && (!f.banco || t.banco === f.banco)
    && (!f.numero?.trim() || t.numero.toLowerCase().includes(f.numero.trim().toLowerCase()))
    && (!f.plano || t.rateio.some((r) => r.plano.startsWith(f.plano.split(' - ')[0]))) && (!f.centro || t.rateio.some((r) => r.centro === f.centro))
    && (!f.basePosicao || t.emissao <= f.basePosicao))
    .map((t) => {
      const saldo = saldoNa(t, f.basePosicao);
      const atraso = Math.max(dias(t.vencimento, base), 0);
      const antecipa = Math.max(dias(base, t.vencimento), 0);
      const juros = r2(saldo * taxa / 100 / 30 * atraso);
      const multaV = base > t.vencimento ? r2(saldo * multa / 100) : 0;
      const descontos = r2(saldo * antec / 100 / 30 * antecipa) + (base <= t.vencimento ? r2(saldo * pont / 100) : 0);
      return { t, saldo, dias: atraso, juros, multa: multaV, descontos, corrigido: r2(saldo + juros + multaV - descontos), base };
    })
    .filter((x) => f.titulos !== 'abertos' || x.saldo > 0);
}

type Corrigido = ReturnType<typeof titulosCorrigidos>[number];
const somar = (itens: Corrigido[]) => ({
  qtde: itens.length, valor: r2(itens.reduce((s, x) => s + x.t.valor, 0)), saldo: r2(itens.reduce((s, x) => s + x.saldo, 0)),
  juros: r2(itens.reduce((s, x) => s + x.juros, 0)), multa: r2(itens.reduce((s, x) => s + x.multa, 0)),
  descontos: r2(itens.reduce((s, x) => s + x.descontos, 0)), corrigido: r2(itens.reduce((s, x) => s + x.corrigido, 0)),
});
function agrupar(itens: Corrigido[], chave: (x: Corrigido) => string) {
  const mapa = new Map<string, Corrigido[]>();
  for (const x of itens) mapa.set(chave(x), [...(mapa.get(chave(x)) ?? []), x]);
  return [...mapa.entries()];
}

export const RELATORIOS_FINANCEIRO: RelatorioDef[] = [
  {
    id: 'contas-pagar-receber', titulo: 'Relatórios de Contas a Pagar/Receber', elevor: 'FN_Relatorios', aviso: AVISO_TITULOS,
    ajuda: 'Como o relatório do Elevor: escolha a data do período (vencimento, emissão, baixa ou programação) e a análise. Com "Data Base (Posição)" o saldo é o que estava em aberto naquela data. Taxa (% ao mês), Multa, Desc Antec. (% ao mês) e Desc Pont. (%) calculam o valor corrigido até a "Data Base (Juros)".',
    filtros: [
      EMPRESA,
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', padrao: 'P', obrigatorio: true, opcoes: ops(['P', 'Pagar'], ['R', 'Receber'], ['A', 'Ambos']) },
      { nome: 'periodo', rotulo: 'Período', tipo: 'opcoes', padrao: 'vencimento', obrigatorio: true, largura: 167, par: 'de',
        opcoes: ops(['vencimento', 'Vencidas Em:'], ['emissao', 'Emitidas Em:'], ['baixa', 'Baixadas Em:'], ['programacao', 'Programadas Em:']) },
      { nome: 'de', rotulo: '', tipo: 'data', padrao: 'inicio_mes', par: 'ate' },
      { nome: 'ate', rotulo: 'a', tipo: 'data', padrao: 'fim_mes' },
      { nome: 'analise', rotulo: 'Análise', tipo: 'opcoes', padrao: 'cliente', obrigatorio: true, radio: true,
        opcoes: ops(['cliente', 'Cliente'], ['vencimento', 'Vencimento'], ['emissao', 'Emissão'], ['sintetica', 'Sintética'], ['mensal', 'Valor Mensal'], ['totais', 'Totalizadores e Resumos']) },
      { nome: 'titulos', rotulo: 'Títulos', tipo: 'opcoes', padrao: 'abertos', obrigatorio: true, opcoes: ops(['geral', 'Geral'], ['abertos', 'Abertos']) },
      { nome: 'pessoa', rotulo: 'Cliente', tipo: 'opcoes', opcoes: lista(PESSOAS), largura: 448 },
      { nome: 'uf', rotulo: 'Estado - Cidade', tipo: 'opcoes', opcoes: lista(UFS), largura: 72, par: 'cidade' },
      { nome: 'cidade', rotulo: '', tipo: 'opcoes', opcoes: lista(CIDADES), largura: 368 },
      { nome: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: lista(SITUACOES_TITULO), largura: 448 },
      { nome: 'banco', rotulo: 'Banco', tipo: 'opcoes', opcoes: lista(BANCOS), largura: 298 },
      { nome: 'taxa', rotulo: 'Taxa', tipo: 'texto', largura: 70, par: 'multa' },
      { nome: 'multa', rotulo: 'Multa:', tipo: 'texto', largura: 70, par: 'descAntec' },
      { nome: 'descAntec', rotulo: 'Desc Antec.:', tipo: 'texto', largura: 70, par: 'descPont' },
      { nome: 'descPont', rotulo: 'Desc Pont.:', tipo: 'texto', largura: 70 },
      { nome: 'baseJuros', rotulo: 'Data Base (Juros)', tipo: 'data', padrao: 'hoje', par: 'basePosicao' },
      { nome: 'basePosicao', rotulo: 'Data Base (Posição):', tipo: 'data' },
      { nome: 'plano', rotulo: 'Plano de contas', tipo: 'opcoes', opcoes: lista(PLANOS_TITULOS), largura: 448, mais: true },
      { nome: 'centro', rotulo: 'Centro de custo', tipo: 'opcoes', opcoes: lista(CENTROS_CUSTO), largura: 348, mais: true },
      { nome: 'numero', rotulo: 'Número', tipo: 'texto', largura: 85, mais: true },
    ],
    quebra: (f) => (['cliente', 'vencimento', 'emissao'].includes(f.analise) ? 'grupo' : undefined),
    colunas: [
      { nome: 'pessoa', rotulo: 'Cliente/Fornecedor', soSe: so('vencimento', 'emissao', 'sintetica') },
      { nome: 'mes', rotulo: 'Mês', soSe: so('mensal') },
      { nome: 'tipoTitulo', rotulo: 'Tipo', soSe: so('totais') },
      { nome: 'resumo', rotulo: 'Situação', soSe: so('totais') },
      { nome: 'titulo', rotulo: 'Título', link: (l) => `/erp/titulos/${l.id}`, soSe: so('cliente', 'vencimento', 'emissao') },
      { nome: 'empresa', rotulo: 'Emp.', soSe: so('cliente', 'vencimento', 'emissao') },
      { nome: 'tipoDoc', rotulo: 'Doc.', soSe: so('cliente', 'vencimento', 'emissao') },
      { nome: 'emissao', rotulo: 'Emissão', tipo: 'data', soSe: so('cliente', 'vencimento') },
      { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'data', soSe: so('cliente', 'emissao') },
      { nome: 'dias', rotulo: 'Dias', tipo: 'inteiro', soSe: so('cliente', 'vencimento', 'emissao') },
      { nome: 'qtde', rotulo: 'Qtde', tipo: 'inteiro', total: true, soSe: so('sintetica', 'mensal', 'totais') },
      { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', total: true },
      { nome: 'saldo', rotulo: 'Saldo', tipo: 'moeda', total: true },
      { nome: 'juros', rotulo: 'Juros', tipo: 'moeda', total: true },
      { nome: 'multa', rotulo: 'Multa', tipo: 'moeda', total: true },
      { nome: 'descontos', rotulo: 'Descontos', tipo: 'moeda', total: true },
      { nome: 'corrigido', rotulo: 'Total Corrigido', tipo: 'moeda', total: true },
    ],
    gerar: (f) => {
      const itens = titulosCorrigidos(f);
      switch (f.analise) {
        case 'sintetica':
          return agrupar([...itens].sort((a, b) => a.t.pessoa.localeCompare(b.t.pessoa)), (x) => x.t.pessoa).map(([pessoa, g]) => ({ pessoa, ...somar(g) }));
        case 'mensal':
          return agrupar([...itens].sort((a, b) => a.t.vencimento.localeCompare(b.t.vencimento)), (x) => `${x.t.vencimento.slice(5, 7)}/${x.t.vencimento.slice(0, 4)}`)
            .map(([mes, g]) => ({ mes, ...somar(g) }));
        case 'totais': {
          const resumo = (x: Corrigido) => (x.saldo <= 0 ? 'Baixados' : x.t.vencimento < x.base ? 'Vencidos' : 'A vencer');
          const chave = (x: Corrigido) => `${x.t.tipo === 'R' ? 'Receber' : 'Pagar'}|${resumo(x)}`;
          return agrupar(itens, chave).sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => {
            const [tipoTitulo, situacao] = k.split('|');
            return { tipoTitulo, resumo: situacao, ...somar(g) };
          });
        }
        default: {
          const ordem = (x: Corrigido) => (f.analise === 'vencimento' ? `${x.t.vencimento}|${x.t.pessoa}` : f.analise === 'emissao' ? `${x.t.emissao}|${x.t.pessoa}` : `${x.t.pessoa}|${x.t.vencimento}`);
          return [...itens].sort((a, b) => ordem(a).localeCompare(ordem(b)) || a.t.numero.localeCompare(b.t.numero)).map((x): LinhaRel => ({
            grupo: f.analise === 'vencimento' ? dataBr(x.t.vencimento) : f.analise === 'emissao' ? dataBr(x.t.emissao) : x.t.pessoa,
            id: x.t.id, pessoa: x.t.pessoa, titulo: `${x.t.numero}/${x.t.sequencia}`, empresa: x.t.empresa === 1 ? 'LEDUR' : 'ARTEBASE',
            tipoDoc: abreviatura(x.t.tipoDocumento), emissao: x.t.emissao, vencimento: x.t.vencimento, dias: x.dias,
            valor: x.t.valor, saldo: x.saldo, juros: x.juros, multa: x.multa, descontos: x.descontos, corrigido: x.corrigido,
          }));
        }
      }
    },
  },
  {
    id: 'pagamentos-recebimentos', titulo: 'Pagamentos e Recebimentos do Período', elevor: 'FN_Relatorios (Baixadas Em)', aviso: AVISO_TITULOS,
    ajuda: 'As baixas (pagamentos e recebimentos) do período, pela data do recibo, com o principal, juros, multa, desconto e o valor pago ou recebido, agrupadas por conta, cliente/fornecedor ou dia.',
    filtros: [
      EMPRESA,
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', padrao: 'P', opcoes: ops(['P', 'Pagar'], ['R', 'Receber']) },
      { nome: 'de', rotulo: 'Baixa', tipo: 'data', padrao: 'inicio_mes', par: 'ate' },
      { nome: 'ate', rotulo: 'a', tipo: 'data', padrao: 'fim_mes' },
      { nome: 'conta', rotulo: 'Bancos/Caixa', tipo: 'opcoes', opcoes: lista(BANCOS), largura: 298 },
      { nome: 'pessoa', rotulo: 'Cliente/Fornecedor', tipo: 'opcoes', opcoes: lista(PESSOAS), largura: 448 },
      { nome: 'quebra', rotulo: 'Quebra por', tipo: 'opcoes', padrao: 'conta', obrigatorio: true, opcoes: ops(['conta', 'Conta'], ['pessoa', 'Cliente/Fornecedor'], ['dia', 'Dia']) },
    ],
    quebra: 'grupo',
    colunas: [
      { nome: 'data', rotulo: 'Data', tipo: 'data' }, { nome: 'recibo', rotulo: 'Recibo', tipo: 'inteiro' }, { nome: 'pessoa', rotulo: 'Cliente/Fornecedor' },
      { nome: 'titulo', rotulo: 'Título', link: (l) => `/erp/titulos/${l.tituloId}` }, { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'data' },
      { nome: 'valor', rotulo: 'Principal', tipo: 'moeda', total: true }, { nome: 'juros', rotulo: 'Juros', tipo: 'moeda', total: true },
      { nome: 'multa', rotulo: 'Multa', tipo: 'moeda', total: true }, { nome: 'desconto', rotulo: 'Desconto', tipo: 'moeda', total: true },
      { nome: 'pago', rotulo: 'Pago/Recebido', tipo: 'moeda', total: true },
    ],
    gerar: (f) => {
      const linhas = TITULOS_EXEMPLO.filter((t) => (!f.empresa || t.empresa === Number(f.empresa)) && (!f.tipo || t.tipo === f.tipo) && (!f.pessoa || t.pessoa === f.pessoa))
        .flatMap((t) => t.baixas.filter((b) => (!f.de || b.data >= f.de) && (!f.ate || b.data <= f.ate) && (!f.conta || b.conta === f.conta)).map((b) => ({ t, b })));
      const grupo = ({ t, b }: (typeof linhas)[number]) => (f.quebra === 'pessoa' ? t.pessoa : f.quebra === 'dia' ? dataBr(b.data) : b.conta);
      return linhas.sort((a, b) => grupo(a).localeCompare(grupo(b)) || a.b.data.localeCompare(b.b.data) || a.b.recibo - b.b.recibo).map((x) => ({
        grupo: grupo(x), data: x.b.data, recibo: x.b.recibo, pessoa: x.t.pessoa, tituloId: x.t.id, titulo: `${x.t.numero}/${x.t.sequencia}`,
        vencimento: x.t.vencimento, valor: x.b.valor, juros: x.b.juros, multa: x.b.multa, desconto: x.b.desconto,
        pago: r2(x.b.valor + x.b.juros + x.b.multa - x.b.desconto),
      }));
    },
  },
];

// ---------------- Fluxo de Caixa ----------------

const maisDiasUtc = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Início do período do dia (dia, semana de segunda, quinzena 1–15/16–fim ou mês) e o rótulo dele. */
function periodo(dia: string, agrupar: string): { chave: string; rotulo: string } {
  if (agrupar === 'mes') return { chave: `${dia.slice(0, 7)}-01`, rotulo: `${dia.slice(5, 7)}/${dia.slice(0, 4)}` };
  if (agrupar === 'quinzena') {
    const segunda = Number(dia.slice(8, 10)) > 15;
    return { chave: `${dia.slice(0, 7)}-${segunda ? '16' : '01'}`, rotulo: `${segunda ? '2ª' : '1ª'} quinzena ${dia.slice(5, 7)}/${dia.slice(0, 4)}` };
  }
  if (agrupar === 'semana') {
    const semana = new Date(Date.parse(`${dia}T12:00:00Z`)).getUTCDay();
    const inicio = maisDiasUtc(dia, -((semana + 6) % 7));
    return { chave: inicio, rotulo: `Semana de ${inicio.slice(8, 10)}/${inicio.slice(5, 7)}` };
  }
  return { chave: dia, rotulo: dataBr(dia) };
}

/** Linhas do Fluxo de Caixa: saldo nos bancos na véspera, atrasados e cada período, com o saldo acumulado. */
export function fluxoDeCaixa(f: Valores): LinhaRel[] {
  const de = f.de || hoje();
  const ate = f.ate || maisDiasUtc(de, 30);
  const agrupar = f.agrupar || 'dia';
  const contas = CONTAS_BANCO.filter((c) => !f.empresa || c.empresa === Number(f.empresa));
  const saldoInicial = r2(contas.reduce((s, c) => s + saldoDaConta(c.conta, de), 0));
  type Soma = { rec: number; pag: number; pr: number; pp: number };
  const grupos = new Map<string, Soma & { rotulo: string }>();
  const somar = (dia: string, v: Partial<Soma>) => {
    const atrasado = dia < de;
    const p = atrasado ? { chave: '', rotulo: `Atrasados (antes de ${de.slice(8, 10)}/${de.slice(5, 7)})` } : periodo(dia, agrupar);
    const g = grupos.get(p.chave) ?? { rotulo: p.rotulo, rec: 0, pag: 0, pr: 0, pp: 0 };
    grupos.set(p.chave, { ...g, rec: g.rec + (v.rec ?? 0), pag: g.pag + (v.pag ?? 0), pr: g.pr + (v.pr ?? 0), pp: g.pp + (v.pp ?? 0) });
  };
  for (const t of TITULOS_EXEMPLO) {
    const dia = t.programacao || t.vencimento;
    if (t.cancelado || t.saldo <= 0 || dia > ate || (f.empresa && t.empresa !== Number(f.empresa))) continue;
    somar(dia, t.tipo === 'R' ? { rec: t.saldo } : { pag: t.saldo });
  }
  if (f.projecoes === 'true') {
    for (const x of PROJECOES_EXEMPLO) {
      if (x.efetivada || x.vencimento > ate || (f.empresa && x.empresa !== Number(f.empresa))) continue;
      somar(x.vencimento, x.tipo === 'R' ? { pr: x.valor } : { pp: x.valor });
    }
  }
  // Projeção Pagamentos/Recebimentos: o valor estimado entra em todos os períodos do intervalo.
  const fixoPag = numero(f.projPag?.replace(/\./g, ''));
  const fixoRec = numero(f.projRec?.replace(/\./g, ''));
  if (fixoPag || fixoRec) {
    const vistos = new Set<string>();
    for (let d = de; d <= ate; d = maisDiasUtc(d, 1)) {
      const p = periodo(d, agrupar);
      if (vistos.has(p.chave)) continue;
      vistos.add(p.chave);
      somar(d, { pp: fixoPag, pr: fixoRec });
    }
  }
  const linhas: LinhaRel[] = [];
  if (f.resumoBancos === 'true') {
    for (const c of contas) linhas.push({ periodo: c.conta, recebimentos: null, pagamentos: null, projReceber: null, projPagar: null, saldoPeriodo: null, saldoAcumulado: saldoDaConta(c.conta, de) });
  }
  linhas.push({ periodo: `Saldo nos bancos até ${dataBr(maisDiasUtc(de, -1))}`, recebimentos: null, pagamentos: null, projReceber: null, projPagar: null, saldoPeriodo: null, saldoAcumulado: saldoInicial });
  let acumulado = saldoInicial;
  for (const [, g] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const saldo = r2(g.rec + g.pr - g.pag - g.pp);
    acumulado = r2(acumulado + saldo);
    linhas.push({ periodo: g.rotulo, recebimentos: r2(g.rec), pagamentos: r2(g.pag), projReceber: r2(g.pr), projPagar: r2(g.pp), saldoPeriodo: saldo, saldoAcumulado: acumulado });
  }
  return linhas;
}

RELATORIOS_FINANCEIRO.push({
  id: 'fluxo-caixa', titulo: 'Relatório de Fluxo de Caixa', elevor: 'RL_FluxoCaixa', aviso: AVISO_TITULOS,
  ajuda: 'Saldo de hoje nos bancos + o que falta receber − o que falta pagar, pela data de programação ou vencimento. Atrasados entram na primeira linha. Projeção Pagamentos/Recebimentos: valor estimado somado em cada período. As projeções cadastradas (Projeções Fluxo de Caixa) entram nas colunas de projeção.',
  filtros: [
    EMPRESA,
    { nome: 'de', rotulo: 'Período', tipo: 'data', padrao: 'hoje', par: 'ate' },
    { nome: 'ate', rotulo: 'a', tipo: 'data', padrao: 'mais_30' },
    { nome: 'agrupar', rotulo: 'Tipo Período', tipo: 'opcoes', padrao: 'dia', obrigatorio: true, opcoes: ops(['dia', 'Diário'], ['semana', 'Semanal'], ['quinzena', 'Quinzenal'], ['mes', 'Mensal']) },
    { nome: 'resumoBancos', rotulo: 'Resumo Bancos', tipo: 'caixa' },
    { nome: 'projPag', rotulo: 'Projeção Pagamentos', tipo: 'texto', largura: 100 },
    { nome: 'projRec', rotulo: 'Projeção Recebimentos', tipo: 'texto', largura: 100 },
    { nome: 'projecoes', rotulo: 'Incluir as projeções cadastradas', tipo: 'caixa', padrao: 'true', mais: true },
  ],
  colunas: [
    { nome: 'periodo', rotulo: 'Período' }, { nome: 'recebimentos', rotulo: 'A receber', tipo: 'moeda', total: true },
    { nome: 'pagamentos', rotulo: 'A pagar', tipo: 'moeda', total: true }, { nome: 'projReceber', rotulo: 'Projeção receber', tipo: 'moeda', total: true },
    { nome: 'projPagar', rotulo: 'Projeção pagar', tipo: 'moeda', total: true }, { nome: 'saldoPeriodo', rotulo: 'Saldo do período', tipo: 'moeda', total: true },
    { nome: 'saldoAcumulado', rotulo: 'Saldo acumulado', tipo: 'moeda' },
  ],
  gerar: fluxoDeCaixa,
});

export const relatorioFinanceiro = (id: string | undefined) => RELATORIOS_FINANCEIRO.find((r) => r.id === id) ?? null;
