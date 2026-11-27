import { hoje } from '../estoques/estoquesExemplo';
import { PESSOAS_EXEMPLO } from '../pessoas/pessoasExemplo';
import { MOVIMENTOS_BANCO } from './fluxoExemplo';
import { ehAdiantamento, maisDias, TITULOS_EXEMPLO } from './titulosExemplo';

// Recibos do ERP em demonstração (2026-11-27), como a Consulta de Recibos do ERP do Samuel (FN_Recibos do Elevor): cada
// baixa de título (pagamento, recebimento ou uso de adiantamento) emite um recibo, com o número da baixa; há também dois
// recibos avulsos (Emitir Recibo Avulso: sem título nem banco). O recibo está conciliado quando o lançamento dele no banco
// está. O ERP não cancela recibo (exclui a baixa), por isso todo recibo é Normal.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export type TituloDoRecibo = {
  id: number; numero: string; sequencia: number; parcelas: number; vencimento: string; valor: number; juros: number; multa: number; desconto: number;
};
export type ReciboExemplo = {
  numero: number; avulso: boolean; tipo: 'P' | 'R'; adiantamento: boolean; empresa: number; pessoa: string; pessoaCodigo: number | null; data: string;
  principal: number; juros: number; multa: number; desconto: number; valor: number; usuario: string; criadoEm: string;
  conta: string; historico: string; titulos: TituloDoRecibo[]; conciliado: boolean; referente: string; cidade: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const codigoDe = (nome: string) => PESSOAS_EXEMPLO.find((p) => p.nome === nome)?.codigo ?? null;
/** CPF/CNPJ (só dígitos) e tipo de quem está no cadastro de pessoas de exemplo. */
export const documentoDe = (nome: string) => {
  const p = PESSOAS_EXEMPLO.find((x) => x.nome === nome);
  return p ? { documento: p.documento, cidade: p.cidade } : null;
};

function gerarRecibos(): ReciboExemplo[] {
  const porNumero = new Map<number, ReciboExemplo>();
  for (const t of TITULOS_EXEMPLO) {
    for (const b of t.baixas) {
      const r = porNumero.get(b.recibo) ?? {
        numero: b.recibo, avulso: false, tipo: t.tipo, adiantamento: ehAdiantamento(t), empresa: t.empresa, pessoa: t.pessoa, pessoaCodigo: t.pessoaCodigo,
        data: b.data, principal: 0, juros: 0, multa: 0, desconto: 0, valor: 0, usuario: b.usuario, criadoEm: `${b.data} 10:00`, conta: b.conta,
        historico: `${t.tipo === 'R' ? 'Recebimento' : 'Pagamento'} ${t.numero}/${t.sequencia}`, titulos: [],
        conciliado: MOVIMENTOS_BANCO.some((m) => m.recibo === b.recibo && m.conciliado), referente: '', cidade: '',
      };
      r.titulos.push({ id: t.id, numero: t.numero, sequencia: t.sequencia, parcelas: t.parcelas, vencimento: t.vencimento, valor: b.valor, juros: b.juros, multa: b.multa, desconto: b.desconto });
      r.principal = r2(r.principal + b.valor); r.juros = r2(r.juros + b.juros); r.multa = r2(r.multa + b.multa); r.desconto = r2(r.desconto + b.desconto);
      r.valor = r2(r.principal + r.juros + r.multa - r.desconto);
      porNumero.set(b.recibo, r);
    }
  }
  let numero = Math.max(800, ...porNumero.keys());
  const avulso = (tipo: 'P' | 'R', pessoa: string, dia: string, valor: number, referente: string): ReciboExemplo => ({
    numero: ++numero, avulso: true, tipo, adiantamento: false, empresa: 1, pessoa, pessoaCodigo: codigoDe(pessoa), data: dia, principal: valor, juros: 0, multa: 0,
    desconto: 0, valor, usuario: 'FINANCEIRO', criadoEm: `${dia} 15:30`, conta: '', historico: '', titulos: [], conciliado: false, referente,
    cidade: documentoDe(pessoa)?.cidade ?? '',
  });
  const avulsos = [
    avulso('R', 'Maria Exemplo da Silva', '2026-11-18', 350, 'venda de sobras de madeira do pátio'),
    avulso('P', 'Carlos Diarista (sem cadastro)', '2026-11-21', 400, 'serviço de capina do pátio da fábrica'),
  ];
  return [...porNumero.values(), ...avulsos];
}

export const RECIBOS_EXEMPLO: ReciboExemplo[] = gerarRecibos();
export const reciboExemplo = (numero: string | number | undefined) => RECIBOS_EXEMPLO.find((r) => String(r.numero) === String(numero)) ?? null;

export type FiltroRecibos = { empresa: string; pessoa: string; de: string; ate: string; numero: string; titulo: string; tipo: string; situacao: string };
/** No Elevor o "de" do período vem com a data de hoje; aqui, 30 dias para trás, para a demonstração já abrir com recibos. */
export const filtroRecibosPadrao = (dia = hoje()): FiltroRecibos => ({ empresa: '', pessoa: '', de: maisDias(dia, -30), ate: '', numero: '', titulo: '', tipo: '', situacao: 'normal' });
export const TIPOS_RECIBO = [{ valor: '', rotulo: 'Todos' }, { valor: 'P', rotulo: 'Pagar' }, { valor: 'R', rotulo: 'Receber' }, { valor: 'A', rotulo: 'Acerto Fin.' },
  { valor: 'D', rotulo: 'Devolução' }, { valor: 'C', rotulo: 'Crédito/Adto' }];
export const SITUACOES_RECIBO = [{ valor: 'normal', rotulo: 'Normal' }, { valor: 'cancelado', rotulo: 'Cancelados' }, { valor: '', rotulo: 'Todos' }];
export const PESSOAS_RECIBOS = [...new Set(RECIBOS_EXEMPLO.map((r) => r.pessoa))].sort();

/** Consulta de Recibos (FN_Recibos): Acerto Fin. e Devolução não têm dado no ERP e Cancelados volta vazio (o ERP exclui, não
 * cancela), como no ERP do Samuel. Crédito/Adto = os recibos de adiantamentos. O mais novo primeiro. */
export function filtrarRecibos(f: FiltroRecibos) {
  const titulo = f.titulo.trim().toLowerCase();
  return RECIBOS_EXEMPLO.filter((r) => f.situacao !== 'cancelado'
    && (!f.tipo || (f.tipo === 'C' ? r.adiantamento : f.tipo === r.tipo && !r.adiantamento))
    && (!f.empresa || r.empresa === Number(f.empresa)) && (!f.pessoa || r.pessoa === f.pessoa)
    && (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate) && (!f.numero.trim() || String(r.numero) === f.numero.trim())
    && (!titulo || r.titulos.some((t) => t.numero.toLowerCase().includes(titulo))))
    .sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero);
}
