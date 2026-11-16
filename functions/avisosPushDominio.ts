// Regras puras do push dos avisos do sistema (sem Firebase; teste em test/avisosPush.test.mjs).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md.
type AnyRecord = Record<string, any>;

/** App que mostra o aviso: os do portal abrem no portal; os demais, na WEB interna. */
export const appDoAviso = (aviso: AnyRecord) => (aviso.area === 'portal' ? 'portal' : 'interno');

/** Endereço que o clique na notificação abre: a rota do aviso (só caminho do próprio app) com ?aviso=<id>, para marcar como lido. */
export function urlDoAviso(avisoId: string, rota: unknown): string {
  const base = typeof rota === 'string' && rota.startsWith('/') && !rota.startsWith('//') ? rota : '/';
  const [caminho, hash = ''] = base.split('#');
  return `${caminho}${caminho.includes('?') ? '&' : '?'}aviso=${encodeURIComponent(avisoId)}${hash ? `#${hash}` : ''}`;
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Dados do push (FCM só aceita textos): título com quem gerou, quando houver, como no sino. */
export function dadosDoPush(avisoId: string, aviso: AnyRecord): Record<string, string> {
  const de = texto(aviso.deNome, 120);
  const titulo = texto(aviso.titulo, 200) || 'Aviso';
  return {
    avisoId,
    titulo: de ? `${de} ${titulo}` : titulo,
    mensagem: texto(aviso.mensagem, 300),
    url: urlDoAviso(avisoId, aviso.rota),
  };
}

/** Aparelhos que recebem: os do mesmo app do aviso, com token. */
export function aparelhosDoAviso(aviso: AnyRecord, dispositivos: { id: string; data: AnyRecord }[]): { id: string; token: string }[] {
  const app = appDoAviso(aviso);
  return dispositivos
    .filter(d => d.data.app === app && typeof d.data.token === 'string' && d.data.token !== '')
    .map(d => ({ id: d.id, token: d.data.token as string }));
}

/** Erros do FCM que dizem que o aparelho não existe mais (o registro é apagado). */
const MORTOS = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);
export const aparelhoMorto = (codigo: unknown) => typeof codigo === 'string' && MORTOS.has(codigo);
