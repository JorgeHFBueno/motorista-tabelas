import { createDrawing, PAGE, pdfFromPages } from '../../services/vehicle-report-pdf';
import type { MondaySerpSnapshot } from '../../services/monday-serp.service';
import {
  contratoTexto,
  dataCivilTexto,
  dataTexto,
  localPendente,
  type ObraDetalhe,
  type PeriodoMestre,
  type ResumoCombustivel,
  type VeiculoNaObra,
} from './obrasDomain';

/** Cada parte do relatório vem de uma fonte; uma fonte que falhou aparece como indisponível, nunca como zero. */
export type Parte<T> = { status: 'ok'; data: T } | { status: 'erro' };
export type MedicoesObra = { snapshot: MondaySerpSnapshot | null; atualizadoAgora: boolean };

export type RelatorioObra = {
  obra: ObraDetalhe;
  medicoes: Parte<MedicoesObra>;
  mestres: Parte<PeriodoMestre[]>;
  veiculos: Parte<VeiculoNaObra[]>;
  combustivel: Parte<ResumoCombustivel>;
  geradoEm: Date;
};

const dinheiro = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).replace(/\s/gu, ' ');
const litros = (value: number) => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} L`;
const ou = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '—' : String(value));

export function nomeArquivoRelatorioObra(obra: Pick<ObraDetalhe, 'nomeObra'>, geradoEm: Date) {
  const nome = obra.nomeObra.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dia = geradoEm.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `Relatorio-Obra-${nome || 'obra'}-${dia}.pdf`;
}

export function createObraRelatorioPdf(relatorio: RelatorioObra) {
  const { obra } = relatorio;
  const drawing = createDrawing();
  const direita = (indices: number[]) => new Set(indices);
  const indisponivel = (motivo: string) => { drawing.text(PAGE.left, drawing.y, motivo, 8); drawing.y -= 16; };
  const vazio = (texto: string) => { drawing.text(PAGE.left, drawing.y, texto, 8); drawing.y -= 16; };

  drawing.title('RELATÓRIO DA OBRA');
  drawing.text(PAGE.left, drawing.y, obra.nomeObra, 10, true); drawing.y -= 13;
  drawing.text(PAGE.left, drawing.y, `Gerado em: ${relatorio.geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 8); drawing.y -= 18;

  drawing.section('DADOS DA OBRA');
  drawing.table(['Campo', 'Valor'], [
    ['Nome', obra.nomeObra],
    ['Local', localPendente(obra.local) ? `${ou(obra.local)} (a corrigir)` : obra.local],
    ['Contrato', ou(contratoTexto(obra))],
    ['Ano', ou(obra.ano)],
    ['Empresa', ou(obra.empresa)],
    ['Tipo de obra', ou(obra.tipoObra)],
    ['Situação (Friday)', ou(obra.situacao)],
    ['Status no sistema', ou(obra.status)],
    ['Início do contrato', dataCivilTexto(obra.dataInicial)],
    ['Fim do contrato', dataCivilTexto(obra.dataFinal)],
    ['Ordem de início', ou(obra.ordemInicio)],
    ['Confirmação de recurso', ou(obra.confirmacaoRecurso)],
    ['Subcentro ERP', ou(obra.subcentroErp)],
    ['Sigla / código', `${ou(obra.siglaObra)} / ${ou(obra.codObra)}`],
  ], [170, 353]);
  if (obra.lotes.length) drawing.table(['LOTE', 'Status'], obra.lotes.map((lote) => [lote.nome, ou(lote.status)]), [353, 170]);
  else vazio('Sem LOTEs cadastrados.');

  drawing.section('SALDO DO CONTRATO / MEDIÇÕES');
  if (!obra.subcentroErp) vazio('Não há Subcentro ERP vinculado: as medições não podem ser consultadas.');
  else if (relatorio.medicoes.status === 'erro') indisponivel('Não foi possível consultar as medições.');
  else {
    const { snapshot, atualizadoAgora } = relatorio.medicoes.data;
    drawing.table(['Item', 'Valor'], [
      ['Medições (valor bruto dos serviços)', snapshot ? dinheiro(snapshot.valor_bruto_servico) : 'Sem medições'],
      ['Notas de medição', snapshot ? String(snapshot.qtd_notas) : '—'],
      ['Total do contrato', 'Não informado no sistema'],
      ['Saldo do contrato', 'Não informado no sistema'],
      ['Origem', atualizadoAgora ? 'ERP (Query 55), consultado na geração' : 'Última cópia salva do ERP (a consulta de agora falhou)'],
    ], [253, 270], direita([1]));
  }

  drawing.section('MESTRES ALOCADOS');
  if (relatorio.mestres.status === 'erro') indisponivel('Não foi possível carregar as alocações do CronoObra.');
  else if (!relatorio.mestres.data.length) vazio('Nenhum mestre alocado no CronoObra.');
  else drawing.table(['Mestre', 'LOTE', 'Início', 'Fim', 'Dias'], relatorio.mestres.data.map((item) => [item.mestre, item.lote, dataCivilTexto(item.inicio), dataCivilTexto(item.fim), item.dias]), [110, 203, 75, 75, 60], direita([4]));

  drawing.section('VEÍCULOS QUE FORAM PARA A OBRA');
  if (relatorio.veiculos.status === 'erro') indisponivel('Não foi possível carregar as atividades.');
  else if (!relatorio.veiculos.data.length) vazio('Nenhuma atividade registrada para esta obra.');
  else drawing.table(['Veículo', 'Atividades', 'Primeira', 'Última', 'Motoristas'], relatorio.veiculos.data.map((item) => [[item.placa, item.nome].filter(Boolean).join(' — '), item.atividades, dataTexto(item.primeira), dataTexto(item.ultima), item.motoristas.join(', ')]), [150, 55, 62, 62, 194], direita([1]));

  drawing.section('COMBUSTÍVEL');
  if (relatorio.combustivel.status === 'erro') indisponivel('Não foi possível carregar o combustível.');
  else if (!relatorio.combustivel.data.abastecimentos) vazio('Nenhum abastecimento registrado para esta obra.');
  else {
    const resumo = relatorio.combustivel.data;
    drawing.table(['Veículo', 'Abastecimentos', 'Litros', 'Valor'], [
      ...resumo.porVeiculo.map((item) => [item.veiculo, item.abastecimentos, litros(item.litros), dinheiro(item.valor)]),
      ['Total', resumo.abastecimentos, litros(resumo.litros), dinheiro(resumo.valor)],
    ], [203, 90, 110, 120], direita([1, 2, 3]), new Set([resumo.porVeiculo.length]));
    drawing.table(['Data', 'Veículo', 'Litros', 'Valor', 'Para quem'], resumo.itens.map((item) => [dataTexto(item.data), item.veiculo, litros(item.litros), dinheiro(item.valor), ou(item.paraQuem)]), [65, 120, 70, 85, 183], direita([2, 3]));
  }

  return pdfFromPages(drawing.pages, 'Ledur Motorista — relatório da obra');
}
