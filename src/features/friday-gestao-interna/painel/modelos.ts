import type { Rotulo } from '../quadro/tipos.ts';
import type { DadosQuadro, Widget } from './calculo.ts';

export const novoIdWidget = () => Math.random().toString(36).slice(2, 10);

// Ordem natural das etapas de venda: os rótulos do quadro vêm em outra ordem ("Ganho" antes de "Proposta Enviada").
const ORDEM_ETAPAS = [/lead/i, /contato/i, /qualifica/i, /apresenta/i, /projeto/i, /or[cç]amenta/i, /proposta/i, /negocia/i, /licita/i, /ganh|won|conquist|fechad/i];
export function etapasDoFunil(rotulos: string[]): string[] {
  return ORDEM_ETAPAS.flatMap(re => rotulos.filter(r => re.test(r)));
}

// Modelo "Vendas": os indicadores do painel de CRM, montados com as colunas que existirem nos quadros escolhidos.
// Diferente do painel do monday: "ganho" é a etapa (não o grupo do quadro) e a receita por mês usa a data de fechamento.
export function modeloVendas(dados: DadosQuadro[]): Widget[] {
  const cols = dados.flatMap(d => d.colunas);
  const achar = (tipos: string[], re: RegExp) => cols.find(c => tipos.includes(c.tipo) && re.test(c.titulo))?.titulo;
  const etapa = achar(['status'], /etapa|est[aá]gio|fase/i) ?? cols.find(c => c.tipo === 'status')?.titulo;
  const valor = achar(['numero', 'formula'], /valor/i) ?? cols.find(c => c.tipo === 'numero')?.titulo;
  const responsavel = achar(['pessoa'], /respons|vendedor|representante|dono/i) ?? cols.find(c => c.tipo === 'pessoa')?.titulo;
  const criacao = achar(['data'], /cria/i);
  const fechamento = achar(['data'], /fech|conclus|ganho/i);
  const todos = [...new Set(cols.filter(c => c.titulo === etapa).flatMap(c => (c.config.rotulos ?? []) as Rotulo[]).map(r => r.texto).filter(Boolean))];
  const ganho = todos.filter(r => /ganh|won|conquist|fechad/i.test(r));
  const soGanhos = etapa && ganho.length ? [{ coluna: etapa, valores: ganho }] : [];
  const calc = valor ? { calculo: 'soma' as const, valor } : { calculo: 'contagem' as const };
  const etapas = etapasDoFunil(todos);

  const w: Omit<Widget, 'id'>[] = [
    { titulo: 'Receita ganha', tipo: 'numero', ...calc, filtros: soGanhos },
    { titulo: 'Valor médio dos negócios ganhos', tipo: 'numero', ...(valor ? { calculo: 'media' as const, valor } : calc), filtros: soGanhos },
    { titulo: 'Total orçado (todas as etapas)', tipo: 'numero', ...calc },
    etapas.length > 1
      ? { titulo: 'Funil de vendas', tipo: 'funil', calculo: 'contagem', eixo: etapa, etapas }
      : { titulo: 'Pipeline por etapa', tipo: 'pizza', ...calc, eixo: etapa },
    { titulo: 'Negócios por responsável', tipo: 'barras', calculo: 'contagem', eixo: responsavel, pilha: etapa },
    { titulo: 'Orçado por mês de criação', tipo: 'colunas', ...calc, eixo: criacao, largo: true },
    { titulo: 'Receita ganha por mês de fechamento', tipo: 'colunas', ...calc, eixo: fechamento ?? criacao, filtros: soGanhos, largo: true },
  ];
  return w.filter(x => x.tipo === 'numero' || x.eixo).map(x => ({ ...x, id: novoIdWidget() }));
}

// Modelo "Obras": documentos por obra, pendências e o que vence primeiro, com as colunas que existirem.
const DOCUMENTOS = [/^art$/i, /^cno$/i, /^cnd$/i, /^seguro$/i, /termo/i, /ordem de in[ií]cio/i];
export function modeloObras(dados: DadosQuadro[]): Widget[] {
  const cols = dados.flatMap(d => d.colunas);
  const documentos = [...new Set(DOCUMENTOS.flatMap(re => cols.filter(c => ['status', 'lista', 'caixa', 'arquivos'].includes(c.tipo) && re.test(c.titulo.trim())).map(c => c.titulo)))];
  const situacao = cols.find(c => ['status', 'formula'].includes(c.tipo) && /situa/i.test(c.titulo))?.titulo;
  const fim = cols.find(c => c.tipo === 'data' && /^fim$|t[eé]rmino|prazo/i.test(c.titulo.trim()))?.titulo ?? cols.find(c => c.tipo === 'periodo')?.titulo;
  const w: Omit<Widget, 'id'>[] = [];
  if (documentos.length) w.push({ titulo: 'Documentos por obra', tipo: 'matriz', calculo: 'contagem', colunas: documentos, soPendentes: true, largo: true });
  if (fim) w.push({ titulo: 'Próximos vencimentos', tipo: 'lista', calculo: 'contagem', colunas: situacao ? [situacao] : [], dataAlerta: fim, ocultarConcluidos: true, limite: 20, largo: true });
  if (situacao) w.push({ titulo: 'Obras por situação', tipo: 'pizza', calculo: 'contagem', eixo: situacao });
  return w.map(x => ({ ...x, id: novoIdWidget() }));
}
