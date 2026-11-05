import type { Rotulo } from '../quadro/tipos.ts';
import type { DadosQuadro, Widget } from './calculo.ts';

export const novoIdWidget = () => Math.random().toString(36).slice(2, 10);

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
  const rotulos = (re: RegExp) => [...new Set(cols.filter(c => c.titulo === etapa)
    .flatMap(c => (c.config.rotulos ?? []) as Rotulo[]).filter(r => r.texto && re.test(r.texto)).map(r => r.texto))];
  const ganho = rotulos(/ganh|won|conquist|fechad/i);
  const soGanhos = etapa && ganho.length ? [{ coluna: etapa, valores: ganho }] : [];
  const calc = valor ? { calculo: 'soma' as const, valor } : { calculo: 'contagem' as const };

  const w: Omit<Widget, 'id'>[] = [
    { titulo: 'Receita ganha', tipo: 'numero', ...calc, filtros: soGanhos },
    { titulo: 'Valor médio dos negócios ganhos', tipo: 'numero', ...(valor ? { calculo: 'media' as const, valor } : calc), filtros: soGanhos },
    { titulo: 'Total orçado (todas as etapas)', tipo: 'numero', ...calc },
    { titulo: 'Pipeline por etapa', tipo: 'pizza', ...calc, eixo: etapa },
    { titulo: 'Negócios por responsável', tipo: 'barras', calculo: 'contagem', eixo: responsavel, pilha: etapa },
    { titulo: 'Orçado por mês de criação', tipo: 'colunas', ...calc, eixo: criacao, largo: true },
    { titulo: 'Receita ganha por mês de fechamento', tipo: 'colunas', ...calc, eixo: fechamento ?? criacao, filtros: soGanhos, largo: true },
  ];
  return w.filter(x => x.tipo === 'numero' || x.eixo).map(x => ({ ...x, id: novoIdWidget() }));
}
