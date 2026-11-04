// Documents, photos and installments of a portal contract (team side, adm2). Contract: The Manuscript,
// 01_FIRESTORE/COLECOES/portal.md. Pure: no Firebase here, so it can be tested in Node.
import { dataIsoValida, reaisParaCentavos, type ArquivoPortal, type PessoaRef } from './portalDominio';

// Same ids and labels the portal shows (portal/src/lib/documentos/documentos.ts and fotos/fotos.ts).
export const CATEGORIAS_DOCUMENTO = [
  { id: 'contratos', rotulo: 'Contratos' },
  { id: 'aditivos', rotulo: 'Aditivos' },
  { id: 'projetos', rotulo: 'Projetos' },
  { id: 'art_rrt', rotulo: 'ART / RRT' },
  { id: 'licencas', rotulo: 'Licenças' },
  { id: 'notas_fiscais', rotulo: 'Notas Fiscais' },
  { id: 'relatorios', rotulo: 'Relatórios' },
] as const;

export const rotuloCategoria = (id: string) => CATEGORIAS_DOCUMENTO.find((item) => item.id === id)?.rotulo ?? 'Outros';

export const ETAPAS_FOTO = [
  { id: 'fundacao', rotulo: 'Fundação' },
  { id: 'estrutura', rotulo: 'Estrutura' },
  { id: 'cobertura', rotulo: 'Cobertura' },
  { id: 'fechamento', rotulo: 'Fechamento' },
] as const;

export const rotuloEtapa = (id: string) => ETAPAS_FOTO.find((item) => item.id === id)?.rotulo ?? 'Outra';

export const STATUS_PARCELA = ['pendente', 'comprovante_enviado', 'pago', 'rejeitado'] as const;
export type StatusParcela = (typeof STATUS_PARCELA)[number];

export const ROTULOS_STATUS_PARCELA: Record<StatusParcela, string> = {
  pendente: 'Pendente',
  comprovante_enviado: 'Comprovante enviado',
  pago: 'Pago',
  rejeitado: 'Rejeitado',
};

/** Unknown values read as 'pendente', as the portal does. */
export const lerStatusParcela = (valor: unknown): StatusParcela =>
  STATUS_PARCELA.includes(valor as StatusParcela) ? (valor as StatusParcela) : 'pendente';

// ---------------------------------------------------------------- reading Firestore data (lenient)

export const lerTexto = (valor: unknown) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);

export function lerArquivo(valor: unknown): ArquivoPortal | null {
  if (!valor || typeof valor !== 'object') return null;
  const dados = valor as Record<string, unknown>;
  if (typeof dados.path !== 'string' || !dados.path) return null;
  return {
    path: dados.path,
    nome: lerTexto(dados.nome) ?? dados.path.split('/').pop() ?? 'arquivo',
    contentType: lerTexto(dados.contentType) ?? '',
    bytes: typeof dados.bytes === 'number' ? dados.bytes : 0,
  };
}

export function lerPessoa(valor: unknown): PessoaRef | null {
  if (!valor || typeof valor !== 'object') return null;
  const dados = valor as Record<string, unknown>;
  return typeof dados.uid === 'string' ? { uid: dados.uid, nome: lerTexto(dados.nome) ?? '' } : null;
}

/** Firestore Timestamp (anything with toDate) -> Date; null otherwise. */
export function lerData(valor: unknown): Date | null {
  const comToDate = valor as { toDate?: () => Date } | null | undefined;
  return typeof comToDate?.toDate === 'function' ? comToDate.toDate() : null;
}

// ---------------------------------------------------------------- trash and display

/** Items outside the trash (lixeira false) or in it (lixeira true). */
export const filtrarLixeira = <T extends { excluidoEm: Date | null }>(itens: T[], lixeira: boolean) =>
  itens.filter((item) => (item.excluidoEm !== null) === lixeira);

export const ehImagem = (contentType: string) => contentType.toLowerCase().startsWith('image/');
export const ehPdfOuImagem = (contentType: string) => contentType.toLowerCase() === 'application/pdf' || ehImagem(contentType);

export function formatarBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export const formatarDataHora = (data: Date | null) =>
  data ? data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** Our own validation messages are shown as they are; Firebase errors (with a code) get the given text. */
export function mensagemDeErro(erro: unknown, padrao: string): string {
  if (erro && typeof erro === 'object' && 'code' in erro) return padrao;
  return erro instanceof Error && erro.message ? erro.message : padrao;
}

// ---------------------------------------------------------------- installments

export type FormParcela = { numero: string; descricao: string; valor: string; vencimento: string; observacaoAdmin: string };

/** Fields adm2 types: valor in cents, vencimento 'AAAA-MM-DD', empty texts as null. */
export type DadosParcela = { numero: number; descricao: string | null; valor: number; vencimento: string; observacaoAdmin: string | null };

const dataReal = (valor: string) => {
  if (!dataIsoValida(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
};

export function validarFormParcela(form: FormParcela): { ok: true; dados: DadosParcela } | { ok: false; erro: string } {
  const numeroTexto = form.numero.trim();
  const numero = /^\d+$/.test(numeroTexto) ? Number(numeroTexto) : 0;
  if (!Number.isSafeInteger(numero) || numero < 1) return { ok: false, erro: 'Informe o número da parcela (inteiro, a partir de 1).' };
  const valor = reaisParaCentavos(form.valor);
  if (valor === null || valor <= 0) return { ok: false, erro: 'Informe o valor em reais, por exemplo 1.234,56.' };
  const vencimento = form.vencimento.trim();
  if (!dataReal(vencimento)) return { ok: false, erro: 'Informe a data de vencimento.' };
  return {
    ok: true,
    dados: { numero, descricao: lerTexto(form.descricao), valor, vencimento, observacaoAdmin: lerTexto(form.observacaoAdmin) },
  };
}

type ParcelaParaResumo = { numero: number; valor: number; status: StatusParcela; excluidoEm: Date | null };

/** Next number after the highest installment outside the trash. */
export const proximoNumeroParcela = (parcelas: ParcelaParaResumo[]) =>
  filtrarLixeira(parcelas, false).reduce((maior, parcela) => Math.max(maior, parcela.numero), 0) + 1;

export type ResumoParcelas = {
  valorContrato: number | null;
  somaParcelas: number;
  totalContrato: number; // valorContrato, or the sum of the installments when it is not informed (as the portal shows)
  pago: number;
  emAberto: number;
  quantidade: number;
  pagas: number;
  aConferir: number;
  diferenca: number | null; // valorContrato - somaParcelas; null without valorContrato
};

/** Totals in cents of the installments outside the trash. */
export function resumirParcelas(parcelas: ParcelaParaResumo[], valorContrato: number | null): ResumoParcelas {
  const ativas = filtrarLixeira(parcelas, false);
  const somaParcelas = ativas.reduce((acc, parcela) => acc + parcela.valor, 0);
  const pagas = ativas.filter((parcela) => parcela.status === 'pago');
  const pago = pagas.reduce((acc, parcela) => acc + parcela.valor, 0);
  const totalContrato = typeof valorContrato === 'number' ? valorContrato : somaParcelas;
  return {
    valorContrato: typeof valorContrato === 'number' ? valorContrato : null,
    somaParcelas,
    totalContrato,
    pago,
    emAberto: Math.max(totalContrato - pago, 0),
    quantidade: ativas.length,
    pagas: pagas.length,
    aConferir: ativas.filter((parcela) => parcela.status === 'comprovante_enviado').length,
    diferenca: typeof valorContrato === 'number' ? valorContrato - somaParcelas : null,
  };
}
