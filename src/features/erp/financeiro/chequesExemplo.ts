// Cheques do ERP em demonstração (2026-11-27): os status (CD_ChequesStatus do Elevor: se o status movimenta o banco e se
// liquida o cheque) e os cheques de exemplo (FN_Cheques): recebidos de clientes, em carteira, pré-datados, depositados,
// compensado e devolvido, e um emitido a fornecedor. Bancos e números são fictícios.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const AVISO_CHEQUES = 'Demonstração: os cheques e os status são exemplos e nada é gravado. Os dados reais virão do Elevor.';

export type Acao = 'nao' | 'realiza' | 'desfaz';
export type StatusCheque = { id: number; descricao: string; movimentacao: Acao; liquidacao: Acao; padrao: boolean };
export const STATUS_CHEQUES: StatusCheque[] = [
  { id: 1, descricao: 'EM CARTEIRA', movimentacao: 'nao', liquidacao: 'nao', padrao: true },
  { id: 2, descricao: 'DEPOSITADO', movimentacao: 'realiza', liquidacao: 'nao', padrao: false },
  { id: 3, descricao: 'COMPENSADO', movimentacao: 'nao', liquidacao: 'realiza', padrao: false },
  { id: 4, descricao: 'DEVOLVIDO', movimentacao: 'desfaz', liquidacao: 'desfaz', padrao: false },
  { id: 5, descricao: 'REPASSADO A FORNECEDOR', movimentacao: 'nao', liquidacao: 'realiza', padrao: false },
];
export const ROTULO_MOVIMENTACAO: Record<Acao, string> = { nao: 'Não Realiza Movimentação', realiza: 'Realiza Movimentação', desfaz: 'Desfaz Movimentação' };
export const ROTULO_LIQUIDACAO: Record<Acao, string> = { nao: 'Não Realiza Liquidação', realiza: 'Realiza Liquidação', desfaz: 'Desfaz Liquidação' };
export const statusCheque = (id: number) => STATUS_CHEQUES.find((s) => s.id === id);

export type ChequeExemplo = {
  id: number; tipo: 'E' | 'R'; empresa: number; pessoa: string; codigoBarras: string; numero: string; titular: string; documentoTitular: string;
  banco: string; valor: number; vencimento: string; data: string; observacao: string; status: number;
};
const c = (id: number, tipo: 'E' | 'R', empresa: number, pessoa: string, numero: string, titular: string, documentoTitular: string, banco: string,
  valor: number, vencimento: string, data: string, status: number, observacao = ''): ChequeExemplo => ({
  id, tipo, empresa, pessoa, codigoBarras: '', numero, titular, documentoTitular, banco, valor, vencimento, data, observacao, status,
});
export const CHEQUES_EXEMPLO: ChequeExemplo[] = [
  c(1, 'R', 1, 'Maria Exemplo da Silva', '000851', 'MARIA EXEMPLO DA SILVA', '12345678909', 'BANCO A - AG 0101', 4800, '2026-12-10', '2026-11-10', 1, 'Entrada da compra de pilares (1/2).'),
  c(2, 'R', 1, 'Maria Exemplo da Silva', '000852', 'MARIA EXEMPLO DA SILVA', '12345678909', 'BANCO A - AG 0101', 4800, '2027-01-10', '2026-11-10', 1, 'Entrada da compra de pilares (2/2).'),
  c(3, 'R', 1, 'João Modelo de Souza', '000112', 'JOÃO MODELO DE SOUZA', '11144477735', 'BANCO B - AG 2020', 2350, '2026-11-20', '2026-11-05', 3),
  c(4, 'R', 1, 'Construtora Exemplo Ltda', '004488', 'CONSTRUTORA EXEMPLO LTDA', '12345678000195', 'BANCO C - AG 3030', 9500, '2026-11-15', '2026-10-30', 4,
    'Devolvido pelo motivo 11 (sem fundos). Reapresentar.'),
  c(5, 'R', 1, 'Construtora Exemplo Ltda', '004501', 'CONSTRUTORA EXEMPLO LTDA', '12345678000195', 'BANCO C - AG 3030', 18900, '2026-12-28', '2026-11-18', 1, 'Pré-datado.'),
  c(6, 'R', 2, 'João Modelo de Souza', '000118', 'JOÃO MODELO DE SOUZA', '11144477735', 'BANCO B - AG 2020', 1200, '2026-11-30', '2026-11-20', 2),
  c(7, 'E', 1, 'Areia e Brita Modelo Ltda', '000231', 'LEDUR ENGENHARIA E CONSTRUCOES', '', 'CONTA MOVIMENTO 1', 3200, '2026-12-05', '2026-11-25', 1,
    'Emitido para a compra de brita.'),
];
export const chequeExemplo = (id: string | number | undefined) => CHEQUES_EXEMPLO.find((x) => String(x.id) === String(id)) ?? null;

export type FiltroCheques = { busca: string; tipo: string; status: string; de: string; ate: string };
export const FILTRO_CHEQUES: FiltroCheques = { busca: '', tipo: '', status: '', de: '', ate: '' };
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A Consulta de Cheques: pela pesquisa (número, titular ou banco), tipo, status e vencimento; o vencimento mais novo primeiro. */
export function filtrarCheques(f: FiltroCheques) {
  const busca = semAcento(f.busca.trim());
  return CHEQUES_EXEMPLO.filter((x) => (!busca || [x.numero, x.titular, x.banco].some((v) => semAcento(v).includes(busca)))
    && (!f.tipo || x.tipo === f.tipo) && (!f.status || x.status === Number(f.status)) && (!f.de || x.vencimento >= f.de) && (!f.ate || x.vencimento <= f.ate))
    .sort((a, b) => b.vencimento.localeCompare(a.vencimento) || b.id - a.id);
}
