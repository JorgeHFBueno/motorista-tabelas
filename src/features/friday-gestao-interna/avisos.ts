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

/** Texto gravado no aviso (até 300 caracteres, como no protótipo). */
export function textoDoAviso(texto: string, nome: (uid: string) => string | undefined): string {
  return `mencionou você: ${textoSemMarcas(texto, nome).trim()}`.slice(0, 300);
}
