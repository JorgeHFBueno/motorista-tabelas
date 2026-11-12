// Avisos do sino (menções com @). Regras puras, sem Firebase; teste em tests/friday-avisos.test.ts.

/** Texto da atualização com as marcas @{uid} trocadas por @Nome. */
export function textoSemMarcas(texto: string, nome: (uid: string) => string | undefined): string {
  return texto.replace(/@\{([^{}\s]+)\}/g, (_m, uid: string) => `@${nome(uid) ?? 'alguém'}`);
}

/**
 * Quem recebe o aviso de menção: cada pessoa marcada uma vez, sem quem escreveu e sem quem não pode receber (não entra
 * no Friday). Na edição, `antes` tem as marcas anteriores: só quem foi marcado agora recebe.
 */
export function destinatariosDaMencao(a: { marcados: unknown; antes?: unknown; autor: string; podeReceber: (uid: string) => boolean }): string[] {
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const ja = new Set(lista(a.antes));
  return [...new Set(lista(a.marcados))].filter(uid => uid && uid !== a.autor && !ja.has(uid) && a.podeReceber(uid));
}

const PREFIXO = 'mencionou você: ';

/** Texto gravado no aviso (até 300 caracteres, como no protótipo). */
export function textoDoAviso(texto: string, nome: (uid: string) => string | undefined): string {
  return `${PREFIXO}${textoSemMarcas(texto, nome).trim()}`.slice(0, 300);
}

/** Trecho da atualização guardado no aviso, sem o "mencionou você:" do começo. */
export function trechoDoAviso(texto: unknown): string {
  const t = String(texto ?? '');
  return (t.startsWith(PREFIXO) ? t.slice(PREFIXO.length) : t).trim();
}

// ---------------------------------------------------------------- painel do sino
export type Periodo = 'Hoje' | 'Últimos 7 dias' | 'Mais antigos';
const PERIODOS: Periodo[] = ['Hoje', 'Últimos 7 dias', 'Mais antigos'];

/** Período do aviso, pela data local "AAAA-MM-DD HH:MM:SS" de criado_em: hoje, nos 6 dias antes de hoje ou antes disso. */
export function periodoDoAviso(criadoEm: unknown, agora: Date): Periodo {
  const d = new Date(String(criadoEm ?? '').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return 'Mais antigos';
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (d >= inicioHoje) return 'Hoje';
  const inicioSemana = new Date(inicioHoje);
  inicioSemana.setDate(inicioHoje.getDate() - 6);
  return d >= inicioSemana ? 'Últimos 7 dias' : 'Mais antigos';
}

/** Avisos em grupos por período, na ordem Hoje, Últimos 7 dias, Mais antigos; grupos vazios ficam de fora. */
export function agruparAvisos<T>(lista: T[], agora: Date, criadoEm: (n: T) => unknown): { periodo: Periodo; avisos: T[] }[] {
  return PERIODOS.map(periodo => ({ periodo, avisos: lista.filter(n => periodoDoAviso(criadoEm(n), agora) === periodo) })).filter(g => g.avisos.length);
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca do sino: todas as palavras do termo, sem acento nem maiúsculas, em algum dos textos do aviso (pessoa, item, quadro, trecho). */
export function filtrarAvisos<T>(lista: T[], termo: string, textos: (n: T) => unknown[]): T[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return lista;
  return lista.filter(n => {
    const alvo = normalizar(textos(n).filter(x => x != null).join(' '));
    return palavras.every(p => alvo.includes(p));
  });
}
