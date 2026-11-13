// Avisos de menção (@) do Friday, gravados no sino do sistema (avisos/{uid}/itens). Regras puras, sem Firebase; teste
// em tests/friday-avisos.test.ts. O sino e o painel são do sistema (components/BotaoAvisos.tsx, services/avisosCore.ts).

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

/**
 * Marcados que não veem o quadro do item (restrito, fora da lista de acesso e sem adm2). Eles recebem o aviso com o
 * trecho, mas não abrem o item; quem escreve é avisado antes de publicar (decisão do responsável de 2026-11-12).
 */
export function marcadosSemAcesso(quadro: Record<string, unknown> | null | undefined,marcados: { id: string; adm2?: boolean }[]): string[] {
  if (!quadro || Number(quadro.restrito) !== 1) return [];
  const lista = new Set(Array.isArray(quadro.acesso) ? quadro.acesso.map(String) : []);
  return [...new Set(marcados.filter(m => !m.adm2 && !lista.has(m.id)).map(m => m.id))];
}

/**
 * Aviso de menção, sem o criadoEm (hora do servidor, posta na gravação). Título com o item, trecho de até 300
 * caracteres com as marcas trocadas por nomes, o quadro como local e a rota do item na aba Atualizações.
 */
export function avisoDeMencao(a: {
  quadroId: unknown; itemId: unknown; itemNome: unknown; quadroNome: unknown; atualizacaoId: unknown; texto: string;
  deUid: string; deNome: string; nome: (uid: string) => string | undefined;
}) {
  const item = typeof a.itemNome === 'string' && a.itemNome.trim() ? a.itemNome.trim() : 'um item';
  const local = typeof a.quadroNome === 'string' && a.quadroNome.trim() ? a.quadroNome.trim().slice(0, 200) : null;
  return {
    area: 'friday', tipo: 'mencao',
    titulo: `mencionou você em ${item}`.slice(0, 200),
    mensagem: textoSemMarcas(a.texto, a.nome).trim().slice(0, 300),
    rota: a.quadroId != null ? `/friday/quadros/${a.quadroId}?item=${a.itemId}&aba=atualizacoes` : '/friday/',
    local, deUid: a.deUid, deNome: a.deNome,
    origem: { colecao: 'friday-atualizacoes', id: String(a.atualizacaoId) },
    lida: false,
  };
}
