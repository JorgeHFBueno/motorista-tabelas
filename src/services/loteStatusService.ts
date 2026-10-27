/**
 * Status de um LOTE (obras-v2/{contrato}.lotes.{lote}.status), gravado pela Function do Friday `fridayCadastroGravar`
 * pelo registro oficial: o quadro GESTÃO DE OBRAS é o cadastro de obras-v2. Os textos são os rótulos da coluna Status
 * dos subitens no Friday.
 */
export type LoteStatusCode = 'EM_ANDAMENTO' | 'FINALIZADO' | 'PARADA' | 'PROXIMA_A_INICIAR' | 'REVISAR_ESCOPO' | 'NAO_INICIADA';
export type LoteStatus = { code: LoteStatusCode; label: string };
export const LOTE_STATUS_OPTIONS: readonly LoteStatus[] = [
  { code: 'EM_ANDAMENTO', label: 'Em andamento' }, { code: 'FINALIZADO', label: 'Finalizado' },
  { code: 'PARADA', label: 'Parada' }, { code: 'PROXIMA_A_INICIAR', label: 'Próxima a Iniciar' },
  { code: 'REVISAR_ESCOPO', label: 'Revisar escopo' }, { code: 'NAO_INICIADA', label: 'Não iniciada' },
] as const;

/** Visual mapping for the CronoObra LOTE status control. Keep labels sourced from the options above. */
export const LOTE_STATUS_COLORS: Readonly<Record<string, string>> = {
  'Finalizado': '#33D391',
  'Em andamento': '#FDBC64',
  'Parada': '#E8697D',
  'Não iniciada': '#797E93',
  'Próxima a Iniciar': '#339ECD',
  'Revisar escopo': '#B57DE3',
};
export const LOTE_STATUS_FALLBACK_COLOR = '#E5E7EB';
export const loteStatusColor = (label: string) => LOTE_STATUS_COLORS[label] ?? LOTE_STATUS_FALLBACK_COLOR;
const byCode = new Map(LOTE_STATUS_OPTIONS.map((status) => [status.code, status]));
const byLabel = new Map(LOTE_STATUS_OPTIONS.map((status) => [status.label, status]));
export const loteStatusFromCode = (code: LoteStatusCode) => byCode.get(code)!;
export const loteStatusFromLabel = (label: string) => byLabel.get(label) ?? null;
export class LoteStatusRequestError extends Error {}

type GravarPeloRegistro = { op: 'valor'; registro: { colecao: 'obras-v2'; id: string; sub: string }; campo: 'status'; texto: string };
// O Firebase só é carregado na gravação: o resto deste módulo (opções, cores) é usado em testes de domínio no Node.
// As Functions do Friday vêm de funcoes.ts, que liga o emulador de Functions quando os emuladores estão ligados.
const gravar = async (data: GravarPeloRegistro) => {
  const [{ httpsCallable }, { functions }] = await Promise.all([import('firebase/functions'), import('../features/friday-gestao-interna/funcoes')]);
  return httpsCallable<GravarPeloRegistro, { ok?: boolean; valor?: unknown }>(functions, 'fridayCadastroGravar')(data);
};

const mensagem = (cause: unknown) => {
  const code = (cause as { code?: unknown })?.code;
  if (code === 'functions/unauthenticated') return 'Faça login para atualizar o Status.';
  if (code === 'functions/permission-denied') return 'Você não possui permissão para atualizar o Status.';
  if (code === 'functions/failed-precondition' || code === 'functions/invalid-argument') return `Não foi possível atualizar o Status: ${(cause as Error).message}`;
  return 'Não foi possível atualizar o Status.';
};

/** Grava o Status e devolve o que ficou gravado em obras-v2. */
export async function updateLoteStatus(contratoId: string, loteId: string, novoStatus: LoteStatusCode, call: (data: GravarPeloRegistro) => Promise<{ data: { valor?: unknown } }> = gravar): Promise<LoteStatus> {
  const pedido = loteStatusFromCode(novoStatus);
  let resposta: { data: { valor?: unknown } };
  try { resposta = await call({ op: 'valor', registro: { colecao: 'obras-v2', id: contratoId, sub: loteId }, campo: 'status', texto: pedido.label }); }
  catch (cause) { throw new LoteStatusRequestError(mensagem(cause)); }
  const gravado = typeof resposta.data?.valor === 'string' ? loteStatusFromLabel(resposta.data.valor) : null;
  if (!gravado) throw new LoteStatusRequestError('O Status foi enviado, mas a resposta não confirmou o valor gravado.');
  return gravado;
}
